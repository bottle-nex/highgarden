import {
  ClobClient,
  Chain,
  OrderType,
  Side as PolySide,
  type ApiKeyCreds,
} from "@polymarket/clob-client-v2";
import { Wallet, providers, Contract } from "ethers";
import { type LoggerLike, type PolymarketClientConfig, noop_logger } from "./config";
import { RetryableError, UnrecoverableError } from "./errors";
import type {
  BookTop,
  GammaResolution,
  PlaceMarketOrderInput,
  PlaceMarketOrderResult,
  RedeemOutcome,
} from "./types";

// ──────────────── Polygon constants (CTF redemption) ────────────────

/** Polymarket / Gnosis Conditional Tokens Framework on Polygon mainnet. */
const CONDITIONAL_TOKENS_ADDRESS = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";

/** Bridged USDC.e — Polymarket's collateral. NOT native USDC. */
const USDC_E_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";

/** For binary YES/NO markets the parent collection is the zero hash. */
const PARENT_COLLECTION_ID = "0x0000000000000000000000000000000000000000000000000000000000000000";

/** Index sets for binary CTF: 1 = YES (slot 0), 2 = NO (slot 1). Both =
 *  "redeem whichever side resolved." */
const BINARY_INDEX_SETS = [1, 2] as const;

const CTF_ABI = [
  "function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets)",
] as const;

/**
 * Polymarket SignatureType — EOA=0, POLY_PROXY=1, POLY_GNOSIS_SAFE=2.
 * Funder addresses managed by Polymarket's onboarding resolve to a
 * minimal-proxy meta-tx wallet (the `proxy(bytes)` contract), not a Gnosis
 * Safe — so type 1.
 */
const POLY_PROXY = 1;

interface RawGammaMarket {
  id?: string | number;
  closed?: boolean;
  archived?: boolean;
  active?: boolean;
  outcomes?: string;
  outcomePrices?: string;
  endDate?: string;
  umaEndDate?: string;
  resolvedBy?: string | null;
  conditionId?: string | null;
  negRisk?: boolean;
}

// ──────────────── PolymarketClient ────────────────

/**
 * Single facade over every Polymarket-related external surface: public REST
 * endpoints, the authenticated CLOB client, the Gamma resolution metadata,
 * and the Polygon CTF contract for redemption.
 *
 * Resource lifecycles are lazy: the CLOB client is constructed on the first
 * `place_market_order` call, and the Polygon signer is constructed on the
 * first `redeem_positions` call. Reads (`get_top_of_book`, `get_book`,
 * gamma) hit the public REST surface directly and require no credentials.
 *
 * Dry-run mode: if any CLOB credential is missing, the client logs a warning
 * once and `place_market_order` returns a synthetic "fully filled" result
 * without contacting Polymarket. Reads stay live regardless. This is the
 * mode used in dev / on machines without secrets.
 */
export class PolymarketClient {
  private readonly cfg: PolymarketClientConfig;
  private readonly log: LoggerLike;
  private clob_client: ClobClient | null = null;
  private polygon_provider: providers.JsonRpcProvider | null = null;
  private polygon_signer: Wallet | null = null;
  private dry_run_cached: boolean | null = null;
  private dry_run_warned = false;

  constructor(config: PolymarketClientConfig) {
    this.cfg = config;
    this.log = config.logger ?? noop_logger;
  }

  // ──────────────── Public REST (no auth) ────────────────

