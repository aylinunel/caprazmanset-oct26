import "dotenv/config";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import {
  auditEvents,
  datasetManifests,
  editorialRecords,
} from "../drizzle/schema";
import registry from "../shared/source-registry.json";

const path = process.argv[2] ?? "data/original-dataset.json";
const raw = await readFile(path, "utf8");
const input = JSON.parse(raw) as Record<string, unknown>;
const sha256 = createHash("sha256").update(raw).digest("hex");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const connection = await mysql.createConnection(process.env.DATABASE_URL);
const db = drizzle(connection);
const manifestId = "historical-2026-10-13";
try {
  const [existing] = await db
    .select()
    .from(datasetManifests)
    .where(eq(datasetManifests.id, manifestId))
    .limit(1);
  if (existing) {
    if (existing.sha256 !== sha256)
      throw new Error(
        "Historical import exists with a different hash; refusing overwrite"
      );
    console.log(
      "Historical dataset already imported; existing editor changes preserved."
    );
  } else {
    const rows: (typeof editorialRecords.$inferInsert)[] = [];
    const note = `User-supplied Çapraz Manşet 3.0 HTML snapshot; dataset SHA256 ${sha256}; not independently verified`;
    const disclosure =
      "Sağlanan tarihsel araştırma verisi; siyasi yerleşim, bağlantılar ve yanlılık örnekleri bağımsız doğrulanmadı.";
    const method = String(
      (input.meta as Record<string, unknown>)?.method ??
        "User-provided historical sample"
    );
    for (const [key, kind, prefix] of [
      ["A", "article", ""],
      ["E", "event", ""],
      ["S", "source", "source-"],
      ["B", "bias", "bias-"],
    ] as const) {
      for (const payload of input[key] as Record<string, unknown>[]) {
        const identifier = String(payload.i ?? payload.s ?? payload.k);
        if (!/^[a-zA-Z0-9_-]{1,90}$/.test(identifier))
          throw new Error(`Invalid identifier ${identifier}`);
        if (
          (kind === "article" || kind === "source") &&
          typeof payload.u === "string" &&
          new URL(payload.u).protocol !== "https:"
        )
          throw new Error("Non-HTTPS source link");
        rows.push({
          id: `${prefix}${identifier}`,
          kind,
          sourceSlug:
            kind === "article" || kind === "source" ? String(payload.s) : null,
          urlHash:
            kind === "article"
              ? createHash("sha256")
                  .update(`${payload.s}\n${payload.u}`)
                  .digest("hex")
              : null,
          title: String(
            payload.t ?? payload.n ?? payload.tr ?? identifier
          ).slice(0, 1000),
          payload,
          status: "published",
          verificationStatus: "provided",
          provenanceNote: note,
          methodology: method,
          editorialDisclosure: disclosure,
          evidenceUrl: null,
        });
      }
    }
    const sourceSlugs = new Set(
      (input.S as Record<string, unknown>[]).map(row => String(row.s))
    );
    for (const source of registry)
      if (!sourceSlugs.has(source.slug))
        rows.push({
          id: `source-${source.slug}`,
          kind: "source",
          sourceSlug: source.slug,
          title: source.name,
          payload: {
            s: source.slug,
            n: source.name,
            u: source.url,
            lean: null,
            t: "unknown",
            note: "Kaynak kaydı; yerleşim değerlendirmesi yapılmadı.",
          },
          status: "draft",
          verificationStatus: "needs_review",
          provenanceNote: "Supplied upstream publisher registry",
          methodology: "Registry import; URL review pending",
          editorialDisclosure:
            "Kaynak kaydı; bağımsız doğrulama ve siyasi yerleşim yok.",
          evidenceUrl: null,
        });
    const supporting = structuredClone(input);
    for (const key of ["A", "E", "S", "B"]) delete supporting[key];
    for (const key of ["P", "G", "ADV"])
      if (key in supporting) {
        rows.push({
          id: `analysis-${key}`,
          kind: "analysis",
          title: `Tarihsel analiz · ${key}`,
          payload: { key, data: supporting[key] },
          status: "published",
          verificationStatus: "provided",
          provenanceNote: note,
          methodology:
            "Precomputed supplied output; generating code and independent verification unavailable",
          editorialDisclosure: disclosure,
          evidenceUrl: null,
        });
        delete supporting[key];
      }
    const ids = new Set<string>();
    for (const row of rows) {
      if (ids.has(row.id)) throw new Error(`Duplicate ID ${row.id}`);
      ids.add(row.id);
    }
    const articleIds = new Set(
      (input.A as Record<string, unknown>[]).map(row => String(row.i))
    );
    for (const event of input.E as Record<string, unknown>[])
      for (const id of event.a as string[])
        if (!articleIds.has(id)) throw new Error(`Broken event article ${id}`);
    await db.transaction(async tx => {
      for (let offset = 0; offset < rows.length; offset += 100) {
        await tx
          .insert(editorialRecords)
          .values(rows.slice(offset, offset + 100));
        if (offset % 2000 === 0)
          console.log(`Imported ${offset}/${rows.length} historical records`);
      }
      await tx
        .insert(datasetManifests)
        .values({ id: manifestId, sha256, supportingData: supporting });
      await tx
        .insert(auditEvents)
        .values({
          entityId: manifestId,
          action: "historical_import",
          actorId: null,
          reason:
            "Owner-approved migration of supplied published research snapshot; labelled provided, not verified",
          afterStatus: "published",
        });
    });
    console.log(
      `Imported ${rows.length} records. Historical provenance: ${sha256}`
    );
  }
} finally {
  await connection.end();
}
