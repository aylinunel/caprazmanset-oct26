import fs from "node:fs";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { JSDOM } from "jsdom";
import DOMPurify from "dompurify";
import { createPublicRuntime } from "../client/src/public/runtime";
import { mountLegacyRenderer } from "../client/src/public/legacy/index.js";
import { registerPublicRoutes } from "../client/src/public/legacy/04-public-routes.js";

const data = JSON.parse(
  fs.readFileSync(
    new URL("../data/original-dataset.json", import.meta.url),
    "utf8"
  )
);
const dom = new JSDOM(
  '<div id="host"><div id="root"><div id="app"></div></div></div>',
  { url: "https://example.test/#/ara", pretendToBeVisual: true }
);
const window = dom.window;
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }),
});
Object.defineProperty(window, "IntersectionObserver", {
  configurable: true,
  value: class {
    observe() {}
    disconnect() {}
  },
});
Object.defineProperty(window, "scrollTo", {
  configurable: true,
  value: () => undefined,
});
Object.defineProperty(window.HTMLCanvasElement.prototype, "getContext", {
  configurable: true,
  value: () => null,
});
for (const [key, value] of Object.entries({
  window,
  document: window.document,
  history: window.history,
  scrollTo: window.scrollTo,
}))
  Object.defineProperty(globalThis, key, { configurable: true, value });
Object.assign(DOMPurify, DOMPurify(window));
const root = window.document.querySelector<HTMLElement>("#root")!;
const runtime = createPublicRuntime({
  host: window.document.querySelector<HTMLElement>("#host")!,
  root,
  data,
  logo: {},
});
mountLegacyRenderer(runtime);
(runtime.route as () => void)();
const input = root.querySelector<HTMLInputElement>("#sq")!;
assert.ok(input, "Real search route mounted");
const optimized = runtime.renderSearch as () => void;
// Get the untouched generated reference function in a shallow runtime copy.
// This does not modify files, data, or the active optimized runtime's methods.
const reference = { ...runtime };
registerPublicRoutes(reference);
const legacy = reference.renderSearch as () => void;
function sample(render: () => void, query: string) {
  input.value = query;
  // Control prior DOM size: both implementations begin from the same empty
  // result panel. Clearing is outside the timed interval, so a 897-card prior
  // result cannot unfairly burden only the next optimized measurement.
  runtime.setHTML(root.querySelector<HTMLElement>("#sres")!, "");
  const start = performance.now();
  render();
  const durationMs = performance.now() - start;
  const box = root.querySelector<HTMLElement>("#sres")!;
  const heading = box.querySelector("h2 span")?.textContent;
  return {
    durationMs,
    total: Number(heading),
    initialEventCards: box.querySelectorAll(".xcard").length,
    headlines: box.querySelectorAll(".xart").length,
    htmlCharacters: box.innerHTML.length,
  };
}
const queries = ["girne", "sözcü", "an"];
const output: Record<string, unknown> = {};
for (const query of queries) {
  sample(legacy, query);
  sample(optimized, query);
  const old: number[] = [],
    next: number[] = [];
  let before!: ReturnType<typeof sample>, after!: ReturnType<typeof sample>;
  for (let round = 0; round < 6; round++) {
    if (round % 2 === 0) {
      before = sample(legacy, query);
      after = sample(optimized, query);
    } else {
      after = sample(optimized, query);
      before = sample(legacy, query);
    }
    assert.equal(after.total, before.total);
    assert.equal(after.headlines, before.headlines);
    assert.equal(
      after.initialEventCards,
      Math.min(24, before.initialEventCards)
    );
    old.push(before.durationMs);
    next.push(after.durationMs);
    if (query === "an")
      console.error(`Broad-query comparison round ${round + 1}/6 complete`);
  }
  const summary = (values: number[]) => {
    const sorted = values.toSorted((a, b) => a - b);
    return {
      samples: values.length,
      medianMs: sorted[Math.floor(sorted.length / 2)],
      p95Ms:
        sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
    };
  };
  output[query] = {
    before: {
      ...summary(old),
      ...Object.fromEntries(
        Object.entries(before).filter(([key]) => key !== "durationMs")
      ),
    },
    after: {
      ...summary(next),
      ...Object.fromEntries(
        Object.entries(after).filter(([key]) => key !== "durationMs")
      ),
    },
  };
}
runtime.cleanup();
window.close();
console.log(
  JSON.stringify(
    {
      scope:
        "Mounted original renderer in jsdom, six alternating paired samples; not a browser/RUM/Core Web Vitals claim",
      queries: output,
    },
    null,
    2
  )
);
