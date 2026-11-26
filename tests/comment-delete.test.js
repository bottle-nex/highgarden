import { beforeEach, describe, expect, mock, test } from "bun:test";

const findFirst = mock();
const deleteMany = mock();
const publish = mock();
mock.module("@solmarket/database", () => ({ prisma: { comment: { findFirst, deleteMany } } }));
mock.module("../apps/server/index.ts", () => ({
  services: { market_lifecycle: { publish_comment_deleted: publish } },
}));

const { default: DeleteCommentController } =
  await import("../apps/server/controllers/comments/controller.delete-comment.ts");

function response() {
  return {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

describe("delete comment", () => {
  beforeEach(() => {
    findFirst.mockReset();
    deleteMany.mockReset();
    publish.mockReset();
  });

  test("requires authentication", async () => {
    const res = response();
    await DeleteCommentController.process({ params: { id: "c" } }, res);
    expect(res.statusCode).toBe(401);
    expect(findFirst).not.toHaveBeenCalled();
  });

  test("treats missing and other users comments alike", async () => {
    findFirst.mockResolvedValue(null);
    const res = response();
    await DeleteCommentController.process({ user: { id: "u" }, params: { id: "c" } }, res);
    expect(res.statusCode).toBe(404);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "c", userId: "u" },
      select: { eventId: true },
    });
    expect(deleteMany).not.toHaveBeenCalled();
  });

  test("deletes only the owner’s comment and broadcasts its event", async () => {
    findFirst.mockResolvedValue({ eventId: "event" });
    deleteMany.mockResolvedValue({ count: 1 });
    const res = response();
    await DeleteCommentController.process({ user: { id: "u" }, params: { id: "c" } }, res);
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: "c", userId: "u" } });
    expect(publish).toHaveBeenCalledWith("event", "c");
    expect(res.statusCode).toBe(200);
  });

  test("does not broadcast a concurrent deletion", async () => {
    findFirst.mockResolvedValue({ eventId: "event" });
    deleteMany.mockResolvedValue({ count: 0 });
    const res = response();
    await DeleteCommentController.process({ user: { id: "u" }, params: { id: "c" } }, res);
    expect(res.statusCode).toBe(404);
    expect(publish).not.toHaveBeenCalled();
  });

  test("reports success when publishing fails after deletion", async () => {
    findFirst.mockResolvedValue({ eventId: "event" });
    deleteMany.mockResolvedValue({ count: 1 });
    publish.mockRejectedValue(new Error("redis unavailable"));
    const log = mock(() => {});
    const original = console.error;
    console.error = log;
    try {
      const res = response();
      await DeleteCommentController.process({ user: { id: "u" }, params: { id: "c" } }, res);
      expect(res.statusCode).toBe(200);
      expect(log).toHaveBeenCalled();
    } finally {
      console.error = original;
    }
  });
});
