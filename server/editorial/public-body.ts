import { createHash } from "node:crypto";
import { promisify } from "node:util";
import zlib from "node:zlib";

const gzip = promisify(zlib.gzip);
const brotli = promisify(zlib.brotliCompress);

export type Encoding = "br" | "gzip" | "identity";
export type EncodedBody = { etag: string } & Record<Encoding, Buffer>;

/**
 * The public dataset is ~6 MB of JSON. Serializing and compressing it costs
 * ~160 ms of event-loop time, so it is done once per distinct content instead
 * of once per request. The ETag is the SHA-256 of the exact JSON bytes, so an
 * unchanged dataset keeps its ETag across cache refreshes and replicas.
 */
let last: { etag: string; body: Promise<EncodedBody> } | null = null;
const byObject = new WeakMap<object, Promise<EncodedBody>>();

export function encodePublicBody(data: object): Promise<EncodedBody> {
  const known = byObject.get(data);
  if (known) return known;
  const identity = Buffer.from(JSON.stringify(data), "utf8");
  const etag = `"${createHash("sha256").update(identity).digest("base64url")}"`;
  if (!last || last.etag !== etag) {
    const body = Promise.all([
      gzip(identity, { level: 9 }),
      brotli(identity, {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: 9,
          [zlib.constants.BROTLI_PARAM_SIZE_HINT]: identity.length,
        },
      }),
    ]).then(([gz, br]) => ({ etag, identity, gzip: gz, br }));
    // A failed compression must not be cached.
    body.catch(() => {
      if (last?.body === body) last = null;
    });
    last = { etag, body };
  }
  byObject.set(data, last.body);
  return last.body;
}

/** Picks the smallest encoding the client accepts (q=0 excludes it). */
export function negotiate(header: string | undefined): Encoding {
  const accepted = new Map<string, number>();
  for (const part of (header ?? "").split(",")) {
    const [name, ...params] = part.trim().toLowerCase().split(";");
    if (!name) continue;
    const q = params.map(p => /^\s*q=([0-9.]+)\s*$/.exec(p)?.[1]).find(Boolean);
    accepted.set(name, q === undefined ? 1 : Number(q));
  }
  const ok = (name: string) =>
    (accepted.get(name) ?? accepted.get("*") ?? 0) > 0;
  if (ok("br")) return "br";
  if (ok("gzip")) return "gzip";
  return "identity";
}

/** RFC 9110 If-None-Match: a list of entity tags or "*"; weak comparison. */
export function notModified(header: string | undefined, etag: string) {
  if (!header) return false;
  if (header.trim() === "*") return true;
  const strip = (tag: string) => tag.trim().replace(/^W\//, "");
  return header.split(",").some(tag => strip(tag) === strip(etag));
}
