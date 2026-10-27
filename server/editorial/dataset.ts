import type { EditorialRecord } from "../../drizzle/schema";

/** Only explicit published records can contribute to this public compatibility view. */
export function assemblePublicDataset(
  supporting: Record<string, unknown>,
  rows: EditorialRecord[],
  sha256: string
) {
  const records = rows.filter(row => row.status === "published");
  const data: Record<string, unknown> = structuredClone(supporting);
  const bucket = (kind: EditorialRecord["kind"]): Record<string, unknown>[] =>
    records
      .filter(row => row.kind === kind)
      .map(row => ({
        ...row.payload,
        status: row.status,
        verificationStatus: row.verificationStatus,
        ...(kind === "source"
          ? {
              provenanceNote: row.provenanceNote,
              editorialDisclosure: row.editorialDisclosure,
            }
          : {}),
      }));
  const sources = bucket("source");
  const sourceIds = new Set(sources.map(row => String(row.s)));
  const articles: Record<string, unknown>[] = bucket("article")
    .filter(row => sourceIds.has(String(row.s)))
    .map(row =>
      typeof row.d === "string" ? row : { ...row, publishedAt: null, d: "" }
    );
  const articleIds = new Set(articles.map(row => String(row.i)));
  const events = bucket("event").filter(
    row =>
      Array.isArray(row.a) &&
      row.a.every(id => articleIds.has(String(id))) &&
      Array.isArray(row.s) &&
      row.s.every(id => sourceIds.has(String(id)))
  );
  const eventIds = new Set(events.map(row => String(row.i)));
  data.A = articles;
  data.E = events;
  data.S = sources;
  data.B = bucket("bias");
  for (const record of records.filter(row => row.kind === "analysis"))
    if (typeof record.payload.key === "string")
      data[record.payload.key] = record.payload.data;
  if (Array.isArray(data.TP))
    data.TP = data.TP.map((topic: Record<string, unknown>) => ({
      ...topic,
      e: Array.isArray(topic.e)
        ? topic.e.filter(id => eventIds.has(String(id)))
        : [],
    }));
  const meta = (data.meta ?? {}) as Record<string, unknown>;
  data.meta = {
    ...meta,
    datasetVersion: "historical-2026-10-13",
    disclosure:
      "Sağlanan tarihsel veri; bağımsız doğrulama yapılmadı. Yeni kayıtlar editör onayına tabidir.",
    importSha256: sha256,
    publicCounts: {
      articles: articles.length,
      events: events.length,
      sources: sources.length,
    },
    analysisScope:
      "Önceden hesaplanmış analizler yalnızca özgün tarihsel derleme aittir; yeni kayıtlarla otomatik güncellenmez.",
  };
  return data;
}
