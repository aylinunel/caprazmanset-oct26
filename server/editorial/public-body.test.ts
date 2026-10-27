import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import zlib from "node:zlib";
import { encodePublicBody, negotiate, notModified } from "./public-body";

const mocks = vi.hoisted(() => ({
  publicDataset: vi.fn(),
  unavailable: false,
}));
vi.mock("./repository", async () => {
  const { TRPCError } = await import("@trpc/server");
  return {
    publicDataset: async () => {
      if (mocks.unavailable)
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: "not ready",
        });
      return mocks.publicDataset();
    },
    collectorActor: vi.fn(),
    findRecord: vi.fn(),
    hasDatasetManifest: vi.fn(),
    importCollectorBatch: vi.fn(),
    submitIntake: vi.fn(),
  };
});
import { registerEditorialHttp } from "./http";

describe("encoded public body", () => {
  it("encodes once per content and keeps the ETag for equal content", async () => {
    const a = await encodePublicBody({ A: [1, 2], t: "Çapraz" });
    const b = await encodePublicBody({ A: [1, 2], t: "Çapraz" });
    const c = await encodePublicBody({ A: [1, 2, 3], t: "Çapraz" });
    expect(b).toBe(a);
    expect(c.etag).not.toBe(a.etag);
    expect(JSON.parse(zlib.gunzipSync(a.gzip).toString())).toEqual({
      A: [1, 2],
      t: "Çapraz",
    });
    expect(JSON.parse(zlib.brotliDecompressSync(a.br).toString())).toEqual({
      A: [1, 2],
      t: "Çapraz",
    });
    expect(a.identity.toString()).toBe(
      JSON.stringify({ A: [1, 2], t: "Çapraz" })
    );
  });

  it("negotiates the smallest accepted encoding", () => {
    expect(negotiate("gzip, deflate, br")).toBe("br");
    expect(negotiate("gzip, br;q=0")).toBe("gzip");
    expect(negotiate("*")).toBe("br");
    expect(negotiate("identity")).toBe("identity");
    expect(negotiate(undefined)).toBe("identity");
  });

  it("matches If-None-Match lists, weak tags and *", () => {
    expect(notModified('"x", "y"', '"y"')).toBe(true);
    expect(notModified('W/"y"', '"y"')).toBe(true);
    expect(notModified("*", '"y"')).toBe(true);
    expect(notModified('"x"', '"y"')).toBe(false);
    expect(notModified(undefined, '"y"')).toBe(false);
  });
});

describe("GET /api/public/dataset", () => {
  let base = "";
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  beforeAll(async () => {
    const app = express();
    registerEditorialHttp(app);
    server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server.close());
  beforeEach(() =>
    mocks.publicDataset.mockResolvedValue({ A: ["h1"], meta: { v: 1 } })
  );

  it("serves compressed JSON with a validator and answers 304 when unchanged", async () => {
    const first = await fetch(base + "/api/public/dataset", {
      headers: { "accept-encoding": "gzip" },
    });
    expect(first.status).toBe(200);
    expect(first.headers.get("content-encoding")).toBe("gzip");
    expect(first.headers.get("cache-control")).toBe("no-cache");
    expect(first.headers.get("vary")).toMatch(/Accept-Encoding/i);
    expect(await first.json()).toEqual({ A: ["h1"], meta: { v: 1 } });
    const etag = first.headers.get("etag")!;
    expect(etag).toMatch(/^"[A-Za-z0-9_-]+"$/);

    const again = await fetch(base + "/api/public/dataset", {
      headers: { "if-none-match": etag },
    });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe("");
  });

  it("changes the validator when published data changes", async () => {
    const first = await fetch(base + "/api/public/dataset");
    mocks.publicDataset.mockResolvedValue({ A: ["h1", "h2"], meta: { v: 1 } });
    const next = await fetch(base + "/api/public/dataset", {
      headers: { "if-none-match": first.headers.get("etag")! },
    });
    expect(next.status).toBe(200);
    expect(await next.json()).toEqual({ A: ["h1", "h2"], meta: { v: 1 } });
  });

  it("keeps the service-unavailable contract", async () => {
    mocks.unavailable = true;
    try {
      const res = await fetch(base + "/api/public/dataset");
      expect(res.status).toBe(503);
    } finally {
      mocks.unavailable = false;
    }
  });
});
