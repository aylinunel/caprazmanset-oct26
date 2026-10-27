import fs from "node:fs";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import {
  SearchTextIndex,
  type SearchDataset,
} from "../client/src/public/search-index";

const data = JSON.parse(
  fs.readFileSync(
    new URL("../data/original-dataset.json", import.meta.url),
    "utf8"
  )
) as Required<SearchDataset>;
const queries = [
  "enflasyon",
  "Girne",
  "Sözcü",
  "İSTANBUL",
  "IĞDIR",
  "belediye",
  "Ankara",
  "İçişleri",
  "deprem",
  "yolsuzluk",
  "ANKARA 4.",
  "an",
  "bulunmayanzyx",
];
const gate = { excludeEvent: () => false, includeSource: () => true };
function legacyHeadlineSearch(query: string) {
  const q = query.trim().toLocaleLowerCase("tr");
  if (q.length < 2) return [];
  return data.A.filter(article =>
    String(article.t).toLocaleLowerCase("tr").includes(q)
  )
    .slice(0, 40)
    .map(article => String(article.i));
}
function percentile(values: number[], ratio: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}
function summary(values: number[]) {
  return {
    queries: values.length,
    medianMs: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
  };
}
const start = performance.now();
const index = new SearchTextIndex({ A: data.A });
const coldHeadlineIndexMs = performance.now() - start;
const globalStart = performance.now();
const globalIndex = new SearchTextIndex(data);
const coldGlobalIndexMs = performance.now() - globalStart;
const indexed = (query: string) =>
  index.search(query, gate).articles.map(article => String(article.i));
for (const query of queries)
  assert.deepEqual(indexed(query), legacyHeadlineSearch(query));
const legacyTimes: number[] = [];
const indexedTimes: number[] = [];
// Alternate execution order to reduce warmup/GC ordering bias. This compares
// the same original article branch and same 40-result semantics, not whole DOM.
for (let round = 0; round < 20; round++) {
  for (const query of queries) {
    const operations =
      round % 2 === 0
        ? [legacyHeadlineSearch, indexed]
        : [indexed, legacyHeadlineSearch];
    for (const operation of operations) {
      const at = performance.now();
      operation(query);
      (operation === indexed ? indexedTimes : legacyTimes).push(
        performance.now() - at
      );
    }
  }
}
const baseline = summary(legacyTimes);
const cached = summary(indexedTimes);
console.log(
  JSON.stringify(
    {
      corpusArticles: data.A.length,
      querySet: queries,
      baseline,
      cached,
      coldHeadlineIndexMs,
      coldGlobalIndexMs,
      foldedCharacters: globalIndex.foldedCharacters,
      foldedUtf16BytesLowerBound: globalIndex.foldedCharacters * 2,
      medianReductionPercent: (1 - cached.medianMs / baseline.medianMs) * 100,
      resultParity: true,
      scope:
        "Offline Node headline matching; excludes rendering/network/real-user responsiveness",
    },
    null,
    2
  )
);
