import express, { type RequestHandler } from "express";

/** Exercise the existing HTTP controller without booting application services. */
export async function start_report_server(handler: RequestHandler) {
    const app = express();
    app.post(["/comments/:id/report", "/comments/report"], (req, res, next) => {
        const user_id = req.header("x-test-user");
        if (user_id) req.user = { id: user_id, email: "report-test@example.com" };
        return handler(req, res, next);
    });
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server has no port");

    return {
        report(user_id: string | null, comment_id?: string) {
            const path = comment_id ? `/comments/${comment_id}/report` : "/comments/report";
            return fetch(`http://127.0.0.1:${address.port}${path}`, {
                method: "POST",
                headers: user_id ? { "x-test-user": user_id } : {},
            });
        },
        close() {
            return new Promise<void>((resolve, reject) => {
                server.close((error) => (error ? reject(error) : resolve()));
            });
        },
    };
}
