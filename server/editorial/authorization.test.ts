import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

const store = vi.hoisted(() => ({
  listRecords: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  findRecord: vi.fn(),
  saveRecord: vi.fn(),
  transitionRecord: vi.fn(),
  listAudit: vi.fn().mockResolvedValue([]),
  history: vi.fn(),
  listIntakes: vi.fn(),
  triageIntake: vi.fn(),
  tokensForAdmin: vi.fn(),
  issueImportToken: vi.fn(),
  revokeToken: vi.fn(),
}));
vi.mock("./repository", () => store);
import { editorialRouter } from "./router";
const context = (role: "admin" | "user" | null): TrpcContext => ({
  req: {} as TrpcContext["req"],
  res: {} as TrpcContext["res"],
  user: role
    ? {
        id: 5,
        openId: "test-offline",
        name: "Test fixture",
        email: null,
        loginMethod: null,
        role,
        createdAt: new Date(0),
        updatedAt: new Date(0),
        lastSignedIn: new Date(0),
      }
    : null,
});

describe("admin boundary", () => {
  beforeEach(() => vi.clearAllMocks());
  it.each([null, "user"] as const)(
    "rejects %s before any database query",
    async role => {
      const caller = editorialRouter.createCaller(context(role));
      await expect(caller.list({ offset: 0, limit: 40 })).rejects.toMatchObject(
        { code: "FORBIDDEN" }
      );
      await expect(caller.audit()).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        caller.publish({
          id: "h1",
          expectedVersion: 1,
          reason: "Test publication reason",
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        caller.issueToken({ label: "fixture" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(store.listRecords).not.toHaveBeenCalled();
      expect(store.transitionRecord).not.toHaveBeenCalled();
      expect(store.issueImportToken).not.toHaveBeenCalled();
    }
  );
  it("allows an authenticated admin through the read-only query boundary", async () => {
    const caller = editorialRouter.createCaller(context("admin"));
    expect(await caller.list({ offset: 0, limit: 40 })).toEqual({
      items: [],
      total: 0,
    });
    expect(store.listRecords).toHaveBeenCalledOnce();
  });
  it("requires an explicit bounded publication reason", async () => {
    const caller = editorialRouter.createCaller(context("admin"));
    await expect(
      caller.publish({ id: "h1", expectedVersion: 1, reason: "" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(store.transitionRecord).not.toHaveBeenCalled();
  });
});
