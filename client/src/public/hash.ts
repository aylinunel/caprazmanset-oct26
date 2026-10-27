const PUBLIC_PATHS = new Set([
  "/",
  "/olaylar",
  "/olay",
  "/konu",
  "/anlati",
  "/kurumlar",
  "/kurum",
  "/harita",
  "/bulgular",
  "/yanlilik",
  "/yontem",
  "/benim",
  "/ara",
]);

export interface ParsedPublicHash {
  path: string;
  params: URLSearchParams;
  malformed: boolean;
  unsupported: boolean;
}

/** Validate legacy decoding requirements before parsing query parameters. */
export function parsePublicHash(hash: string): ParsedPublicHash {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (raw.length > 8192)
    return {
      path: "/",
      params: new URLSearchParams(),
      malformed: true,
      unsupported: false,
    };

  const question = raw.indexOf("?");
  const path = (question < 0 ? raw : raw.slice(0, question)) || "/";
  const query = question < 0 ? "" : raw.slice(question + 1);
  // URLSearchParams replaces invalid UTF-8 rather than throwing, but the
  // preserved renderer still uses decodeURIComponent. Reject both incomplete
  // escapes and invalid byte sequences before that renderer sees the hash.
  let malformed = false;
  try {
    decodeURIComponent(query);
  } catch {
    malformed = true;
  }
  return {
    path,
    params: new URLSearchParams(query),
    malformed,
    unsupported: !PUBLIC_PATHS.has(path),
  };
}

export function isLegacyAdminHash(hash: string): boolean {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  return (
    raw === "/yonetim" ||
    raw.startsWith("/yonetim?") ||
    raw.startsWith("/yonetim/")
  );
}

export function redirectLegacyAdmin(
  windowLike: Pick<Window, "location">
): void {
  windowLike.location.assign("/yonetim");
}

export function normalizeUnsafeInitialHash(
  windowLike: Pick<Window, "location">
): void {
  const parsed = parsePublicHash(windowLike.location.hash);
  if (parsed.malformed || parsed.unsupported) windowLike.location.hash = "#/";
}
