import { z } from "zod";

export const verificationValues = [
  "provided",
  "verified",
  "demo",
  "needs_review",
] as const;
export const statusValues = ["draft", "published", "archived"] as const;
export const kindValues = [
  "article",
  "event",
  "source",
  "bias",
  "analysis",
] as const;

export function safeExternalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      /[\u0000-\u0020<>"']/.test(value)
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

export const httpsUrl = z
  .string()
  .max(2048)
  .refine(
    value => safeExternalUrl(value) !== null,
    "A valid credential-free HTTPS URL is required"
  );
export const slugSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const collectorArticleSchema = z
  .object({
    source: slugSchema,
    source_name: z.string().min(1).max(200),
    url: httpsUrl,
    title: z.string().min(1).max(1000),
    published_at: z.string().max(100).nullable(),
    fetched_at: z.string().datetime({ offset: true }),
    summary: z.string().max(5000).default(""),
    method: z.string().min(1).max(100),
  })
  .strict();
export const collectorBatchSchema = z
  .object({
    schemaVersion: z.literal(1),
    runId: slugSchema,
    upstreamCommit: z.string().regex(/^[a-f0-9]{40}$/),
    articles: z.array(collectorArticleSchema).min(1).max(100),
  })
  .strict();
export type CollectorBatch = z.infer<typeof collectorBatchSchema>;

export type PublicationRecord = {
  kind: (typeof kindValues)[number];
  verificationStatus: (typeof verificationValues)[number];
  provenanceNote: string;
  methodology: string;
  editorialDisclosure: string;
  evidenceUrl: string | null;
  payload: Record<string, unknown>;
};

export function publicationErrors(record: PublicationRecord): string[] {
  const errors: string[] = [];
  if (!record.provenanceNote.trim()) errors.push("Provenance is required");
  if (!record.methodology.trim()) errors.push("Methodology is required");
  if (!record.editorialDisclosure.trim())
    errors.push("Public disclosure is required");
  if (record.verificationStatus === "needs_review")
    errors.push("Unreviewed records cannot be published");
  if (
    record.kind === "article" &&
    record.verificationStatus !== "verified" &&
    record.verificationStatus !== "demo"
  )
    errors.push(
      "New article publication requires verified evidence or an explicit demo"
    );
  if (
    record.verificationStatus === "verified" &&
    (!record.evidenceUrl || !safeExternalUrl(record.evidenceUrl))
  )
    errors.push("Verified records need an HTTPS evidence URL");
  if (
    record.kind === "article" &&
    record.verificationStatus === "verified" &&
    (!record.payload.u || !safeExternalUrl(String(record.payload.u)))
  )
    errors.push("An article's original link must be valid HTTPS");
  if (record.verificationStatus === "demo" && record.payload.u)
    errors.push("Demo records must not have fictional original links");
  if (record.kind === "source") {
    const coordinates = ["lean", "eco", "soc", "sec", "st", "nat", "cul"];
    if (
      coordinates.some(
        key =>
          typeof record.payload[key] !== "number" ||
          !Number.isFinite(record.payload[key]) ||
          Number(record.payload[key]) < 0 ||
          Number(record.payload[key]) > 100
      )
    )
      errors.push(
        "Source profiles require explicitly reviewed 0–100 coordinates; unknown positions must remain drafts"
      );
  }
  if (
    record.kind === "analysis" &&
    record.verificationStatus !== "verified" &&
    record.verificationStatus !== "demo"
  )
    errors.push(
      "Sensitive analysis requires verified evidence or a demo label"
    );
  return errors;
}
