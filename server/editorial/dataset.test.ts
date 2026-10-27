import { describe, expect, it } from "vitest";
import { assemblePublicDataset } from "./dataset";
import type { EditorialRecord } from "../../drizzle/schema";

function record(
  id: string,
  kind: EditorialRecord["kind"],
  payload: Record<string, unknown>,
  status: EditorialRecord["status"] = "published"
): EditorialRecord {
  return {
    id,
    kind,
    sourceSlug: null,
    urlHash: null,
    title: id,
    payload,
    status,
    verificationStatus: "provided",
    provenanceNote: "supplied fixture",
    methodology: "test",
    editorialDisclosure: "not verified",
    evidenceUrl: null,
    version: 1,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}
const source = record("source-birgun", "source", { s: "birgun", n: "BirGün" });
const article = record("h1", "article", { i: "h1", s: "birgun", t: "Başlık" });
const event = record("s1", "event", {
  i: "s1",
  t: "Olay",
  a: ["h1"],
  s: ["birgun"],
});

describe("public visibility and integrity", () => {
  it("includes only published records and suppresses private notes from other tables by construction", () => {
    const result = assemblePublicDataset(
      { meta: {}, TP: [{ e: ["s1", "s2"] }] },
      [
        source,
        article,
        event,
        record("h2", "article", { i: "h2", s: "birgun" }, "draft"),
        record("h3", "article", { i: "h3", s: "birgun" }, "archived"),
      ],
      "fixture-hash"
    );
    expect(result.A as unknown[]).toHaveLength(1);
    expect(result.E as unknown[]).toHaveLength(1);
    expect(result.TP).toEqual([{ e: ["s1"] }]);
    expect((result.meta as Record<string, unknown>).publicCounts).toEqual({
      articles: 1,
      events: 1,
      sources: 1,
    });
  });
  it("does not expose draft-source articles or events with hidden article references", () => {
    const hiddenSource = { ...source, status: "draft" as const };
    expect(
      assemblePublicDataset({ meta: {} }, [hiddenSource, article, event], "x").A
    ).toEqual([]);
    expect(
      assemblePublicDataset(
        { meta: {} },
        [source, { ...article, status: "archived" }, event],
        "x"
      ).E
    ).toEqual([]);
  });
  it("leaves input supporting data unchanged and makes supplied status visible", () => {
    const supporting = {
      meta: { counts: { harvested: 105869 } },
      TP: [{ e: ["s1", "missing"] }],
    };
    const result = assemblePublicDataset(
      supporting,
      [source, article, event],
      "x"
    );
    expect(supporting.TP[0].e).toEqual(["s1", "missing"]);
    expect((result.A as Record<string, unknown>[])[0].verificationStatus).toBe(
      "provided"
    );
    expect((result.meta as Record<string, unknown>).disclosure).toMatch(
      /bağımsız doğrulama yapılmadı/
    );
  });
});
