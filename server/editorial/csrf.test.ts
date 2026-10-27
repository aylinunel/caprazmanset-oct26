import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { requireMutationTransport } from "./csrf";
function run(method: string, headers: Record<string, string>) {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const next = vi.fn();
  requireMutationTransport(
    { method, headers } as Request,
    { status } as unknown as Response,
    next
  );
  return { status, json, next };
}
describe("same-origin mutation transport", () => {
  it("permits safe reads without a mutation header", () =>
    expect(run("GET", {}).next).toHaveBeenCalledOnce());
  it.each([
    "application/x-www-form-urlencoded",
    "multipart/form-data",
    "text/plain",
  ])("rejects a form/logout CSRF using %s", type => {
    const result = run("POST", { "content-type": type });
    expect(result.status).toHaveBeenCalledWith(403);
    expect(result.next).not.toHaveBeenCalled();
  });
  it("requires the custom header even for JSON", () =>
    expect(
      run("POST", { "content-type": "application/json" }).status
    ).toHaveBeenCalledWith(403));
  it("rejects browser cross-site requests even with the header", () =>
    expect(
      run("POST", {
        "content-type": "application/json",
        "x-capraz-request": "1",
        "sec-fetch-site": "cross-site",
      }).status
    ).toHaveBeenCalledWith(403));
  it("permits JSON calls from the same-origin application client", () =>
    expect(
      run("POST", {
        "content-type": "application/json; charset=utf-8",
        "x-capraz-request": "1",
        "sec-fetch-site": "same-origin",
      }).next
    ).toHaveBeenCalledOnce());
});
