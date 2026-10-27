import type { NextFunction, Request, Response } from "express";

/** A custom header + JSON-only writes prevent cross-site form/multipart CSRF.
 * No cross-origin CORS permission is supplied. Sec-Fetch-Site is browser-owned.
 * Collector imports use separate explicit Bearer authorization, not cookies.
 */
export function requireMutationTransport(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS")
    return next();
  const contentType = req.headers["content-type"]
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (
    req.headers["x-capraz-request"] !== "1" ||
    contentType !== "application/json" ||
    req.headers["sec-fetch-site"] === "cross-site"
  ) {
    return res
      .status(403)
      .json({ error: "Same-origin JSON mutation transport required" });
  }
  return next();
}