  /**
   * Fetches the raw orderbook for a CLOB token id via the public REST
   * endpoint. The hot path uses {@link get_top_of_book} instead.
   */
  public async get_book(token_id: string): Promise<unknown> {
    const url = `${this.cfg.restUrl}/book?token_id=${token_id}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`polymarket book ${res.status} for token ${token_id}`);
    }
    return res.json();
  }

  /**
   * Fetches market metadata from Polymarket's Gamma API. For typed resolution
   * use {@link fetch_resolution} which post-processes this payload.
   */
  public async get_market(condition_id: string): Promise<unknown> {
    const url = `${this.cfg.gammaUrl}/markets/${condition_id}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`gamma market ${res.status} for condition ${condition_id}`);
    }
    return res.json();
  }

  // ──────────────── CLOB authenticated ────────────────

  /**
   * True when CLOB credentials are missing. In that case
   * {@link place_market_order} returns a synthetic fill instead of hitting
   * Polymarket. The first dry-run probe logs a warning so the operator
   * doesn't ship to prod without creds by accident.
   */
  public is_dry_run(): boolean {
    if (this.dry_run_cached !== null) return this.dry_run_cached;
    const creds_present =
      !!this.cfg.privateKey &&
      !!this.cfg.funderAddress &&
      !!this.cfg.apiKey &&
      !!this.cfg.apiSecret &&
      !!this.cfg.apiPassphrase;
    this.dry_run_cached = !creds_present;
    if (this.dry_run_cached && !this.dry_run_warned) {
      this.dry_run_warned = true;
      this.log.warn(
        {},
        "polymarket credentials missing — running in DRY-RUN mode. Hedge orders will be logged but NOT placed.",
      );
    }
    return this.dry_run_cached;
  }

  /**
   * Returns top of book in integer-cents from Polymarket's public REST
   * `/book` endpoint. No credentials required — reading the orderbook is
   * unauthenticated, even when `place_market_order` is in dry-run.
   */
  public async get_top_of_book(token_id: string): Promise<BookTop> {
    const url = `${this.cfg.restUrl}/book?token_id=${token_id}`;
    let res: Response;
    try {
      res = await fetch(url);
    } catch (err) {
      throw new RetryableError(
        `polymarket book fetch failed for token ${token_id}: ${(err as Error).message}`,
        err,
      );
    }
    if (!res.ok) {
      throw new RetryableError(
        `polymarket book ${res.status} for token ${token_id}`,
      );
    }
    const body = (await res.json()) as {
      bids?: { price: string; size: string }[];
      asks?: { price: string; size: string }[];
    };
    if (!Array.isArray(body?.bids) || !Array.isArray(body?.asks)) {
      throw new RetryableError(
        `polymarket book malformed for token ${token_id}`,
      );
    }
    return this.shape_top({ bids: body.bids, asks: body.asks });
  }

  /**
   * Places an immediate-or-cancel (FAK) order on Polymarket. Returns the
   * filled portion plus average price; the caller decides whether a partial
   * fill warrants retry or accepts the partial.
   *
   * Error classification: messages matching "invalid signature", "not
   * allowed", "forbidden", "invalid token", or "blocked" map to
   * {@link UnrecoverableError} (don't retry); everything else becomes
   * {@link RetryableError}.
   *
   * Dollar / share semantics:
   *   BUY  → maker side = USDC,   taker side = shares  (amount = shares × price)
   *   SELL → maker side = shares, taker side = USDC    (amount = shares)
   */
  public async place_market_order(input: PlaceMarketOrderInput): Promise<PlaceMarketOrderResult> {
    if (this.is_dry_run()) return this.simulate_dry_run(input);
    const payload = this.build_order_payload(input);
    const options = this.build_order_options(input);
    try {
      const resp = await this.get_clob_client().createAndPostMarketOrder(
        payload,
        options,
        OrderType.FAK,
      );
      return this.interpret_order_response(resp, input);
    } catch (err) {
      throw this.classify_order_error(err);
    }
  }

  // ──────────────── Gamma resolution detection ────────────────

  /**
   * Pulls the gamma payload for one market and shapes it into a typed
   * {@link GammaResolution}. Returns null only when gamma itself returned no
   * row; a present-but-unresolved market returns a non-null resolution with
   * `closed=false`.
   *
   * Win detection is conservative: we require unanimous final prices (one
   * outcome at 1.0, the other at 0.0). Ambiguous payouts return
   * `winningOutcomeIndex=null`.
   */
  public async fetch_resolution(polymarket_market_id: string): Promise<GammaResolution | null> {
    const raw = await this.fetch_raw_gamma_market(polymarket_market_id);
    if (!raw) return null;
    return this.shape_resolution(raw);
  }

  // ──────────────── Polygon CTF redemption ────────────────

  /** True when both Polygon RPC and a private key are configured. */
  public is_redeem_configured(): boolean {
    return !!this.cfg.polygonRpcUrl && !!this.cfg.privateKey;
  }

  /**
   * Calls `redeemPositions` on the Polygon CTF contract for one resolved
   * market. Walks the gamma resolution first to learn the `conditionId` and
   * to bail with a typed reason when the market is unredeemable.
   */
  public async redeem_positions(polymarket_market_id: string): Promise<RedeemOutcome> {
    const resolution = await this.fetch_resolution(polymarket_market_id);
    if (!resolution || !resolution.closed || resolution.winningOutcomeIndex === null) {
      return { kind: "skipped_not_resolved" };
    }
    if (resolution.negRisk) {
      this.log.warn(
        { polymarket_market_id },
        "NegRisk market — redemption uses a different contract; skipping",
      );
      return { kind: "skipped_neg_risk" };
    }
    if (!resolution.conditionId) {
      this.log.warn(
        { polymarket_market_id },
        "gamma did not return conditionId for resolved market",
      );
      return { kind: "skipped_no_condition_id" };
    }
    return this.send_redeem(resolution.conditionId, polymarket_market_id);
  }

  // ──────────────── Internals: CLOB ────────────────

  /**
   * Lazily constructs the authenticated CLOB client. Throws if called in
   * dry-run mode — callers should always check {@link is_dry_run} first.
   */
  private get_clob_client(): ClobClient {
    if (this.is_dry_run()) {
      throw new Error("get_clob_client called in dry-run mode");
    }
    if (!this.clob_client) {
      const provider = this.cfg.polygonRpcUrl
        ? new providers.JsonRpcProvider(this.cfg.polygonRpcUrl)
        : undefined;
      const wallet = new Wallet(this.cfg.privateKey!, provider);
      const creds: ApiKeyCreds = {
        key: this.cfg.apiKey!,
        secret: this.cfg.apiSecret!,
        passphrase: this.cfg.apiPassphrase!,
      };
      this.clob_client = new ClobClient({
        host: this.cfg.restUrl,
        chain: Chain.POLYGON,
        signer: wallet,
        creds,
        signatureType: POLY_PROXY,
        funderAddress: this.cfg.funderAddress,
      });
    }
    return this.clob_client;
  }

  private simulate_dry_run(input: PlaceMarketOrderInput): PlaceMarketOrderResult {
    this.log.info(
      {
        clientOrderId: input.clientOrderId,
        tokenId: input.tokenId,
        side: input.side,
        size: input.sizeShares,
        priceCents: input.priceCents,
      },
      "DRY-RUN: would place Polymarket FAK order",
    );
    return {
      polymarketOrderId: `dryrun-${input.clientOrderId}`,
      filledShares: input.sizeShares,
      avgPriceCents: input.priceCents,
      fullyFilled: true,
    };
  }

  private build_order_payload(input: PlaceMarketOrderInput) {
    const price_decimal = input.priceCents / 100;
    const dollar_amount =
      input.side === "BUY"
        ? Math.round(input.sizeShares * price_decimal * 100) / 100
        : input.sizeShares;
    return {
      tokenID: input.tokenId,
      price: price_decimal,
      amount: dollar_amount,
      side: input.side === "BUY" ? PolySide.BUY : PolySide.SELL,
    };
  }

  private build_order_options(input: PlaceMarketOrderInput) {
    return {
      tickSize: input.tickSize as "0.1" | "0.01" | "0.001" | "0.0001",
      negRisk: input.negRisk,
    };
  }

  private interpret_order_response(
    resp: unknown,
    input: PlaceMarketOrderInput,
  ): PlaceMarketOrderResult {
    const r = resp as {
      success?: boolean;
      errorMsg?: string;
      orderID?: string;
      takingAmount?: string;
      makingAmount?: string;
      status?: string;
    };
    if (r.success === false || r.errorMsg) {
      throw new RetryableError(r.errorMsg ?? "polymarket order rejected");
    }

    this.log.debug(
      {
        side: input.side,
        priceCentsCap: input.priceCents,
        requestedShares: input.sizeShares,
        makingAmount: r.makingAmount,
        takingAmount: r.takingAmount,
        status: r.status,
        orderID: r.orderID,
      },
      "polymarket order response (raw amounts)",
    );

    const filled_shares = this.compute_filled_shares(r, input);
    const avg_price_cents = this.compute_avg_price(r, input, filled_shares);
    const fully_filled = filled_shares >= input.sizeShares;

    return {
      polymarketOrderId: r.orderID ?? null,
      filledShares: filled_shares,
      avgPriceCents: avg_price_cents,
      fullyFilled: fully_filled,
      raw: resp,
    };
  }

  /**
   * Polymarket order semantics:
   *   BUY  → maker = USDC,   taker = shares
   *   SELL → maker = shares, taker = USDC
   * makingAmount / takingAmount report the FILLED portion of each side in
   * human units (e.g. "1.0" for 1 share, "0.17" for 17¢).
   */
  private compute_filled_shares(
    resp: { takingAmount?: string; makingAmount?: string },
    input: PlaceMarketOrderInput,
  ): number {
    const shares_str = input.side === "BUY" ? resp.takingAmount : resp.makingAmount;
    const num = Number(shares_str ?? 0);
    return Number.isFinite(num) && num > 0 ? Math.floor(num) : 0;
  }

  private compute_avg_price(
    resp: { takingAmount?: string; makingAmount?: string },
    input: PlaceMarketOrderInput,
    filled_shares: number,
  ): number | null {
    if (filled_shares === 0) return null;
    const usdc_str = input.side === "BUY" ? resp.makingAmount : resp.takingAmount;
    const usdc = Number(usdc_str ?? 0);
    if (!Number.isFinite(usdc) || usdc <= 0) return input.priceCents;
    return Math.round((usdc / filled_shares) * 100);
  }

  private classify_order_error(err: unknown): Error {
    const msg = (err as Error)?.message ?? String(err);
    const lowered = msg.toLowerCase();
    const unrecoverable =
      lowered.includes("invalid signature") ||
      lowered.includes("not allowed") ||
      lowered.includes("forbidden") ||
      lowered.includes("invalid token") ||
      lowered.includes("blocked");
    return unrecoverable ? new UnrecoverableError(msg, err) : new RetryableError(msg, err);
  }

  private shape_top(summary: {
    bids: { price: string; size: string }[];
    asks: { price: string; size: string }[];
  }): BookTop {
    // Polymarket returns bids ascending and asks ascending; the top is the
    // last bid (highest) and the last ask (lowest crossing market).
    const top_bid = summary.bids[summary.bids.length - 1];
    const top_ask = summary.asks[summary.asks.length - 1];
    return {
      bestBidCents: top_bid ? Math.round(Number(top_bid.price) * 100) : null,
      bestAskCents: top_ask ? Math.round(Number(top_ask.price) * 100) : null,
      bestBidSize: top_bid ? Number(top_bid.size) : null,
      bestAskSize: top_ask ? Number(top_ask.size) : null,
    };
  }

  // ──────────────── Internals: Gamma ────────────────

  private async fetch_raw_gamma_market(market_id: string): Promise<RawGammaMarket | null> {
    // Use the direct path `/markets/<id>` instead of the list endpoint
    // `/markets?id=…` — gamma's list endpoint silently filters out
    // closed markets (no way to override that without an explicit
    // `closed=true`), which means our resolver poll returns null for
    // every market that has actually resolved and the auto-resolver
    // never fires. The direct path returns the market regardless of
    // closed/archived state.
    const url = new URL(`/markets/${encodeURIComponent(market_id)}`, this.cfg.gammaUrl);
    const res = await fetch(url);
    if (!res.ok) {
      this.log.warn({ market_id, status: res.status }, "gamma fetch returned non-ok");
      return null;
    }
    const body = (await res.json()) as RawGammaMarket[] | RawGammaMarket | null;
    if (!body) return null;
    if (Array.isArray(body)) return body[0] ?? null;
    return body;
  }

  private shape_resolution(raw: RawGammaMarket): GammaResolution {
    const outcomes = parse_string_array(raw.outcomes);
    const outcome_prices = parse_string_array(raw.outcomePrices);
    return {
      closed: !!raw.closed,
      archived: !!raw.archived,
      winningOutcomeIndex: this.derive_winner(outcome_prices, !!raw.closed),
      resolvedAt: this.derive_resolved_at(raw),
      outcomes,
      outcomePrices: outcome_prices,
      conditionId: raw.conditionId ?? null,
      negRisk: !!raw.negRisk,
    };
  }

  /**
   * Conservative winner detection. Only declares a winner when one outcome
   * is unambiguously 1.0 and the other is unambiguously 0.0.
   */
  private derive_winner(prices: string[], closed: boolean): 0 | 1 | null {
    if (!closed) return null;
    if (prices.length < 2) return null;
    const yes = parse_price(prices[0]);
    const no = parse_price(prices[1]);
    if (yes === null || no === null) return null;
    if (yes >= 0.999 && no <= 0.001) return 0;
    if (no >= 0.999 && yes <= 0.001) return 1;
    return null;
  }

  private derive_resolved_at(raw: RawGammaMarket): Date | null {
    if (!raw.closed) return null;
    const candidate = raw.umaEndDate ?? raw.endDate;
    if (!candidate) return null;
    const d = new Date(candidate);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  // ──────────────── Internals: Polygon CTF ────────────────

  private get_polygon_provider(): providers.JsonRpcProvider {
    if (!this.polygon_provider) {
      if (!this.cfg.polygonRpcUrl) {
        throw new Error("polygonRpcUrl is not set");
      }
      this.polygon_provider = new providers.JsonRpcProvider(this.cfg.polygonRpcUrl);
    }
    return this.polygon_provider;
  }

  private get_polygon_signer(): Wallet {
    if (!this.polygon_signer) {
      if (!this.cfg.privateKey) {
        throw new Error("privateKey is not set");
      }
      this.polygon_signer = new Wallet(this.cfg.privateKey, this.get_polygon_provider());
    }
    return this.polygon_signer;
  }

  private async send_redeem(
    condition_id: string,
    polymarket_market_id: string,
  ): Promise<RedeemOutcome> {
    const signer = this.get_polygon_signer();
    const ctf = new Contract(CONDITIONAL_TOKENS_ADDRESS, CTF_ABI, signer);
    this.log.info({ polymarket_market_id, condition_id }, "submitting redeemPositions on Polygon");
    const tx = await ctf["redeemPositions"]!(
      USDC_E_ADDRESS,
      PARENT_COLLECTION_ID,
      condition_id,
      BINARY_INDEX_SETS,
    );
    const receipt = await tx.wait(1);
    return { kind: "submitted", txHash: receipt.transactionHash ?? tx.hash };
  }
}

// ──────────────── Module-level helpers ────────────────

function parse_string_array(input: string | undefined | null): string[] {
  if (!input) return [];
  try {
    const parsed = JSON.parse(input);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((v) => String(v));
  } catch {
    return [];
  }
}

function parse_price(input: string | undefined): number | null {
  if (input === undefined) return null;
  const n = Number(input);
  return Number.isFinite(n) ? n : null;
}
