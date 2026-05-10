# Close runbook

How to wind down the contract permanently — drain USDC out of the treasury vault to the admin wallet, reclaim SOL rent from every account the program controls, and finally close the program itself.

This is a **one-way operation**. Once `solana program close` runs, the program ID can never be redeployed and any account still requiring a CPI signature from a program-owned PDA becomes permanently un-rescuable. Read every section before starting.

The runbook is structured as six phases, in strict order:

```
Phase A — Add wind-down instructions to the contract (Rust)
Phase B — Mirror them in packages/contract (TS SDK)
Phase C — Expose them via /admin endpoints (server + web)
Phase D — Pre-flight checks
Phase E — Upgrade the on-chain program with the new bytecode
Phase F — Pause / resolve / grace, then run the sweep, then close
```

Each phase gates the next. Don't skip ahead — the whole point is that every dollar of USDC and every lamport of rent is recoverable, and that requires the on-chain instructions, the TS SDK, and the admin UI all to land before any draining begins.

---

## 1. Why this needs an upgrade first

The current bytecode has **no admin-drain instruction** for the treasury vault and **no admin-force close instructions** for Config / Market / UserPosition / UsedNonce / treasury_vault PDAs. To recover:

- The USDC sitting in the treasury vault, you need an instruction that does `invoke_signed` `spl_token::transfer` with the `treasury_authority` PDA seeds.
- The SOL rent on every program-owned PDA, you need close instructions that drain lamports + `resize(0)` + reassign to system program (`utils::account::close_account` already exists; the new ix handlers just call it under admin authorization).
- The SOL rent on the treasury vault token account itself, you need a `spl_token::CloseAccount` CPI signed by `treasury_authority`.

None of those exist yet. They must be written, the TS SDK has to learn about them, the server has to expose them, and only **then** can the wind-down sweep run.

The program ID and all PDA addresses are unchanged across upgrades, so the new code can sign for the same `treasury_authority` PDA the original code created.

---

## 2. The critical ordering

Within Phase F, you must close in this order:

```
treasury USDC drained
     ↓
treasury_vault token account closed         ← needs treasury_authority PDA signing
     ↓
every UserPosition / UsedNonce / Market closed   ← needs program to be alive
     ↓
Config PDA closed                            ← needs program to be alive
     ↓
solana program close                         ← irreversible; no more CPIs after this
```

After `solana program close`, the program account is gone, so no Solana program can ever again `invoke_signed` with seeds derived under your old program ID. Any USDC or SOL still held by program-owned accounts at that moment becomes permanently orphaned — not even Solana's runtime can rescue it.

---

## 3. Phase A — Add wind-down instructions in Rust

Add these handlers under [apps/solana/programs/contract/src/instructions/](programs/contract/src/instructions/) and wire each into the dispatcher in [apps/solana/programs/contract/src/lib.rs](programs/contract/src/lib.rs). Every handler must be admin-gated — load `Config`, verify `config.admin == admin.key`, then act.

| Instruction | Snake name (for `ix_disc`) | Accounts (in order) | Behavior |
|---|---|---|---|
| `admin_drain_treasury` | `admin_drain_treasury` | `admin` (s,w), `config`, `treasury_vault` (mut), `treasury_authority` (PDA), `admin_usdc_ata` (mut, owner=admin, mint=config.usdc_mint), `token_program` | `spl_token::transfer` full vault balance → admin's USDC ATA, signed by `treasury_authority` PDA |
| `admin_close_treasury_vault` | `admin_close_treasury_vault` | `admin` (s,w), `config`, `treasury_vault` (mut), `treasury_authority` (PDA), `token_program` | `spl_token::close_account` on vault → SOL rent to admin, signed by `treasury_authority` PDA. **Vault balance must be 0.** |
| `admin_close_market` | `admin_close_market` | `admin` (s,w), `config`, `market` (mut) | `close_account(market, admin)` |
| `admin_close_position` | `admin_close_position` | `admin` (s,w), `config`, `user_position` (mut) | `close_account(user_position, admin)` — admin-force variant that skips the user-signature requirement of the existing `close_position` |
| `admin_close_config` | `admin_close_config` | `admin` (s,w), `config` (mut) | `close_account(config, admin)` |

Keep `close_used_nonce` (already admin-only) and the existing user-callable `close_position` (so users can self-close in the grace window of Phase F.3).

You can drop `place_order`, `create_market`, `resolve_market`, `claim`, `admin_pause_market`, `admin_unpause_market`, `initialize_config` from the dispatcher to shrink the binary and make it obvious the contract is in wind-down mode — but only if you're certain the grace window from Phase F.3 has fully closed. Safer default: leave them in for one upgrade, drop them in a second.

