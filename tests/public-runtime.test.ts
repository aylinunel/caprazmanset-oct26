import fs from "node:fs";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";
import DOMPurify from "dompurify";
import { createPublicRuntime } from "../client/src/public/runtime";
import { mountLegacyRenderer } from "../client/src/public/legacy/index.js";

const doms: JSDOM[] = [];

afterEach(() => {
  while (doms.length) doms.pop()?.window.close();
});

function createRuntime(data: Record<string, unknown> = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="outside"></div><div id="host"></div></body></html>', {
    pretendToBeVisual: true,
    url: "https://public.example.test/#/",
  });
  doms.push(dom);

  const { document, window } = dom.window;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  });

  const host = document.getElementById("host") as HTMLElement;
  const root = document.createElement("div");
  root.id = "capraz-public-root";
  root.innerHTML = '<div id="app"></div>';
  host.append(root);

  return { dom, root, runtime: createPublicRuntime({ host, root, data, logo: {} }) };
}

type LegacyRuntime = ReturnType<typeof createPublicRuntime> & {
  openFix(kind: string, id: string, label?: string): void;
  v3openAppeal(button?: unknown): void;
};

function submitCorrection(runtime: LegacyRuntime, dom: JSDOM, open: () => void) {
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ id: "case-1", status: "submitted" }),
  });
  (runtime.window as Window & Record<string, unknown>).fetch = fetch;
  open();

  const form = runtime.root.querySelector("form") as HTMLFormElement;
  expect(form).not.toBeNull();
  (form.elements.namedItem("claim") as HTMLTextAreaElement).value = "Bu kaydın düzeltilmesi gerekiyor.";
  (form.elements.namedItem("message") as HTMLTextAreaElement).value = "Bu giriş için açıklayıcı kanıt sunuyorum.";
  (form.elements.namedItem("consent") as HTMLInputElement).checked = true;
  form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));

  expect(fetch).toHaveBeenCalledOnce();
  const init = fetch.mock.calls[0][1] as RequestInit;
  return JSON.parse(String(init.body)) as { entityId: string; entityKind: string };
}

