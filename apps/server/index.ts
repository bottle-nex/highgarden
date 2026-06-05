import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer } from "http";
import v1_router from "./routers/v1/router.v1";
import Env, { ENV } from "./config/config.env";
import Services from "./services/service.singleton";
import SocketServer from "./socket/socket.server";
import { autoLister } from "./services/auto-lister.service";
import { errorHandler } from "./middleware/error-handler";
import { requestLogger } from "./middleware/request-logger";
import { notFoundHandler } from "./middleware/not-found";

Env.parse_env();
export const services = new Services();
// SocketServer needs services.mirror_control and services.book_cache, which
// don't exist until services.boot() runs. Construction is deferred into the
// background boot IIFE below; consumers all live behind the `wait_ready`
// gate so by the time they read this binding it's assigned. The `!` defers
// the null-check to runtime — boot finishing before any v1 route fires is
// the invariant the gate enforces.
export let socket_server!: SocketServer;

// Readiness gate: open the TCP port immediately, then do heavy hydration in
// the background. Without this, the proxy times out while we wait on Redis
// + Postgres + Solana RPC handshakes and the APPROVED-listings backfill —
// which has grown large enough recently that the proxy gives up first
// (returning 502) and only the *next* request lands on a warm server.
let is_ready = false;
let ready_resolve: () => void = () => {};
const ready_promise = new Promise<void>((resolve) => {
    ready_resolve = resolve;
});

// If boot takes longer than this, hold the request slightly past common
// proxy read timeouts (Cloudflare 100s, ALB 60s default, nginx 60s default)
// and we'd rather the client get a clean 503+Retry-After than a hung
// connection. 25s gives the typical boot path plenty of headroom while
// staying well under every default upstream timeout.
const READY_WAIT_CAP_MS = 25_000;

async function wait_ready(_req: Request, res: Response, next: NextFunction): Promise<void> {
    if (is_ready) return next();
    let timed_out = false;
    await Promise.race([
        ready_promise,
        new Promise<void>((resolve) =>
            setTimeout(() => {
                timed_out = true;
                resolve();
            }, READY_WAIT_CAP_MS),
        ),
    ]);
    if (timed_out && !is_ready) {
        res.setHeader("Retry-After", "5");
        res.status(503).json({
            success: false,
            error: { code: "SERVICE_BOOTING", message: "Server is still starting" },
        });
        return;
    }
    next();
}

const app = express();
// One proxy hop in front of the server (load balancer / reverse proxy).
// Required so `req.ip` resolves to the real client IP rather than the
// proxy's IP — otherwise IP-keyed rate limits collapse to one bucket.
// Bump this number if there are multiple hops in front of the app.
app.set("trust proxy", 1);
app.use(
    cors({
        origin: ENV.SERVER_WEB_ORIGIN,
        credentials: true,
    }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// Health probe — always cheap and always answers, so platform health
// checks pass during the boot window and the container isn't killed
// before it finishes warming up.
app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true, ready: is_ready });
});

app.use("/api/v1", wait_ready, v1_router);

app.use(notFoundHandler);
app.use(errorHandler);

const server = createServer(app);
// Open the port *before* boot/hydrate so the proxy's TCP probe succeeds
// instantly. Requests that arrive during boot wait on `ready_promise`
// inside `wait_ready` rather than seeing a refused connection or timeout.
server.listen(ENV.SERVER_PORT);

void (async () => {
    try {
        await services.boot();
        await services.hydrate();
        socket_server = new SocketServer(
            server,
            ENV.SERVER_REDIS_URL,
            services.mirror_control,
            services.book_cache,
        );
        autoLister.start();
        is_ready = true;
        ready_resolve();
    } catch (err) {
        // If boot blows up there's no safe state to serve from — log and
        // let the platform restart us. Without this catch, an unhandled
        // rejection on cold start would crash silently and the readiness
        // promise would never resolve, leaving every request to time out
        // on the 503 path.
        console.error("[boot] fatal error during startup", err);
        process.exit(1);
    }
})();