After writing the handlers, run a quick local validator smoke against each new ix to catch dispatcher mismatches before Phase E.

---

## 4. Phase B — Mirror the new instructions in `packages/contract`

[packages/contract](../../packages/contract) is hand-written; without this step the admin endpoints in Phase C have nothing to call. Apply the §6 procedure from [upgrade.md](upgrade.md), specifically:

1. **`packages/contract/src/serialize.ts`** — for each new ix, add an `encode_<name>_args(...)` function. All five wind-down ixs above take an empty args struct, so each is just `encode_empty_args()` — no per-ix encoder needed unless you pass parameters.
2. **`packages/contract/src/types.ts`** — add a `<Name>Params` interface for each new method's TS surface. Pattern after `AdminMarketParams`: `{ admin: PublicKey; signer?: Keypair; ...any extra accounts the handler needs }`. For `admin_drain_treasury` add `adminUsdcAta: PublicKey`; the rest take only `admin`.
3. **`packages/contract/src/client.ts`** — add one method per new ix on `SolmarketClient`. Pattern after `admin_set_paused`:

```ts
public async adminDrainTreasury(params: AdminDrainTreasuryParams): Promise<TransactionSignature> {
    const signer = this.resolve_signer(params.signer, params.admin, "adminDrainTreasury.admin");
    const ix = new TransactionInstruction({
        programId: this.programId,
        keys: [
            { pubkey: params.admin, isSigner: true, isWritable: true },
            { pubkey: this.configPda, isSigner: false, isWritable: false },
            { pubkey: this.treasuryVaultPda, isSigner: false, isWritable: true },
            { pubkey: this.treasuryAuthorityPda, isSigner: false, isWritable: false },
            { pubkey: params.adminUsdcAta, isSigner: false, isWritable: true },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data: Buffer.concat([ix_disc("admin_drain_treasury"), encode_empty_args()]),
    });
    return this.send_with_signers(new Transaction().add(ix), [signer]);
}
```

Repeat for `adminCloseTreasuryVault`, `adminCloseMarket`, `adminClosePosition`, `adminCloseConfig`. Each handler's account list in Phase A is the source of truth; mirror it position-by-position.

4. **`packages/contract/src/index.ts`** — re-export the new param interfaces.

Then typecheck the graph:

```sh
cd /Users/anjan/utility/Projects/solmarket/packages/contract && bunx tsc --noEmit
cd /Users/anjan/utility/Projects/solmarket/apps/server && bunx tsc --noEmit
cd /Users/anjan/utility/Projects/solmarket/apps/hedger && bunx tsc --noEmit
```

All three must exit `0` before moving on.

---

## 5. Phase C — Expose wind-down endpoints under `/admin`

Wind-down operations are large, irreversible, and must be auditable. Don't run them as ad-hoc bun scripts — wire them through the existing admin surface so each call has an HTTP request log and an authenticated user attached.

### 5.1 Server controllers

Create one controller per ix under [apps/server/controllers/admin/](../../apps/server/controllers/admin/), each calling the matching method on `SolmarketClient` via a new `SolanaWindDownService` (analogous to the existing `SolanaAdminService` at [service.solana-admin.ts](../../apps/server/services/service.solana-admin.ts)):

| File | Endpoint | Body |
|---|---|---|
| `controller.wind-pause-all.ts` | `POST /admin/wind/pause-all` | _(none)_ — pauses every market via existing `adminPauseMarket` |
| `controller.wind-resolve.ts` | `POST /admin/wind/resolve/:marketId` | `{ winningOutcome: 0 \| 1 }` |
| `controller.wind-drain-treasury.ts` | `POST /admin/wind/drain-treasury` | _(none)_ — calls `adminDrainTreasury` with the admin's USDC ATA derived server-side |
| `controller.wind-close-positions.ts` | `POST /admin/wind/close-positions` | `{ batchSize?: number }` — paginates over UserPositions and force-closes each |
| `controller.wind-close-nonces.ts` | `POST /admin/wind/close-nonces` | `{ batchSize?: number }` — drains expired UsedNonce PDAs (same shape as the existing `NonceSweeperService` but admin-triggered, no expiry filter) |
| `controller.wind-close-markets.ts` | `POST /admin/wind/close-markets` | _(none)_ — closes every Market PDA |
| `controller.wind-close-vault.ts` | `POST /admin/wind/close-vault` | _(none)_ — closes the treasury vault token account (must be drained first) |
| `controller.wind-close-config.ts` | `POST /admin/wind/close-config` | _(none)_ — final on-chain step before `solana program close` |
| `controller.wind-status.ts` | `GET /admin/wind/status` | _(none)_ — read-only inventory: vault USDC balance, count of each PDA type still alive, config PDA status |

