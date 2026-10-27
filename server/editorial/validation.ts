import { z } from "zod";
import { httpsUrl, slugSchema } from "../../shared/editorial";

export const analysisKeys = ["P", "G", "ADV"] as const;

const boundedText = z.string().max(20000);
const base = z.object({}).catchall(z.unknown());
export const payloadSchemas = {
  article: base.extend({
    i: slugSchema,
    s: slugSchema,
    t: z.string().min(1).max(1000),
    u: httpsUrl.optional(),
    d: z.string().max(100).nullable().optional(),
    k: z.array(slugSchema).max(200).optional(),
    st: slugSchema.nullable().optional(),
  }),
  event: base.extend({
    i: slugSchema,
    t: z.string().min(1).max(1000),
    a: z.array(slugSchema).max(5000),
    s: z.array(slugSchema).max(100),
    cov: z.array(z.number().int().nonnegative()).length(3).optional(),
  }),
  source: base.extend({
    s: slugSchema,
    n: z.string().min(1).max(200),
    u: httpsUrl,
    lean: z.number().min(0).max(100).nullable().optional(),
  }),
  bias: base.extend({
    k: slugSchema,
    tr: z.string().min(1).max(200),
    df: boundedText.optional(),
  }),
  analysis: base.extend({ key: z.enum(analysisKeys), data: z.unknown() }),
};

export function validatePayload(
  kind: keyof typeof payloadSchemas,
  input: Record<string, unknown>,
  id: string
) {
  const result = payloadSchemas[kind].parse(input);
  const payloadId =
    kind === "source"
      ? result.s
      : kind === "bias"
        ? result.k
        : kind === "analysis"
          ? result.key
          : result.i;
  const stableId =
    kind === "source"
      ? `source-${payloadId}`
      : kind === "bias"
        ? `bias-${payloadId}`
        : kind === "analysis"
          ? `analysis-${payloadId}`
          : payloadId;
  if (stableId !== id) throw new Error("Payload identity cannot change");
  // This compatibility renderer supports only plain data, not executable HTML.
  const scan = (value: unknown): void => {
    if (
      typeof value === "string" &&
      /[<>]|javascript:|data:text\/html|onerror\s*=/i.test(value)
    )
      throw new Error(
        "HTML or executable values are not accepted in editorial payloads"
      );
    if (Array.isArray(value)) value.forEach(scan);
    else if (value && typeof value === "object")
      Object.values(value).forEach(scan);
  };
  scan(result);
  return result;
}
