import { ENV } from "./envs/env"; // side-effect: validates env at import
import { logger_for } from "./log/log";
import { init_services, start_services, stop_services } from "./init.services";

const log = logger_for("boot");

const services = init_services();
await start_services(services);
log.info({ rpc: ENV.HEDGER_SOLANA_RPC_URL }, "v2 up");

let shutting_down = false;

/**
 * Two-phase shutdown:
 *   - First signal: attempt graceful stop with a 4s hard cap.
 *   - Second signal: caller wants out NOW — exit 1 immediately.
 *
 * The hard cap exists because BullMQ + ioredis can hold sockets open
 * past what their `close()` promises return. Without the cap, SIGTERM
 * from an orchestrator can leave the process zombied past its grace
 * window and result in SIGKILL.
 */
const shutdown = async (signal: string): Promise<void> => {
    if (shutting_down) process.exit(1);
    shutting_down = true;
    log.info({ signal }, "received shutdown signal");

    const hard = setTimeout(() => {
        log.warn("graceful shutdown exceeded 4s budget — forcing exit");
        process.exit(0);
    }, 4_000);

    try {
        await stop_services(services);
    } finally {
        clearTimeout(hard);
        process.exit(0);
    }
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
