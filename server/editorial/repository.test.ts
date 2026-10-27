import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import {
  auditEvents,
  datasetManifests,
  editorialRecords,
  type EditorialRecord,
} from "../../drizzle/schema";

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("../db", () => ({ getDb: mocks.getDb }));
import {
  importCollectorBatch,
  invalidateDataset,
  publicDataset,
  saveRecord,
  transitionRecord,
} from "./repository";

function record(overrides: Partial<EditorialRecord> = {}): EditorialRecord {
  return {
    id: "h1",
    kind: "article",
    sourceSlug: "birgun",
    urlHash: "old-hash",
    title: "Başlık",
    payload: {
      i: "h1",
      s: "birgun",
      t: "Başlık",
      u: "https://www.birgun.net/haber/a",
    },
    status: "published",
    verificationStatus: "verified",
    provenanceNote: "Publisher metadata checked",
    methodology: "Original metadata review",
    editorialDisclosure: "Editor checked the original page",
    evidenceUrl: "https://www.birgun.net/haber/a",
    version: 1,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  invalidateDataset();
});

describe("editorial repository invariants", () => {
  it("does not repopulate the public cache from a read invalidated by an editorial change", async () => {
    let resolveOld!: (rows: EditorialRecord[]) => void;
    let markStarted!: () => void;
    const started = new Promise<void>(resolve => {
      markStarted = resolve;
    });
    const oldRows = new Promise<EditorialRecord[]>(resolve => {
      resolveOld = resolve;
    });
    const source = record({
      id: "source-birgun",
      kind: "source",
      payload: { s: "birgun", n: "BirGün" },
    });
    let reads = 0;
    mocks.getDb.mockResolvedValue({
      select: () => ({
        from: (table: unknown) => {
          if (table === datasetManifests)
            return {
              orderBy: () => ({
                limit: async () => [{ supportingData: {}, sha256: "fixture" }],
              }),
            };
          if (table === editorialRecords)
            return {
              where: () => {
                reads++;
                if (reads === 1) {
                  markStarted();
                  return oldRows;
                }
                return Promise.resolve([]);
              },
            };
          throw new Error("Unexpected table");
        },
      }),
    });
    const pending = publicDataset();
    await started;
    invalidateDataset();
    resolveOld([source, record()]);
    await pending;
    const fresh = await publicDataset();
    expect(fresh.A).toEqual([]);
    expect(fresh.S).toEqual([]);
    expect(reads).toBe(2);
  });

  it("keeps article source and URL identity indexes in sync with an edited payload", async () => {
    const old = record();
    const updates: Record<string, unknown>[] = [];
    const tx = {
      select: () => ({
        from: () => ({ where: () => ({ for: async () => [old] }) }),
      }),
      insert: () => ({ values: async () => undefined }),
      update: () => ({
        set: (value: Record<string, unknown>) => {
          updates.push(value);
          return { where: async () => undefined };
        },
      }),
    };
    mocks.getDb.mockResolvedValue({
      transaction: async (callback: (value: typeof tx) => unknown) =>
        callback(tx),
    });
    await saveRecord(
      {
        id: old.id,
        expectedVersion: 1,
        title: old.title,
        payload: {
          ...old.payload,
          s: "t24",
          u: "https://t24.com.tr/haber/duzeltme",
        },
        verificationStatus: "verified",
        provenanceNote: old.provenanceNote,
        methodology: old.methodology,
        editorialDisclosure: old.editorialDisclosure,
        evidenceUrl: old.evidenceUrl,
        reason: "Correct publisher attribution",
      },
      5
    );
    expect(updates[0]).toMatchObject({
      sourceSlug: "t24",
      status: "draft",
      version: 2,
    });
    const { createHash } = await import("node:crypto");
    expect(updates[0].urlHash).toBe(
      createHash("sha256")
        .update("t24\nhttps://t24.com.tr/haber/duzeltme")
        .digest("hex")
    );
  });

  it("checks the source actually displayed by the article before publication", async () => {
    const old = record({ payload: { ...record().payload, s: "t24" } });
    const update = vi.fn(() => ({
      set: () => ({ where: async () => undefined }),
    }));
    const dialect = new MySqlDialect();
    const tx = {
      select: () => ({
        from: () => ({
          where: (condition: Parameters<MySqlDialect["sqlToQuery"]>[0]) => ({
            for: async () => [old],
            limit: async () =>
              dialect.sqlToQuery(condition).params.includes("source-t24")
                ? []
                : [{ id: "source-birgun" }],
          }),
        }),
      }),
      insert: () => ({ values: async () => undefined }),
      update,
    };
    mocks.getDb.mockResolvedValue({
      transaction: async (callback: (value: typeof tx) => unknown) =>
        callback(tx),
    });
    await expect(
      transitionRecord(
        old.id,
        1,
        "published",
        "Review corrected attribution",
        5
      )
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("source must be published"),
    });
    expect(update).not.toHaveBeenCalled();
  });

  describe("collector batch import", () => {
    const article = (n: number) => ({
      source: "birgun",
      source_name: "BirGün",
      url: `https://www.birgun.net/haber/${n}`,
      title: `Başlık ${n}`,
      published_at: "2026-10-20T10:00:00+03:00",
      fetched_at: "2026-10-27T10:00:00+00:00",
      summary: "",
      method: "sitemap",
    });
    const batch = (...ns: number[]) => ({
      schemaVersion: 1 as const,
      runId: "run-1",
      upstreamCommit: "a".repeat(40),
      articles: ns.map(article),
    });
    function fakeDb(existing: string[], raced: string[] = []) {
      const statements: string[] = [];
      const stored = new Map<string, string>();
      const tx = {
        select: () => ({
          from: () => ({
            where: async () => {
              statements.push("select");
              return [
                ...existing.map(id => ({ id, note: "other run" })),
                ...[...stored].map(([id, note]) => ({ id, note })),
              ];
            },
          }),
        }),
        insert: (table: unknown) => ({
          ignore: () => ({
            values: async (rows: { id: string; provenanceNote: string }[]) => {
              statements.push(`insert records x${rows.length}`);
              let affected = 0;
              for (const row of rows) {
                const other = raced.find(r => row.id.endsWith(r));
                if (other) stored.set(row.id, "concurrent run");
                else {
                  stored.set(row.id, row.provenanceNote);
                  affected++;
                }
              }
              return [{ affectedRows: affected }];
            },
          }),
          values: async (rows: unknown[]) => {
            statements.push(
              `insert ${table === auditEvents ? "audit" : "other"} x${rows.length}`
            );
          },
        }),
      };
      mocks.getDb.mockResolvedValue({
        transaction: async (callback: (value: typeof tx) => unknown) =>
          callback(tx),
      });
      return statements;
    }
    const idOf = async (n: number) => {
      const { createHash } = await import("node:crypto");
      return `c-${createHash("sha256").update(`birgun\nhttps://www.birgun.net/haber/${n}`).digest("hex").slice(0, 40)}`;
    };

    it("writes a batch in three statements and counts duplicates", async () => {
      const statements = fakeDb([await idOf(2)]);
      const result = await importCollectorBatch(batch(1, 2, 3, 3), 7);
      expect(result).toMatchObject({
        accepted: 2,
        duplicates: 2,
        status: "draft",
      });
      expect(statements).toEqual([
        "select",
        "insert records x2",
        "insert audit x2",
      ]);
    });

    it("audits only rows this batch created when a concurrent import races it", async () => {
      const raced = (await idOf(2)).slice(-6);
      const statements = fakeDb([], [raced]);
      const result = await importCollectorBatch(batch(1, 2), 7);
      expect(result).toMatchObject({ accepted: 1, duplicates: 1 });
      expect(statements).toEqual([
        "select",
        "insert records x2",
        "select",
        "insert audit x1",
      ]);
    });
  });
});
