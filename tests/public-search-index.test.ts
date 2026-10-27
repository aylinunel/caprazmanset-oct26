import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  SearchTextIndex,
  normalizeSearchQuery,
  type SearchDataset,
  type SearchGates,
  type SearchRecord,
} from "../client/src/public/search-index";

const data = JSON.parse(
  fs.readFileSync(
    new URL("../data/original-dataset.json", import.meta.url),
    "utf8"
  )
) as SearchDataset;
const gates: SearchGates = {
  excludeEvent: () => false,
  includeSource: () => true,
};
function baseline(
  data: SearchDataset,
  rawQuery: string,
  gate: SearchGates = gates
) {
  const query = rawQuery.trim().toLocaleLowerCase("tr");
  if (query.length < 2)
    return { query, events: [], sources: [], topics: [], articles: [] };
  const has = (value: unknown) =>
    String(value).toLocaleLowerCase("tr").indexOf(query) >= 0;
  return {
    query,
    events: (data.E ?? []).filter(
      record => !gate.excludeEvent(record) && (has(record.t) || has(record.sum))
    ),
    sources: (data.S ?? []).filter(
      record => has(record.n) && gate.includeSource(record)
    ),
    topics: (data.TP ?? []).filter(record => has(record.n)),
    articles: (data.A ?? []).filter(record => has(record.t)).slice(0, 40),
  };
}

describe("cached public substring search", () => {
  it("preserves exact IDs, ordering, counts and 40-headline cap across the original corpus", () => {
    const index = new SearchTextIndex(data);
    for (const query of [
      "Girne",
      "Sözcü",
      "enflasyon",
      "İSTANBUL",
      "IĞDIR",
      "belediye",
      "ANKARA 4.",
      "an",
      "  Girne  ",
      "a",
      "",
      "bulunmayanzyx",
    ]) {
      const expected = baseline(data, query);
      const actual = index.search(query, gates);
      for (const kind of ["events", "sources", "topics", "articles"] as const) {
        expect(
          actual[kind].map(record => record.i ?? record.s ?? record.k)
        ).toEqual(
          expected[kind].map(record => record.i ?? record.s ?? record.k)
        );
      }
      expect(actual.articles.length).toBeLessThanOrEqual(40);
    }
  });

  it("preserves Turkish dotted and dotless I rather than generic English folding", () => {
    const index = new SearchTextIndex({
      A: [
        { i: "igdir", t: "IĞDIR" },
        { i: "izmir", t: "İZMİR" },
      ],
    });
    expect(normalizeSearchQuery("IĞDIR İZMİR")).toBe("ığdır izmir");
    expect(
      index.search("ığdır", gates).articles.map(record => record.i)
    ).toEqual(["igdir"]);
    expect(index.search("iğdır", gates).articles).toEqual([]);
    expect(
      index.search("izmir", gates).articles.map(record => record.i)
    ).toEqual(["izmir"]);
  });

  it("reapplies notice and source eligibility even when the query is unchanged", () => {
    const records: SearchDataset = {
      E: [
        { i: "notice", t: "Ankara ilan" },
        { i: "news", t: "Ankara haber" },
      ],
      S: [{ s: "source", n: "Ankara kaynak" }],
    };
    const index = new SearchTextIndex(records);
    let split = false;
    let activeSource = true;
    const dynamic: SearchGates = {
      excludeEvent: record => split && record.i === "notice",
      includeSource: () => activeSource,
    };
    expect(index.search("Ankara", dynamic).events).toHaveLength(2);
    split = true;
    activeSource = false;
    expect(
      index.search("Ankara", dynamic).events.map(record => record.i)
    ).toEqual(["news"]);
    expect(index.search("Ankara", dynamic).sources).toEqual([]);
    split = false;
    expect(index.search("Ankara", dynamic).events).toHaveLength(2);
  });

  it("folds text only once, stops after 40 headline matches and does not mutate records", () => {
    const title = vi.fn(() => "Ankara haber");
    const articles = Array.from({ length: 100 }, (_, at) =>
      Object.freeze({
        i: `a${at}`,
        get t() {
          return title();
        },
      })
    );
    const index = new SearchTextIndex({ A: articles });
    expect(title).toHaveBeenCalledTimes(100);
    expect(index.search("Ankara", gates).articles).toHaveLength(40);
    expect(index.search("haber", gates).articles).toHaveLength(40);
    expect(title).toHaveBeenCalledTimes(100);
    const original = JSON.stringify(data);
    new SearchTextIndex(data).search("girne", gates);
    expect(JSON.stringify(data)).toBe(original);
  });

  it("clears retained records and a new snapshot never reuses stale text", () => {
    const old = new SearchTextIndex({ A: [{ i: "same", t: "Eski başlık" }] });
    old.clear();
    expect(old.search("Eski", gates).articles).toEqual([]);
    const fresh = new SearchTextIndex({ A: [{ i: "same", t: "Yeni başlık" }] });
    expect(fresh.search("Eski", gates).articles).toEqual([]);
    expect(fresh.search("Yeni", gates).articles).toHaveLength(1);
  });
});