All wind-down endpoints **must**:

- Require an authenticated admin (use the same `requireAuth` middleware as the existing admin routes).
- Refuse to act when `ENV.SERVER_SOLANA_ADMIN_KEYPAIR` isn't set.
- Be **idempotent at the request level** — closing an already-closed PDA must surface as `success: true, alreadyClosed: true`, not a 500. The on-chain `is_uninitialized` check handles the underlying behavior; the server just has to recognize the error and translate.
- Log every request and result (request id, target PDA, tx sig if any) at INFO so the wind-down has a paper trail.
- For batch endpoints, return per-item outcomes — caller must be able to see which PDAs succeeded and which need a retry.

Register the routes in [apps/server/routers/admin/router.admin.ts](../../apps/server/routers/admin/router.admin.ts):

```ts
import WindStatusController from "../../controllers/admin/controller.wind-status";
import WindPauseAllController from "../../controllers/admin/controller.wind-pause-all";
import WindResolveController from "../../controllers/admin/controller.wind-resolve";
import WindDrainTreasuryController from "../../controllers/admin/controller.wind-drain-treasury";
import WindClosePositionsController from "../../controllers/admin/controller.wind-close-positions";
import WindCloseNoncesController from "../../controllers/admin/controller.wind-close-nonces";
import WindCloseMarketsController from "../../controllers/admin/controller.wind-close-markets";
import WindCloseVaultController from "../../controllers/admin/controller.wind-close-vault";
import WindCloseConfigController from "../../controllers/admin/controller.wind-close-config";

admin_router.get("/wind/status", requireAuth, WindStatusController.process);
admin_router.post("/wind/pause-all", requireAuth, WindPauseAllController.process);
admin_router.post("/wind/resolve/:marketId", requireAuth, WindResolveController.process);
admin_router.post("/wind/drain-treasury", requireAuth, WindDrainTreasuryController.process);
admin_router.post("/wind/close-positions", requireAuth, WindClosePositionsController.process);
admin_router.post("/wind/close-nonces", requireAuth, WindCloseNoncesController.process);
admin_router.post("/wind/close-markets", requireAuth, WindCloseMarketsController.process);
admin_router.post("/wind/close-vault", requireAuth, WindCloseVaultController.process);
admin_router.post("/wind/close-config", requireAuth, WindCloseConfigController.process);
```

### 5.2 Web admin panel

Add a `WindDownPanel` under [apps/web/src/components/admin/](../../apps/web/src/components/admin/) with one button per endpoint, plus a status block fed by `GET /admin/wind/status`. Render the buttons in the **same order** they must execute. Each button must:

- Show a confirmation modal — "Drain $X USDC to admin wallet `<pubkey>`. This is irreversible. Type `DRAIN` to confirm."
- Disable itself until the previous step's status block reports complete.
- Display the resulting tx signature (or per-item summary for batch ops) inline.

Mount the panel in [apps/web/src/components/admin/AdminPanel.tsx](../../apps/web/src/components/admin/AdminPanel.tsx) behind a feature flag (`NEXT_PUBLIC_ENABLE_WIND_DOWN`) so it's invisible until the wind-down window opens.

### 5.3 Typecheck and lint everything

```sh
cd /Users/anjan/utility/Projects/solmarket/apps/server && bunx tsc --noEmit
cd /Users/anjan/utility/Projects/solmarket/apps/web && bunx tsc --noEmit
```

---

## 6. Phase D — Pre-flight checklist

Run before kicking off Phase E. All must pass.

