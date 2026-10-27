import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import {
  httpsUrl,
  kindValues,
  slugSchema,
  statusValues,
  verificationValues,
} from "../../shared/editorial";
import * as store from "./repository";

const reason = z.string().trim().min(10).max(2000);
export const editorialRouter = router({
  list: adminProcedure
    .input(
      z.object({
        kind: z.enum(kindValues).optional(),
        status: z.enum(statusValues).optional(),
        offset: z.number().int().min(0).max(100000).default(0),
        limit: z.number().int().min(1).max(100).default(40),
      })
    )
    .query(({ input }) => store.listRecords(input)),
  detail: adminProcedure
    .input(z.object({ id: slugSchema }))
    .query(({ input }) => store.findRecord(input.id)),
  save: adminProcedure
    .input(
      z.object({
        id: slugSchema,
        expectedVersion: z.number().int().positive(),
        title: z.string().trim().min(1).max(1000),
        payload: z.record(z.string(), z.unknown()),
        verificationStatus: z.enum(verificationValues),
        provenanceNote: z.string().min(1).max(10000),
        methodology: z.string().min(1).max(10000),
        editorialDisclosure: z.string().min(1).max(5000),
        evidenceUrl: httpsUrl.nullable(),
        reason,
      })
    )
    .mutation(({ input, ctx }) => store.saveRecord(input, ctx.user.id)),
  publish: adminProcedure
    .input(
      z.object({
        id: slugSchema,
        expectedVersion: z.number().int().positive(),
        reason,
      })
    )
    .mutation(({ input, ctx }) =>
      store.transitionRecord(
        input.id,
        input.expectedVersion,
        "published",
        input.reason,
        ctx.user.id
      )
    ),
  archive: adminProcedure
    .input(
      z.object({
        id: slugSchema,
        expectedVersion: z.number().int().positive(),
        reason,
      })
    )
    .mutation(({ input, ctx }) =>
      store.transitionRecord(
        input.id,
        input.expectedVersion,
        "archived",
        input.reason,
        ctx.user.id
      )
    ),
  audit: adminProcedure.query(() => store.listAudit()),
  history: adminProcedure
    .input(z.object({ id: slugSchema }))
    .query(({ input }) => store.history(input.id)),
  intakes: adminProcedure.query(() => store.listIntakes()),
  triage: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.enum(["triaged", "closed"]),
        reason,
      })
    )
    .mutation(({ input, ctx }) =>
      store.triageIntake(input.id, input.status, input.reason, ctx.user.id)
    ),
  tokens: adminProcedure.query(() => store.tokensForAdmin()),
  issueToken: adminProcedure
    .input(z.object({ label: z.string().trim().min(1).max(100) }))
    .mutation(({ input, ctx }) =>
      store.issueImportToken(ctx.user.id, input.label)
    ),
  revokeToken: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ input, ctx }) => store.revokeToken(input.id, ctx.user.id)),
});
