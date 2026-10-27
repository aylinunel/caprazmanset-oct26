import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, isNull, gt, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import {
  auditEvents,
  correctionIntakes,
  datasetManifests,
  editorialRecords,
  importTokens,
  recordVersions,
  users,
  type EditorialRecord,
} from "../../drizzle/schema";
import {
  publicationErrors,
  type CollectorBatch,
  type PublicationRecord,
} from "../../shared/editorial";
import registry from "../../shared/source-registry.json";
import { validatePayload } from "./validation";
import { assemblePublicDataset } from "./dataset";

async function database() {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Editorial database is unavailable",
    });
  return db;
}
export async function findRecord(id: string) {
  const db = await database();
  const [record] = await db
    .select()
    .from(editorialRecords)
    .where(eq(editorialRecords.id, id))
    .limit(1);
  if (!record)
    throw new TRPCError({ code: "NOT_FOUND", message: "Record not found" });
  return record;
}
export async function listRecords(input: {
  kind?: EditorialRecord["kind"];
  status?: EditorialRecord["status"];
  offset: number;
  limit: number;
}) {
  const db = await database();
  const filters = [
    input.kind ? eq(editorialRecords.kind, input.kind) : undefined,
    input.status ? eq(editorialRecords.status, input.status) : undefined,
  ];
  const condition = and(...filters);
  const [items, [total]] = await Promise.all([
    db
      .select()
      .from(editorialRecords)
      .where(condition)
      .orderBy(desc(editorialRecords.updatedAt), editorialRecords.id)
      .limit(input.limit)
      .offset(input.offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(editorialRecords)
      .where(condition),
  ]);
  return { items, total: Number(total.count) };
}

let cachedDataset: { until: number; data: Record<string, unknown> } | null =
  null;
export function invalidateDataset() {
  cachedDataset = null;
}
export async function publicDataset() {
  if (cachedDataset && cachedDataset.until > Date.now())
    return cachedDataset.data;
  const db = await database();
  const [manifest] = await db
    .select()
    .from(datasetManifests)
    .orderBy(desc(datasetManifests.createdAt))
    .limit(1);
  if (!manifest)
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Historical dataset import is not ready",
    });
  const records = await db
    .select()
    .from(editorialRecords)
    .where(eq(editorialRecords.status, "published"));
  const data = assemblePublicDataset(
    manifest.supportingData,
    records,
    manifest.sha256
  );
  cachedDataset = { until: Date.now() + 30000, data };
  return data;
}

export async function saveRecord(
  input: {
    id: string;
    expectedVersion: number;
    title: string;
    payload: Record<string, unknown>;
    verificationStatus: EditorialRecord["verificationStatus"];
    provenanceNote: string;
    methodology: string;
    editorialDisclosure: string;
    evidenceUrl: string | null;
    reason: string;
  },
  actorId: number
) {
  const db = await database();
  await db.transaction(async tx => {
    const [old] = await tx
      .select()
      .from(editorialRecords)
      .where(eq(editorialRecords.id, input.id))
      .for("update");
    if (!old) throw new TRPCError({ code: "NOT_FOUND" });
    if (old.version !== input.expectedVersion)
      throw new TRPCError({
        code: "CONFLICT",
        message: "This record changed; refresh before editing",
      });
    let payload: Record<string, unknown>;
    try {
      payload = validatePayload(old.kind, input.payload, old.id);
    } catch (error) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: error instanceof Error ? error.message : "Invalid payload",
      });
    }
    if (old.kind === "article") payload.t = input.title;
    if (old.kind === "event") payload.t = input.title;
    if (old.kind === "source") payload.n = input.title;
    if (old.kind === "bias") payload.tr = input.title;
    await tx
      .insert(recordVersions)
      .values({
        recordId: old.id,
        version: old.version,
        snapshot: JSON.parse(JSON.stringify(old)),
        actorId,
        reason: input.reason,
      });
    await tx
      .update(editorialRecords)
      .set({
        title: input.title,
        payload,
        verificationStatus: input.verificationStatus,
        provenanceNote: input.provenanceNote,
        methodology: input.methodology,
        editorialDisclosure: input.editorialDisclosure,
        evidenceUrl: input.evidenceUrl,
        status: "draft",
        version: old.version + 1,
      })
      .where(eq(editorialRecords.id, old.id));
    await tx
      .insert(auditEvents)
      .values({
        entityId: old.id,
        action: "updated",
        actorId,
        reason: input.reason,
        beforeStatus: old.status,
        afterStatus: "draft",
      });
  });
  invalidateDataset();
}

