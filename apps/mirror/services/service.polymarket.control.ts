import Redis from "ioredis";
import { ENV } from "../config/config.env";
import { REDIS_CHANNELS, type ControlMessage } from "@solmarket/polymarket-contracts";
import type MarketSocket from "../socket/socket.market";
import chalk from "chalk";

const PERIODIC_CONVERGE_MS = 60_000;
const RETRY_AFTER_FAILURE_MS = 2_000;
const HEARTBEAT_MS = 5_000;
const HEARTBEAT_TTL_S = 30;

export default class PolymarketControlListener {
    private sub: Redis | null = null;
    private cmd: Redis | null = null;
    private periodic: ReturnType<typeof setInterval> | null = null;
    private heartbeat: ReturnType<typeof setInterval> | null = null;
    private readonly market: MarketSocket;

    constructor(market: MarketSocket) {
        this.market = market;
    }

    public async start(): Promise<void> {
        // ioredis requires a dedicated client for SUBSCRIBE mode — don't reuse
        // services.redis or the main client becomes unusable for normal commands.
        this.sub = new Redis(ENV.SERVER_REDIS_URL);
        this.cmd = new Redis(ENV.SERVER_REDIS_URL);

        // Subscribe to the nudge channel before reading SMEMBERS so we don't miss
        // a message published between the two operations.
        await this.sub.subscribe(REDIS_CHANNELS.control);
        this.sub.on("message", (_channel, raw) => this.handle_message(raw));

        // Initial converge from the durable SET.
        await this.converge_with_retry();

        // Re-converge on Redis reconnect.
        this.cmd.on("ready", () => {
            void this.converge_with_retry();
        });

        // Safety net for missed nudges and slow-arriving Redis events.
        this.periodic = setInterval(() => {
            void this.converge_with_retry();
        }, PERIODIC_CONVERGE_MS);

        // Heartbeat the registry snapshot so the diagnostic endpoint can tell
        // a live mirror from a dead one (key expires after HEARTBEAT_TTL_S).
        this.heartbeat = setInterval(() => {
            void this.publish_registry_snapshot();
        }, HEARTBEAT_MS);
        await this.publish_registry_snapshot();
    }

    public async stop(): Promise<void> {
        if (this.periodic) {
            clearInterval(this.periodic);
            this.periodic = null;
        }
        if (this.heartbeat) {
            clearInterval(this.heartbeat);
            this.heartbeat = null;
        }
        await this.sub?.quit();
        await this.cmd?.quit();
        this.sub = null;
        this.cmd = null;
    }

    private async publish_registry_snapshot(): Promise<void> {
        if (!this.cmd) return;
        const tokens = this.market.registry.snapshot();
        try {
            await this.cmd.set(
                REDIS_CHANNELS.mirror_registry_key,
                JSON.stringify({ tokens, at: Date.now() }),
                "EX",
                HEARTBEAT_TTL_S,
            );
        } catch (err) {
            console.warn("[poly:control] heartbeat write failed", err);
        }
    }

    public async converge(): Promise<{ added: number; removed: number }> {
        if (!this.cmd) return { added: 0, removed: 0 };
        const desired = await this.cmd.smembers(REDIS_CHANNELS.intent_set);
        const current = this.market.registry.snapshot();
        const desired_set = new Set(desired);
        const current_set = new Set(current);

        const to_add = desired.filter((id) => !current_set.has(id));
        const to_remove = current.filter((id) => !desired_set.has(id));

        console.log(
            chalk.cyan("[poly:control] converge"),
            chalk.gray(
                `desired=${desired.length} current=${current.length} to_add=${to_add.length} to_remove=${to_remove.length}`,
            ),
            to_add.length > 0 ? chalk.green(`+${to_add.join(",")}`) : "",
            to_remove.length > 0 ? chalk.red(`-${to_remove.join(",")}`) : "",
        );

        for (const id of to_add) this.market.subscribe(id);
        for (const id of to_remove) this.market.unsubscribe(id);

        if (to_add.length > 0 || to_remove.length > 0) {
            await this.publish_registry_snapshot();
        }
        return { added: to_add.length, removed: to_remove.length };
    }

    private async converge_with_retry(): Promise<void> {
        try {
            await this.converge();
            return;
        } catch (err) {
            console.warn("[poly:control] converge failed, retrying in 2s", err);
        }
        await new Promise((resolve) => setTimeout(resolve, RETRY_AFTER_FAILURE_MS));
        try {
            await this.converge();
        } catch (err) {
            console.error("[poly:control] converge retry failed; relying on 60s timer", err);
        }
    }

    private handle_message(raw: string): void {
        const parsed = this.parse(raw);
        if (!parsed) {
            console.warn("[poly:control] bad message", raw);
            return;
        }
        if (parsed.action === "subscribe") {
            console.log(chalk.green("subscribe event: "), parsed.token_id);
            this.market.subscribe(parsed.token_id);
        } else {
            console.log(chalk.red("unsubscribe event: "), parsed.token_id);
            this.market.unsubscribe(parsed.token_id);
        }
    }

    private parse(raw: string): ControlMessage | null {
        try {
            const obj = JSON.parse(raw) as Partial<ControlMessage>;
            if (typeof obj?.token_id !== "string") return null;
            if (obj.action !== "subscribe" && obj.action !== "unsubscribe") {
                return null;
            }
            return {
                action: obj.action,
                token_id: obj.token_id,
                consumer_id: obj.consumer_id,
            };
        } catch {
            return null;
        }
    }
}
