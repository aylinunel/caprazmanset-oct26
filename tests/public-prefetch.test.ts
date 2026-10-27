import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import { mountPublicWebsite } from "../client/src/public/bootstrap";

function page() {
  const dom = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>', {
    url: "https://public.example.test/#/",
  });
  const fetch = vi.fn();
  Object.defineProperty(dom.window, "fetch", { configurable: true, value: fetch });
  return { dom, fetch, host: dom.window.document.getElementById("host") as HTMLElement };
}

describe("dataset prefetch", () => {
  it("uses the request the page shell already started instead of fetching again", async () => {
    const { dom, fetch, host } = page();
    const prefetched = Promise.resolve({ ok: true, json: async () => ({ not: "a dataset" }) } as unknown as Response);
    await mountPublicWebsite(host, prefetched);
    expect(fetch).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Tarihsel veri okunamadı");
    dom.window.close();
  });

  it("reports a failed prefetched request like a failed fetch", async () => {
    const { dom, fetch, host } = page();
    const prefetched = Promise.reject(new Error("offline"));
    await mountPublicWebsite(host, prefetched);
    expect(fetch).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Tarihsel veri yüklenemedi");
    dom.window.close();
  });

  it("still fetches by itself when nothing was prefetched", async () => {
    const { dom, fetch, host } = page();
    fetch.mockResolvedValue({ ok: false, status: 503 });
    await mountPublicWebsite(host);
    expect(fetch).toHaveBeenCalledWith("/api/public/dataset", { headers: { accept: "application/json" } });
    expect(host.textContent).toContain("Tarihsel veri yüklenemedi");
    dom.window.close();
  });
});
