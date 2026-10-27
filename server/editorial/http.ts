import type { Express, Response } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  collectorBatchSchema,
  httpsUrl,
  slugSchema,
} from "../../shared/editorial";
import { RateLimiter } from "./rate-limit";
import { encodePublicBody, negotiate, notModified } from "./public-body";
import {
  collectorActor,
  findRecord,
  hasDatasetManifest,
  importCollectorBatch,
  publicDataset,
  submitIntake,
} from "./repository";

const corrections = new RateLimiter(10, 3600000);
const imports = new RateLimiter(120, 60000);
const intakeSchema = z
  .object({
    entityId: slugSchema,
    entityKind: z.enum(["article", "event", "source", "page"]),
    claim: z.string().trim().min(3).max(2000),
    message: z.string().trim().min(10).max(5000),
    evidenceUrl: httpsUrl.nullable().default(null),
    consent: z.literal(true),
    website: z.literal("").default(""),
  })
  .strict();
function failure(res: Response, error: unknown) {
  if (error instanceof z.ZodError)
    return res.status(400).json({
      error: "Invalid request",
      issues: error.issues.map(item => ({
        path: item.path,
        message: item.message,
      })),
    });
  if (error instanceof TRPCError) {
    const status =
      {
        NOT_FOUND: 404,
        BAD_REQUEST: 400,
        CONFLICT: 409,
        FORBIDDEN: 403,
        UNAUTHORIZED: 401,
        SERVICE_UNAVAILABLE: 503,
      }[error.code as "NOT_FOUND"] ?? 500;
    return res.status(status).json({
      error: status < 500 ? error.message : "Editorial service unavailable",
    });
  }
  console.error(
    "[Editorial] Request failed",
    error instanceof Error ? error.name : "unknown"
  );
  return res.status(500).json({ error: "Editorial service unavailable" });
}
export function registerEditorialHttp(app: Express) {
  app.get("/api/public/dataset", async (req, res) => {
    try {
      const body = await encodePublicBody(await publicDataset());
      // Browsers may keep the copy but must revalidate it every time, so an
      // editorial change is never served stale; unchanged data costs a 304.
      res.set({
        "Cache-Control": "no-cache",
        ETag: body.etag,
        Vary: "Accept-Encoding",
      });
      if (notModified(req.headers["if-none-match"], body.etag))
        return res.status(304).end();
      const encoding = negotiate(req.headers["accept-encoding"]);
      if (encoding !== "identity") res.set("Content-Encoding", encoding);
      return res.type("application/json").send(body[encoding]);
    } catch (error) {
      return failure(res, error);
    }
  });
  app.post("/api/editorial/corrections", async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!corrections.accept(req.ip ?? req.socket.remoteAddress ?? "unknown"))
      return res.status(429).json({ error: "Too many submissions; try later" });
    try {
      const input = intakeSchema.parse(req.body);
      const id =
        input.entityKind === "source" && !input.entityId.startsWith("source-")
          ? `source-${input.entityId}`
          : input.entityId;
      if (input.entityKind === "page") {
        if (!(await hasDatasetManifest(id)))
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Historical page snapshot not found",
          });
      } else {
        const target = await findRecord(id);
        if (target.kind !== input.entityKind || target.status !== "published")
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Public target not found",
          });
      }
      const intakeId = randomUUID();
      await submitIntake({
        id: intakeId,
        entityId: id,
        entityKind: input.entityKind,
        claim: input.claim,
        message: input.message,
        evidenceUrl: input.evidenceUrl,
        consentVersion: "intake-v1",
      });
      return res.status(201).json({ id: intakeId, status: "submitted" });
    } catch (error) {
      return failure(res, error);
    }
  });
  app.post("/api/collector/import", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const token = /^Bearer (cm_[a-f0-9]{64})$/.exec(
      req.headers.authorization ?? ""
    )?.[1];
    if (!token)
      return res
        .status(401)
        .json({ error: "A valid import token is required" });
    if (!imports.accept(token))
      return res
        .status(429)
        .json({ error: "Import rate limit", retryAfter: 60 });
    try {
      const actorId = await collectorActor(token);
      if (actorId === null)
        return res
          .status(401)
          .json({ error: "Import token expired or revoked" });
      const input = collectorBatchSchema.parse(req.body);
      return res.status(200).json(await importCollectorBatch(input, actorId));
    } catch (error) {
      return failure(res, error);
    }
  });
}
