import { afterEach, expect, test, spyOn, mock } from "bun:test";
import { fakeDatabase } from "./fixture";
const { drainNotifications, enqueueLoginAlert } =
    await import("../../services/service.notification-outbox");

afterEach(() => mock.restore());
test("provider outages retry durable alerts with stable idempotency and capped delay", async () => {
    const db = fakeDatabase();
    await enqueueLoginAlert("user@example.com");
    const keys: string[] = [];
    const send = spyOn(global, "fetch").mockImplementation((async (
        _url: Parameters<typeof fetch>[0],
        options: Parameters<typeof fetch>[1],
    ) => {
        keys.push(new Headers(options?.headers).get("Idempotency-Key") ?? "");
        return Response.json({ name: "application_error", message: "mail down" }, { status: 500 });
    }) as typeof fetch);
    await drainNotifications();
    expect(db.notifications[0]!.acceptedAt).toBeNull();
    expect(db.notifications[0]!.attempts).toBe(1);
    expect(Number(db.notifications[0]!.availableAt) - Date.now()).toBeGreaterThan(0);
    db.notifications[0]!.availableAt = new Date(0);
    db.notifications[0]!.attempts = 50;
    await drainNotifications();
    expect(Number(db.notifications[0]!.availableAt) - Date.now()).toBeLessThanOrEqual(3600000);
    db.notifications[0]!.availableAt = new Date(0);
    send.mockResolvedValue(Response.json({ id: "provider-accepted" }));
    await Promise.all([drainNotifications(), drainNotifications()]);
    expect(db.notifications[0]!.acceptedAt).toBeInstanceOf(Date);
    expect(keys[0]).toBeTruthy();
    expect(keys[0]).toBe(keys[1]);
    const calls = send.mock.calls.length;
    await drainNotifications();
    expect(send.mock.calls).toHaveLength(calls);
});