export async function transitionRecord(
  id: string,
  expectedVersion: number,
  status: "published" | "archived",
  reason: string,
  actorId: number
) {
  const db = await database();
  await db.transaction(async tx => {
    const [record] = await tx
      .select()
      .from(editorialRecords)
      .where(eq(editorialRecords.id, id))
      .for("update");
    if (!record) throw new TRPCError({ code: "NOT_FOUND" });
    if (record.version !== expectedVersion)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Record version changed",
      });
    if (status === "published") {
      const errors = publicationErrors(record as PublicationRecord);
      if (record.kind === "article") {
        const [source] = await tx
          .select()
          .from(editorialRecords)
          .where(
            and(
              eq(editorialRecords.id, `source-${record.sourceSlug}`),
              eq(editorialRecords.status, "published")
            )
          )
          .limit(1);
        if (!source)
          errors.push("The article's source must be published first");
      }
      if (record.kind === "event") {
        const required = [
          ...(Array.isArray(record.payload.a) ? record.payload.a : []),
          ...(Array.isArray(record.payload.s)
            ? record.payload.s.map(slug => `source-${slug}`)
            : []),
        ];
        const available = await tx
          .select({ id: editorialRecords.id })
          .from(editorialRecords)
          .where(eq(editorialRecords.status, "published"));
        const ids = new Set(available.map(row => row.id));
        if (!required.every(value => ids.has(String(value))))
          errors.push("Event references must all be published");
      }
      if (errors.length)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: errors.join("; "),
        });
    }
    await tx
      .insert(recordVersions)
      .values({
        recordId: record.id,
        version: record.version,
        snapshot: JSON.parse(JSON.stringify(record)),
        actorId,
        reason,
      });
    await tx
      .update(editorialRecords)
      .set({ status, version: record.version + 1 })
      .where(eq(editorialRecords.id, id));
    await tx
      .insert(auditEvents)
      .values({
        entityId: id,
        action: status,
        actorId,
        reason,
        beforeStatus: record.status,
        afterStatus: status,
      });
  });
  invalidateDataset();
}

export async function issueImportToken(actorId: number, label: string) {
  const db = await database();
  const token = `cm_${randomBytes(32).toString("hex")}`;
  const id = randomUUID();
  await db.transaction(async tx => {
    await tx
      .insert(importTokens)
      .values({
        id,
        actorId,
        label,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + 30 * 86400000),
      });
    await tx
      .insert(auditEvents)
      .values({
        entityId: id,
        actorId,
        action: "token_created",
        reason: label,
      });
  });
  return { id, token, expiresInDays: 30 };
}
export async function collectorActor(token: string) {
  const db = await database();
  const [row] = await db
    .select({ actorId: importTokens.actorId })
    .from(importTokens)
    .innerJoin(users, eq(users.id, importTokens.actorId))
    .where(
      and(
        eq(
          importTokens.tokenHash,
          createHash("sha256").update(token).digest("hex")
        ),
        isNull(importTokens.revokedAt),
        gt(importTokens.expiresAt, new Date()),
        eq(users.role, "admin")
      )
    )
    .limit(1);
  return row?.actorId ?? null;
}
export async function tokensForAdmin() {
  const db = await database();
  return db
    .select({
      id: importTokens.id,
      label: importTokens.label,
      expiresAt: importTokens.expiresAt,
      revokedAt: importTokens.revokedAt,
    })
    .from(importTokens)
    .orderBy(desc(importTokens.createdAt));
}
export async function revokeToken(id: string, actorId: number) {
  const db = await database();
  await db.transaction(async tx => {
    const [token] = await tx
      .select()
      .from(importTokens)
      .where(eq(importTokens.id, id))
      .for("update");
    if (!token) throw new TRPCError({ code: "NOT_FOUND" });
    await tx
      .update(importTokens)
      .set({ revokedAt: new Date() })
      .where(eq(importTokens.id, id));
    await tx
      .insert(auditEvents)
      .values({
        entityId: id,
        actorId,
        action: "token_revoked",
        reason: "Admin revoked import access",
      });
  });
}

