import { describe, expect, it, vi } from "vitest";
import { isLegacyAdminHash, normalizeUnsafeInitialHash, parsePublicHash, redirectLegacyAdmin } from "../client/src/public/hash";

describe("public hash compatibility", () => {
  it("uses URLSearchParams semantics without throwing on corrupted encodings", () => {
    const corrupted = parsePublicHash("#/ara?q=%E0%A4%A");
    expect(corrupted).toMatchObject({ path: "/ara", malformed: true, unsupported: false });

    const ordinary = parsePublicHash("#/olay?e=s1&label=a%3Db&label=son");
    expect(ordinary.malformed).toBe(false);
    expect(ordinary.params.get("e")).toBe("s1");
    expect(ordinary.params.get("label")).toBe("a=b");
  });

  it("normalizes malformed and unsupported public hashes safely", () => {
    const malformed = { location: { hash: "#/ara?q=%", assign: vi.fn() } } as unknown as Window;
    normalizeUnsafeInitialHash(malformed);
    expect(malformed.location.hash).toBe("#/");

    const unsupported = { location: { hash: "#/bilinmeyen", assign: vi.fn() } } as unknown as Window;
    normalizeUnsafeInitialHash(unsupported);
    expect(unsupported.location.hash).toBe("#/");
  });

  it("redirects every legacy hash-admin route to the protected workspace", () => {
    for (const hash of ["#/yonetim", "#/yonetim?t=panel", "#/yonetim?t=inceleme", "#/yonetim/legacy"]) {
      expect(isLegacyAdminHash(hash)).toBe(true);
    }
    expect(isLegacyAdminHash("#/olay?e=s1")).toBe(false);

    const assign = vi.fn();
    redirectLegacyAdmin({ location: { assign } } as unknown as Window);
    expect(assign).toHaveBeenCalledWith("/yonetim");
  });
});