```sh
# a. Cluster + authority sanity
solana config get
export PROGRAM_ID=$(solana-keygen pubkey ~/.config/solana/solmarket-program.json)
solana program show "$PROGRAM_ID"
solana-keygen pubkey ~/.config/solana/id.json
# Authority line in solana program show must equal id.json's pubkey

# b. Wallet has enough SOL for the upgrade buffer (~1.16 SOL refunded at end of upgrade)
solana balance

# c. Inventory of accounts you'll need to close — sanity-check via the
# new GET /admin/wind/status endpoint after the upgrade lands. Save a
# snapshot of the count of each PDA type before draining begins.

# d. Working tree is on the wind-down commit
cd /Users/anjan/utility/Projects/solmarket
git status
git log -1 --oneline

# e. Phase A handlers exist and dispatch correctly — run cargo build-sbf
# and inspect the .so for the new ix discriminators if you want belt-and-braces.
cd apps/solana
cargo build-sbf
ls -lh target/deploy/solmarket_contract.so

# f. Phase B + C typecheck
cd /Users/anjan/utility/Projects/solmarket
( cd packages/contract && bunx tsc --noEmit )
( cd apps/server     && bunx tsc --noEmit )
( cd apps/web        && bunx tsc --noEmit )
( cd apps/hedger     && bunx tsc --noEmit )

# g. Smoke-test the admin endpoints against a local validator with the
# new .so loaded (or against devnet after Phase E lands but before any
# real drain runs). At minimum hit GET /admin/wind/status — it should
# read back vault balance + PDA counts without erroring.
```

---

## 7. Phase E — Ship the on-chain upgrade

Follow [upgrade.md](upgrade.md) §5 (build) and §7 (deploy) — that procedure already covers the full upgrade path. Skip §6 ("Sync packages/contract"), since you already did the SDK work in Phase B.

After the upgrade lands, do not start draining yet. Instead:

```sh
# 1. Verify the new dispatcher routes the new ixs correctly. Cheapest
#    check: hit GET /admin/wind/status — that path goes through the SDK,
#    and any dispatcher mistake in Phase A surfaces here immediately.

# 2. Sanity-check Config is still intact post-upgrade.
#    Run the same fetchConfig() check as upgrade.md §8.
```

If anything looks off, **don't drain** — re-upgrade with a fix first. The drain is irreversible; the upgrade isn't.

---

## 8. Phase F — Wind down

### F.1 — Pause every market

```
POST /admin/wind/pause-all
```

Stops new BUY/SELL orders flowing into the vault while you wind down. Internally iterates `adminPauseMarket` over every Market PDA.

### F.2 — Resolve every open market

For every market still in `MarketStatus::Open`, call:

```
POST /admin/wind/resolve/:marketId
{ "winningOutcome": 0 or 1 }
```

After this, holders of winning shares can `claim` their payout from the treasury vault.

Skip this only if you're explicitly OK with cancelling open markets and keeping every BUY-side dollar that went into the vault. That's a rugpull — be honest about it.

### F.3 — Grace window for user claims

Announce the impending close, give users a reasonable window (a week or more is humane) to call `claim` and `close_position` on their resolved positions. They'll pull their winning USDC out of the vault and reclaim their own UserPosition rent.

What you choose to do here defines whether F.4 returns *only platform funds* or *platform funds plus user winnings nobody got around to claiming*.

### F.4 — Drain USDC from the treasury vault

```
POST /admin/wind/drain-treasury
```

Verify afterwards:

```sh
spl-token balance --owner <treasury_authority_pda> --token <usdc_mint>
# should print 0
```

### F.5 — Close every UserPosition PDA

```
POST /admin/wind/close-positions      { "batchSize": 50 }
```

Each call refunds ~0.00151 SOL to admin. Repeat until `GET /admin/wind/status` reports zero remaining UserPositions. Batch with multiple ixs per tx (one tx can hold several `admin_close_position` calls — let the controller do this internally).

### F.6 — Close every UsedNonce PDA

```
POST /admin/wind/close-nonces         { "batchSize": 100 }
```

Each refunds ~0.00106 SOL. Same batching applies.

### F.7 — Close every Market PDA

```
POST /admin/wind/close-markets
```

Each refunds ~0.00436 SOL.

### F.8 — Close the treasury vault token account

```
POST /admin/wind/close-vault
```

Refunds ~0.00203 SOL. **Vault balance must be 0** at this point — `spl_token::close_account` errors otherwise. If the controller surfaces `NonZeroBalance`, re-run F.4 with the residual balance, then retry.

### F.9 — Close the Config PDA

```
POST /admin/wind/close-config
```

Refunds ~0.00208 SOL.

### F.10 — Confirm nothing program-owned remains

```
GET /admin/wind/status
```

The response must show vault balance = 0, every PDA count = 0, config = closed. If anything is non-zero, fix it before F.11. Anything still program-owned at the moment of `solana program close` is permanently lost.

### F.11 — Close the program itself

This is the irreversible step. Run from the CLI (no admin endpoint — the `solana` CLI signs with `id.json` directly, not through the server):

```sh
solana program close "$PROGRAM_ID" \
  --recipient $(solana-keygen pubkey ~/.config/solana/id.json)
```

