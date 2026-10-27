import { describe, expect, it } from "vitest";
import {
  collectorBatchSchema,
  publicationErrors,
  safeExternalUrl,
  type PublicationRecord,
} from "../../shared/editorial";
import { publisherUrlAllowed } from "./repository";
import { validatePayload } from "./validation";
import { RateLimiter } from "./rate-limit";

const verified: PublicationRecord = {
  kind: "article",
  verificationStatus: "verified",
  provenanceNote: "Original publisher metadata checked by an editor",
  methodology: "Headline and UTC date checked against original page",
  editorialDisclosure:
    "Original metadata independently checked; no political judgment",
  evidenceUrl: "https://www.birgun.net/haber/kanit-123456",
  payload: {
    i: "c-test",
    s: "birgun",
    t: "İstanbul'da açıklama",
    u: "https://www.birgun.net/haber/kanit-123456",
  },
};

describe("publication gate", () => {
  it("accepts a complete verified article", () =>
    expect(publicationErrors(verified)).toEqual([]));
  it.each(["provided", "needs_review"] as const)(
    "does not publish new %s articles",
    state =>
      expect(
        publicationErrors({ ...verified, verificationStatus: state }).length
      ).toBeGreaterThan(0)
  );
  it("requires method, provenance and public disclosure", () =>
    expect(
      publicationErrors({
        ...verified,
        methodology: "",
        provenanceNote: "",
        editorialDisclosure: "",
      })
    ).toHaveLength(3));
  it("does not treat an HTTPS source field alone as evidence", () =>
    expect(publicationErrors({ ...verified, evidenceUrl: null })).toContain(
      "Verified records need an HTTPS evidence URL"
    ));
  it("blocks an unverified sensitive analysis", () =>
    expect(
      publicationErrors({
        ...verified,
        kind: "analysis",
        verificationStatus: "provided",
      }).length
    ).toBeGreaterThan(0));
  it("accepts a disclosed demo without a fictional original link", () =>
    expect(
      publicationErrors({
        ...verified,
        verificationStatus: "demo",
        evidenceUrl: null,
        payload: { i: "demo" },
      })
    ).toEqual([]));
  it("rejects fake demo URLs", () =>
    expect(
      publicationErrors({ ...verified, verificationStatus: "demo" })
    ).toContain("Demo records must not have fictional original links"));
});

describe("URL and publisher boundaries", () => {
  it.each([
    "javascript:alert(1)",
    "data:text/html,hello",
    "https://user:secret@birgun.net/",
    'https://birgun.net/" onerror="alert(1)',
    "https://birgun.net/\n",
    "not a URL",
  ])("rejects executable or malformed %s", value =>
    expect(safeExternalUrl(value)).toBeNull()
  );
  it("preserves Turkish HTTPS URLs", () =>
    expect(
      safeExternalUrl("https://www.birgun.net/haber/İstanbul-123")
    ).toMatch(/^https:/));
  it("requires matching registered publisher hosts", () => {
    expect(
      publisherUrlAllowed("birgun", "https://www.birgun.net/haber/a")
    ).toBe(true);
    expect(
      publisherUrlAllowed("birgun", "https://birgun.net.attacker.invalid/a")
    ).toBe(false);
    expect(publisherUrlAllowed("birgun", "https://127.0.0.1/a")).toBe(false);
    expect(publisherUrlAllowed("birgun", "https://www.birgun.net:444/a")).toBe(
      false
    );
    expect(
      publisherUrlAllowed("birgun", "https://www.birgun.net/a#tracking")
    ).toBe(false);
  });
  it("keeps the documented Haber Global domain alias", () =>
    expect(
      publisherUrlAllowed("haberglobal", "https://haberglobal.com/haber/a")
    ).toBe(true));
});

describe("input invariants", () => {
  it("keeps analysis identity stable and prevents protected dataset-key overrides", () => {
    expect(
      validatePayload("analysis", { key: "P", data: [] }, "analysis-P")
    ).toEqual({ key: "P", data: [] });
    expect(() =>
      validatePayload("analysis", { key: "A", data: [] }, "analysis-P")
    ).toThrow();
    expect(() =>
      validatePayload("analysis", { key: "G", data: [] }, "analysis-P")
    ).toThrow(/identity/);
  });
  it("cannot change stable IDs or inject HTML into newly edited payloads", () => {
    expect(() =>
      validatePayload(
        "article",
        { ...verified.payload, i: "different" },
        "c-test"
      )
    ).toThrow(/identity/);
    expect(() =>
      validatePayload(
        "article",
        { ...verified.payload, t: '<img src=x onerror="attack()">' },
        "c-test"
      )
    ).toThrow();
  });
  it("requires bounded batches and excludes full bodies", () => {
    const article = {
      source: "birgun",
      source_name: "BirGün",
      title: "İstanbul'da açıklama",
      url: "https://www.birgun.net/haber/a",
      published_at: null,
      fetched_at: "2026-10-27T12:00:00Z",
      summary: "",
      method: "rss",
    };
    const batch = {
      schemaVersion: 1,
      runId: "run1",
      upstreamCommit: "a".repeat(40),
      articles: [article],
    };
    expect(collectorBatchSchema.safeParse(batch).success).toBe(true);
    expect(
      collectorBatchSchema.safeParse({ ...batch, articles: [] }).success
    ).toBe(false);
    expect(
      collectorBatchSchema.safeParse({
        ...batch,
        articles: Array(101).fill(article),
      }).success
    ).toBe(false);
    expect(
      collectorBatchSchema.safeParse({
        ...batch,
        articles: [{ ...article, text: "not imported" }],
      }).success
    ).toBe(false);
  });
  it("rate-limits submissions and resets after the declared window", () => {
    const limiter = new RateLimiter(2, 1000);
    expect(limiter.accept("identity", 0)).toBe(true);
    expect(limiter.accept("identity", 1)).toBe(true);
    expect(limiter.accept("identity", 2)).toBe(false);
    expect(limiter.accept("identity", 1001)).toBe(true);
  });
});
