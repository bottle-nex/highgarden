import { expect, test } from "bun:test";
import type { CommentDTO } from "../packages/types/src/trading";
import {
  merge_posted_comments,
  remove_deleted_comment,
} from "../apps/web/src/components/market/comments/utils";

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

test("deleting a loaded comment keeps later pages and updates the next offset", () => {
  const loaded = Array.from({ length: 60 }, (_, i) => comment(String(i)));
  const remaining = remove_deleted_comment(loaded, "5");
  expect(remaining.length).toBe(59);
  expect(remaining[5]?.id).toBe("6");
  expect(remaining[58]?.id).toBe("59");
});

test("deleting an unloaded comment leaves every loaded row and offset intact", () => {
  const loaded = Array.from({ length: 60 }, (_, i) => comment(String(i)));
  expect(remove_deleted_comment(loaded, "unloaded")).toEqual(loaded);
});
