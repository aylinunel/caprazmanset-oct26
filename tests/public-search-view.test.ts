import { JSDOM } from "jsdom";
import DOMPurify from "dompurify";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  installSearchOptimization,
  SEARCH_EVENT_BATCH_SIZE,
} from "../client/src/public/search-optimization";
import type { SearchRecord } from "../client/src/public/search-index";

const doms: JSDOM[] = [];
afterEach(() => {
  for (const dom of doms.splice(0)) dom.window.close();
});
function fixture() {
  const dom = new JSDOM(
    '<div id="root"><input id="sq"><div id="sres"></div></div>'
  );
  doms.push(dom);
  const document = dom.window.document;
  const root = document.querySelector<HTMLElement>("#root")!;
  const input = document.querySelector<HTMLInputElement>("#sq")!;
  const sanitizer = DOMPurify(dom.window);
  const escape = (value: unknown) =>
    String(value).replace(
      /[&<>"']/g,
      char =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char]!
    );
  const events = Array.from({ length: 57 }, (_, at) => ({
    i: `e${at}`,
    t: `Ankara olay ${at}`,
    sum: "Ankara haber",
  }));
  const runtime = {
    root,
    D: {
      E: events,
      S: [{ s: "source", n: "Ankara kaynak" }],
      TP: [{ k: "topic", n: "Ankara konu" }],
      A: Array.from({ length: 50 }, (_, at) => ({
        i: `a${at}`,
        s: "source",
        t: `Ankara başlık ${at}`,
        d: "",
        u: `https://example.org/a${at}`,
      })),
    },
    STAT: { source: true },
    SIDE: { mid: "Merkez" },
    $: (selector: string) => root.querySelector<HTMLElement>(selector),
    renderSearch: vi.fn(),
    v3isIlanEvent: vi.fn((_record: SearchRecord) => false),
    cards: vi.fn((records: SearchRecord[]) =>
      records
        .map(
          record =>
            `<article class="card" data-event-id="${escape(record.i)}">${escape(record.t)}</article>`
        )
        .join("")
    ),
    esc: escape,
    srcName: () => "Ankara kaynak",
    sideOf: () => "mid",
    fmtDT: () => "Yayın tarihi belirtilmedi",
    setHTML: (node: Element, html: unknown) => {
      node.innerHTML = sanitizer.sanitize(String(html));
      return node;
    },
    appendHTML: (node: Element, html: unknown) => {
      node.insertAdjacentHTML("beforeend", sanitizer.sanitize(String(html)));
      return node;
    },
    wireGo: vi.fn(),
  };
  const original = runtime.renderSearch;
  const dispose = installSearchOptimization(runtime);
  const search = (query: string) => {
    input.value = query;
    runtime.renderSearch();
  };
  return { dom, root, input, runtime, search, original, dispose };
}

describe("progressive public search", () => {
  it("keeps the exact total, renders only 24 initial cards and exposes every match", () => {
    const { root, search } = fixture();
    search("Ankara");
    expect(root.querySelector("[data-cm-search-total]")?.textContent).toBe(
      "57"
    );
    expect(root.querySelectorAll("[data-event-id]")).toHaveLength(
      SEARCH_EVENT_BATCH_SIZE
    );
    expect(root.querySelectorAll(".xart")).toHaveLength(40);
    const button = root.querySelector<HTMLButtonElement>(
      "[data-cm-search-more]"
    )!;
    button.focus();
    button.click();
    expect(root.querySelectorAll("[data-event-id]")).toHaveLength(48);
    button.click();
    expect(
      [...root.querySelectorAll("[data-event-id]")].map(node =>
        node.getAttribute("data-event-id")
      )
    ).toEqual(Array.from({ length: 57 }, (_, at) => `e${at}`));
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.disabled).toBe(false);
    expect(root.ownerDocument.activeElement).toBe(button);
    expect(root.querySelector("[role=status]")?.textContent).toBe(
      "57 / 57 olay gösteriliyor."
    );
    button.click();
    expect(root.querySelectorAll("[data-event-id]")).toHaveLength(57);
  });

  it("resets the window on a new input and keeps the original two-character minimum", () => {
    const { root, input, search } = fixture();
    search("Ankara");
    root.querySelector<HTMLButtonElement>("[data-cm-search-more]")!.click();
    search("haber");
    expect(root.querySelectorAll("[data-event-id]")).toHaveLength(24);
    search(" a ");
    expect(root.querySelectorAll("[data-event-id]")).toHaveLength(0);
    expect(root.textContent).toContain("En az iki harf yazın.");
    expect(input.getAttribute("aria-label")).toBe(
      "Olay, kurum, konu ve başlık ara"
    );
  });

  it("never appends results from an obsolete notice-filter state", () => {
    const { root, runtime, search } = fixture();
    search("Ankara");
    runtime.v3isIlanEvent.mockImplementation(record => record.i === "e25");
    root.querySelector<HTMLButtonElement>("[data-cm-search-more]")!.click();
    expect(root.querySelector("[data-cm-search-total]")?.textContent).toBe(
      "56"
    );
    expect(root.querySelectorAll("[data-event-id]")).toHaveLength(24);
    root.querySelector<HTMLButtonElement>("[data-cm-search-more]")!.click();
    expect(root.querySelector('[data-event-id="e25"]')).toBeNull();
  });

  it("escapes supplied text, preserves original article URLs and calls the route helper", () => {
    const { root, runtime, search } = fixture();
    runtime.D.A[0].t = 'Ankara <img src=x onerror="alert(1)">';
    search("Ankara");
    expect(root.querySelector("img")).toBeNull();
    expect(root.querySelector(".xart-t")?.getAttribute("href")).toBe(
      "https://example.org/a0"
    );
    expect(runtime.wireGo).toHaveBeenCalled();
  });

  it("restores the legacy function and removes delegated handlers on disposal", () => {
    const { root, runtime, search, original, dispose } = fixture();
    search("Ankara");
    dispose();
    expect(runtime.renderSearch).toBe(original);
    root.querySelector<HTMLButtonElement>("[data-cm-search-more]")!.click();
    expect(root.querySelectorAll("[data-event-id]")).toHaveLength(24);
  });
});