export function publisherUrlAllowed(slug: string, raw: string): boolean {
  const source = registry.find(row => row.slug === slug);
  if (!source) return false;
  try {
    const url = new URL(raw);
    const home = new URL(source.url);
    const normalize = (host: string) => host.replace(/^www\./, "");
    const domain =
      normalize(home.hostname) === "haberglobal.com.tr"
        ? "haberglobal.com"
        : normalize(home.hostname);
    const hostname = normalize(url.hostname);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443") &&
      !url.hash &&
      (hostname === domain || hostname.endsWith(`.${domain}`))
    );
  } catch {
    return false;
  }
}
export async function importCollectorBatch(
  batch: CollectorBatch,
  actorId: number
) {
  const db = await database();
  let accepted = 0;
  let duplicates = 0;
  for (const article of batch.articles) {
    if (
      !publisherUrlAllowed(article.source, article.url) ||
      registry.find(row => row.slug === article.source)?.name !==
        article.source_name
    )
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Source domain/name mismatch: ${article.source}`,
      });
  }
  await db.transaction(async tx => {
    for (const article of batch.articles) {
      const urlHash = createHash("sha256")
        .update(`${article.source}\n${article.url}`)
        .digest("hex");
      const id = `c-${urlHash.slice(0, 40)}`;
      const [insertResult] = await tx
        .insert(editorialRecords)
        .ignore()
        .values({
          id,
          urlHash,
          kind: "article",
          sourceSlug: article.source,
          title: article.title,
          payload: {
            i: id,
            s: article.source,
            t: article.title,
            u: article.url,
            d: article.published_at,
            c: "gundem",
            k: [],
            v: 0,
            b: "unreviewed",
            p: 0,
            e: [],
            st: null,
            fetchedAt: article.fetched_at,
            collectionMethod: article.method,
            runId: batch.runId,
          },
          status: "draft",
          verificationStatus: "provided",
          provenanceNote: `Collector ${batch.runId}; upstream ${batch.upstreamCommit}; fetched ${article.fetched_at}`,
          methodology: `Publisher metadata (${article.method}); not a political or bias assessment`,
          editorialDisclosure:
            "Toplanan kayıt; başlık, tarih ve kaynak bağlantısı editör tarafından doğrulanmadı.",
          evidenceUrl: null,
        });
      if (insertResult.affectedRows !== 1) {
        duplicates++;
        continue;
      }
      await tx
        .insert(auditEvents)
        .values({
          entityId: id,
          actorId,
          action: "created",
          reason: `Collector run ${batch.runId}`,
          afterStatus: "draft",
        });
      accepted++;
    }
  });
  return {
    accepted,
    duplicates,
    rejected: 0,
    status: "draft" as const,
    runId: batch.runId,
  };
}

export async function listAudit() {
  return (await database())
    .select()
    .from(auditEvents)
    .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
    .limit(100);
}
export async function history(id: string) {
  return (await database())
    .select()
    .from(recordVersions)
    .where(eq(recordVersions.recordId, id))
    .orderBy(desc(recordVersions.version));
}
export async function listIntakes() {
  return (await database())
    .select()
    .from(correctionIntakes)
    .orderBy(desc(correctionIntakes.createdAt))
    .limit(100);
}
export async function submitIntake(
  input: typeof correctionIntakes.$inferInsert
) {
  const db = await database();
  await db.transaction(async tx => {
    await tx.insert(correctionIntakes).values(input);
    await tx
      .insert(auditEvents)
      .values({
        entityId: input.id,
        action: "intake_submitted",
        reason: "Private reader feedback intake; target unchanged",
        afterStatus: "submitted",
      });
  });
}
export async function triageIntake(
  id: string,
  status: "triaged" | "closed",
  reason: string,
  actorId: number
) {
  const db = await database();
  await db.transaction(async tx => {
    const [old] = await tx
      .select()
      .from(correctionIntakes)
      .where(eq(correctionIntakes.id, id))
      .for("update");
    if (!old) throw new TRPCError({ code: "NOT_FOUND" });
    if (old.status === "closed")
      throw new TRPCError({
        code: "CONFLICT",
        message: "Closed intakes cannot be changed",
      });
    await tx
      .update(correctionIntakes)
      .set({ status })
      .where(eq(correctionIntakes.id, id));
    await tx
      .insert(auditEvents)
      .values({
        entityId: id,
        action: "intake_triaged",
        actorId,
        reason,
        beforeStatus: old.status,
        afterStatus: status,
      });
  });
}

export async function hasDatasetManifest(id: string): Promise<boolean> {
  const [row] = await (await database())
    .select({ id: datasetManifests.id })
    .from(datasetManifests)
    .where(eq(datasetManifests.id, id))
    .limit(1);
  return Boolean(row);
}