function withBrowserGlobals<T>(dom: JSDOM, work: () => T): T {
  const values = {
    window: dom.window,
    document: dom.window.document,
    scrollTo: dom.window.scrollTo.bind(dom.window),
    history: dom.window.history,
  };
  const prior = new Map(Object.keys(values).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  try {
    return work();
  } finally {
    for (const key of Object.keys(values)) {
      const descriptor = prior.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}

describe("public runtime DOM facade", () => {
  it("binds native WebIDL members to the owning jsdom window and document", () => {
    const { dom, root, runtime } = createRuntime();

    expect(() => {
      const createElement = runtime.document.createElement;
      const element = createElement("section");
      const svg = runtime.document.createElementNS("http://www.w3.org/2000/svg", "svg");
      const text = runtime.document.createTextNode("public runtime");
      element.append(text, svg);
      runtime.document.body.append(element);

      expect(typeof runtime.window.innerWidth).toBe("number");
      expect(runtime.window.getComputedStyle(element).display).toBe("block");
      const matchMedia = runtime.window.matchMedia.bind(runtime.window);
      const setTimeout = runtime.window.setTimeout.bind(runtime.window);
      const clearTimeout = runtime.window.clearTimeout.bind(runtime.window);
      const requestAnimationFrame = runtime.window.requestAnimationFrame.bind(runtime.window);
      const cancelAnimationFrame = runtime.window.cancelAnimationFrame.bind(runtime.window);
      expect(matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(false);
      const timer = setTimeout(() => undefined, 0);
      clearTimeout(timer);
      const frame = requestAnimationFrame(() => undefined);
      cancelAnimationFrame(frame);
    }).not.toThrow();

    expect(runtime.window.location).toBe(dom.window.location);
    expect(runtime.window.document).toBe(runtime.document);
    expect(runtime.window.window).toBe(runtime.window);
    expect(runtime.location).toBe(dom.window.location);
    expect(runtime.history).toBe(dom.window.history);
    expect(runtime.document.defaultView).toBe(runtime.window);
    expect(runtime.document.body).toBe(root);
    expect(runtime.document.documentElement).toBe(root);
  });

  it("keeps DOM lookups and legacy window writes scoped to the public facade", () => {
    const { dom, root, runtime } = createRuntime();

    expect(runtime.document.querySelector("#outside")).toBeNull();
    expect(runtime.document.getElementById("outside")).toBeNull();
    expect(runtime.document.getElementById("app")).toBe(root.querySelector("#app"));

    const facadeWindow = runtime.window as Window & Record<string, unknown>;
    facadeWindow._lt = 123;
    expect(facadeWindow._lt).toBe(123);
    expect((dom.window as unknown as Window & Record<string, unknown>)._lt).toBeUndefined();

    runtime.cleanup();
    expect(root.childElementCount).toBe(0);
  });

  it("keeps articles with an unknown upstream publication date renderable", async () => {
    const { initializeFoundation } = await import("../client/src/public/legacy/00-foundation.js");
    const { runtime } = createRuntime({
      A: [{ i: "article-no-date", s: "source-1", t: "Tarihsiz başlık", d: "", publishedAt: null, p: false, v: 0, k: [] }],
      B: [],
      F: [],
      R: [],
      S: [{ s: "source-1", n: "Kaynak" }],
      meta: { perDay: {} },
    });

    expect(() => initializeFoundation(runtime)).not.toThrow();
    runtime.installPublicOverrides();
    const legacyRuntime = runtime as typeof runtime & {
      STAT: Record<string, { days: Record<string, number> }>;
      fmtD(value: unknown): string;
      fmtDT(value: unknown): string;
    };

    expect(legacyRuntime.STAT["source-1"].days).toEqual({ "": 1 });
    expect(legacyRuntime.fmtD("")).toBe("Yayın tarihi belirtilmedi");
    expect(legacyRuntime.fmtDT("")).toBe("Yayın tarihi belirtilmedi");
    expect(legacyRuntime.fmtD("2026-10-13T00:00")).not.toBe("Yayın tarihi belirtilmedi");
  });

  it("mounts the supplied renderer and original dataset without unbound legacy globals", () => {
    const data = JSON.parse(fs.readFileSync(new URL("../data/original-dataset.json", import.meta.url), "utf8")) as Record<string, unknown>;
    const { dom, root, runtime } = createRuntime(data);
    Object.defineProperty(dom.window, "IntersectionObserver", {
      configurable: true,
      value: class { observe() {} disconnect() {} },
    });
    Object.defineProperty(dom.window, "scrollTo", { configurable: true, value: () => undefined });
    Object.defineProperty(dom.window.HTMLCanvasElement.prototype, "getContext", { configurable: true, value: () => null });

    const purifier = DOMPurify as typeof DOMPurify & { sanitize?: unknown };
    if (typeof purifier.sanitize !== "function") Object.assign(purifier, DOMPurify(dom.window));

    withBrowserGlobals(dom, () => {
      expect(() => mountLegacyRenderer(runtime)).not.toThrow();
      dom.window.history.replaceState(null, "", "#/harita");
      expect(() => (runtime as typeof runtime & { route(): void }).route()).not.toThrow();
      dom.window.history.replaceState(null, "", "#/ara?q=an");
      expect(() => (runtime as typeof runtime & { route(): void }).route()).not.toThrow();
      expect(root.querySelector("[data-cm-search-total]")?.textContent).toBe("897");
      expect(root.querySelectorAll("#sres .xcard")).toHaveLength(24);
      root.querySelector<HTMLButtonElement>("[data-cm-search-more]")!.click();
      expect(root.querySelectorAll("#sres .xcard")).toHaveLength(48);
      const input = root.querySelector<HTMLInputElement>("#sq")!;
      input.value = "girne";
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      expect(dom.window.location.hash).toBe("#/ara?q=girne");
      expect(root.querySelectorAll("#sres .xcard")).toHaveLength(6);
    });
    expect(root.querySelector("#view")).not.toBeNull();
    runtime.cleanup();
  });

  it("maps legacy correction links to source, event, article, and stable page targets", () => {
    const { dom, root, runtime } = createRuntime();
    const legacyRuntime = runtime as LegacyRuntime;
    legacyRuntime.installPublicOverrides();

    expect(submitCorrection(legacyRuntime, dom, () => legacyRuntime.openFix("kurum", "birgun", "BirGün"))).toMatchObject({
      entityId: "birgun",
      entityKind: "source",
    });
    expect(submitCorrection(legacyRuntime, dom, () => legacyRuntime.openFix("olay", "event-12", "Olay"))).toMatchObject({
      entityId: "event-12",
      entityKind: "event",
    });
    expect(submitCorrection(legacyRuntime, dom, () => legacyRuntime.openFix("article", "article-99", "Başlık"))).toMatchObject({
      entityId: "article-99",
      entityKind: "article",
    });
    expect(submitCorrection(legacyRuntime, dom, () => legacyRuntime.openFix("genel", "site", "Genel geri bildirim"))).toMatchObject({
      entityId: "historical-2026-10-13",
      entityKind: "page",
    });

    const split = dom.window.document.createElement("div");
    split.className = "xsplit";
    split.dataset.e = "event-from-split";
    const appeal = dom.window.document.createElement("button");
    root.append(split, appeal);
    expect(submitCorrection(legacyRuntime, dom, () => legacyRuntime.v3openAppeal(appeal))).toMatchObject({
      entityId: "event-from-split",
      entityKind: "event",
    });
  });
});
