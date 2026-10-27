export type SearchRecord = Record<string, unknown>;
export interface SearchDataset {
  E?: SearchRecord[];
  TP?: SearchRecord[];
  S?: SearchRecord[];
  A?: SearchRecord[];
}
export interface SearchGates {
  excludeEvent(record: SearchRecord): boolean;
  includeSource(record: SearchRecord): boolean;
}
export interface SearchMatches {
  query: string;
  events: SearchRecord[];
  topics: SearchRecord[];
  sources: SearchRecord[];
  articles: SearchRecord[];
}
interface FoldedRecord {
  record: SearchRecord;
  text: string[];
}

export function normalizeSearchQuery(query: string): string {
  return query.trim().toLocaleLowerCase("tr");
}

/** Locale folding is done once per immutable public snapshot, never per input.
 * Notice/source gates deliberately run on every query: they are dynamic.
 * This is lexical substring retrieval, not semantic embeddings/vector search.
 */
export class SearchTextIndex {
  private events: FoldedRecord[];
  private topics: FoldedRecord[];
  private sources: FoldedRecord[];
  private articles: FoldedRecord[];
  readonly foldedCharacters: number;

  constructor(data: SearchDataset) {
    let characters = 0;
    const fold = (records: SearchRecord[] | undefined, keys: string[]) =>
      (records ?? []).map(record => ({
        record,
        text: keys.map(key => {
          // Match the original String(value) and Turkish locale semantics.
          const text = String(record[key]).toLocaleLowerCase("tr");
          characters += text.length;
          return text;
        }),
      }));
    this.events = fold(data.E, ["t", "sum"]);
    this.topics = fold(data.TP, ["n"]);
    this.sources = fold(data.S, ["n"]);
    this.articles = fold(data.A, ["t"]);
    this.foldedCharacters = characters;
  }

  search(rawQuery: string, gates: SearchGates): SearchMatches {
    const query = normalizeSearchQuery(rawQuery);
    const matches: SearchMatches = {
      query,
      events: [],
      topics: [],
      sources: [],
      articles: [],
    };
    if (query.length < 2) return matches;
    const has = (row: FoldedRecord) =>
      row.text.some(text => text.indexOf(query) >= 0);
    for (const row of this.events) {
      if (!gates.excludeEvent(row.record) && has(row))
        matches.events.push(row.record);
    }
    for (const row of this.topics)
      if (has(row)) matches.topics.push(row.record);
    for (const row of this.sources) {
      if (has(row) && gates.includeSource(row.record))
        matches.sources.push(row.record);
    }
    // The legacy result is filter(...).slice(0, 40). Stopping after the first
    // 40 preserves that exact ordering while avoiding unused article matches.
    for (const row of this.articles) {
      if (has(row)) matches.articles.push(row.record);
      if (matches.articles.length === 40) break;
    }
    return matches;
  }

  clear(): void {
    this.events = [];
    this.topics = [];
    this.sources = [];
    this.articles = [];
  }
}