Refunds:
- ~2.31 SOL (ProgramData rent)
- ~0.00114 SOL (program account rent)

After this command lands:
- The program ID is **permanently retired**. Re-deploying at the same address is impossible (the loader treats closed program accounts as un-reusable).
- Any program-owned account you forgot to close is now orphaned. Its SOL stays locked forever.

```sh
# Verify
solana program show "$PROGRAM_ID"
# should print "Program account is not found"
```

---

## 9. What you get back

| Asset | Amount | Source |
|---|---|---|
| USDC in treasury vault | full balance | F.4 |
| Per-UserPosition rent | ~0.00151 SOL × N positions | F.5 |
| Per-UsedNonce rent | ~0.00106 SOL × K nonces | F.6 |
| Per-Market rent | ~0.00436 SOL × M markets | F.7 |
| Treasury vault token account rent | ~0.00203 SOL | F.8 |
| Config PDA rent | ~0.00208 SOL | F.9 |
| ProgramData + program account rent | ~2.31 + ~0.00114 SOL | F.11 |

Order of magnitude on a contract with 10 markets / 1000 positions / 5000 nonces:

```
USDC drained                       — full vault balance
Markets:    10  × 0.00436   = 0.0436 SOL
Positions:  1000 × 0.00151  = 1.51   SOL
Nonces:     5000 × 0.00106  = 5.30   SOL
Vault + Config + program/ProgramData = ~2.32 SOL
                                     ─────────
                                       9.17 SOL recovered
```

Skipping the per-PDA cleanup (Phases F.5–F.9) loses everything in the middle four rows — easily 5–10 SOL on a contract that's been running for months.

---

## 10. What is permanently lost

- All transaction fees ever paid (every place_order, claim, deploy, upgrade, sweep ix). Burned at the validator level — not held as rent anywhere.
- USDC already paid out to user wallets via past `claim` / `close_position` / SELL — that's their money now.
- Anything still program-owned at the moment `solana program close` lands. Sweep first, close last.

---

## 11. Failure modes

### A new wind-down ix returns `InvalidInstructionData` after Phase E

Phase B drift — the TS encoder doesn't match the Rust handler. Inspect the `keys` array and `data` Buffer the SDK is producing for that ix and compare against the matching `instructions/<name>.rs`. Order of accounts is positional and must match exactly.

### Drain ix fails because vault has 0 balance

Either nothing was ever deposited, or someone (you) already drained it. Skip F.4, continue.

### `admin_close_treasury_vault` fails with `NonZeroBalance`

The vault still has USDC dust. Re-run `admin_drain_treasury` with the current balance, then retry close.

### `admin_close_position` fails with `WinningSharesUnclaimed`

If you reused the existing user-callable `close_position` constraints in the admin-force variant, the on-chain check still requires winning shares to be zeroed. Either (a) extend the user grace window in F.3, (b) drop the constraint inside `admin_close_position` (admins are nuking the contract anyway), or (c) call `claim` on behalf of the user — but only if you have a sane mapping from position PDA back to user wallet, and only if you're explicitly OK with the policy implications.

### `solana program close` fails with `account is not closeable`

The upgrade authority was finalized. Cannot be recovered. The program stays alive forever (other people can still call its existing instructions); the ProgramData rent is locked. The treasury vault and its USDC, however, were already drained in F.4 — so this only costs you the ProgramData rent (~2.31 SOL), not user funds.

### You closed the program before sweeping a PDA

The PDA is now orphaned. No path to recover. Pass-through to "permanently lost" above. This is exactly why the order in §2 is non-negotiable.

### Program keypair lost mid-procedure

Doesn't block the sweep — `solana program close` only needs the upgrade authority (`id.json`), not the program keypair. The program keypair is only needed to *deploy* at that program ID, which you'll never do again.

### Phase B SDK changes broke an unrelated path

Roll the change back narrowly — the wind-down methods are additive, so removing them shouldn't affect existing callers. Re-run all three typechecks (`packages/contract`, `apps/server`, `apps/hedger`) and confirm clean before re-attempting Phase E.

---

## 12. One-line summary

```
Add Rust ixs (drain + closers)  →  Mirror in packages/contract
       →  Wire /admin/wind/* endpoints + UI panel
       →  Pre-flight checks
       →  Upgrade on-chain (upgrade.md §5–§8)
       →  Pause  →  Resolve  →  Grace window
       →  Drain USDC  →  Close every position / nonce / market
       →  Close treasury vault token account  →  Close Config PDA
       →  solana program close
```

Sweep first. Close program last. Nothing in between is reversible after the final command lands.
