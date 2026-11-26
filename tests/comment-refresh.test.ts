import { expect, test } from "bun:test";
import type { CommentDTO } from "../packages/types/src/trading";
import { merge_posted_comments } from "../apps/web/src/components/market/comments/utils";

function comment(id: string): CommentDTO {
  return {
    id,
    eventId: "event",
    body: id,
    reportCount: 0,
    createdAt: "",
    author: { userId: "user", username: "user", walletShort: null },
  };
}

test("a refresh keeps comments posted after its snapshot in newest-first order", () => {
  expect(
    merge_posted_comments([comment("old")], [comment("new1"), comment("new2")]).map((c) => c.id),
  ).toEqual(["new2", "new1", "old"]);
});

test("a refresh does not duplicate a post already in its snapshot", () => {
  expect(
    merge_posted_comments([comment("new"), comment("old")], [comment("new")]).map((c) => c.id),
  ).toEqual(["new", "old"]);
});
