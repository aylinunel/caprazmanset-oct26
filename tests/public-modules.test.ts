import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse } from "@babel/parser";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const legacyDirectory = path.join(root, "client/src/public/legacy");
const legacyFiles = fs
  .readdirSync(legacyDirectory)
  .filter(file => file.endsWith(".js"))
  .sort();
const originalHtmlPath = process.env.CAPRAZ_ORIGINAL_HTML;
const sha256 = (value: string | Buffer) =>
  crypto.createHash("sha256").update(value).digest("hex");

describe("public renderer extraction", () => {
  it("exports the parent integration mount contract", async () => {
    const publicBootstrap = await import("../client/src/public/bootstrap");
    expect(typeof publicBootstrap.mountPublicWebsite).toBe("function");
  });

  it("keeps every generated renderer and analysis module syntactically valid ESM", () => {
    const files = [
      ...legacyFiles.map(file => path.join(legacyDirectory, file)),
      path.join(root, "client/src/analysis/turkish.js"),
    ];
    for (const file of files) {
      expect(() =>
        parse(fs.readFileSync(file, "utf8"), { sourceType: "module" })
      ).not.toThrow();
    }
  });

  it("verifies committed dataset bytes and counts against the manifest without the private original", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, "data/import-manifest.json"), "utf8")
    );
    const bytes = fs.readFileSync(
      path.join(root, "data/original-dataset.json")
    );
    const data = JSON.parse(bytes.toString("utf8"));
    expect(manifest.provenance).toBe("provided");
    expect(manifest.source.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.source.datasetFileSha256).toBe(sha256(bytes));
    expect(manifest.counts).toMatchObject({
      embeddedRenderedArticles: 15913,
      events: 1489,
      sources: 29,
      registrySources: 53,
    });
    expect(manifest.counts.harvested).toBe(
      data.meta.counts.articles ?? data.meta.counts.harvested
    );
    expect(manifest.counts.political).toBe(data.meta.counts.political);
    expect(manifest.counts.embeddedRenderedArticles).toBe(data.A.length);
    expect(manifest.counts.events).toBe(data.E.length);
    expect(manifest.counts.sources).toBe(data.S.length);
    expect(manifest.counts.registrySources).toBe(data.R.length);
    expect(manifest.counts.keys).toEqual(
      Object.fromEntries(
        Object.entries(data).map(([key, value]) => [
          key,
          Array.isArray(value)
            ? value.length
            : value && typeof value === "object"
              ? 1
              : 0,
        ])
      )
    );
    expect(
      fs.existsSync(path.join(root, "client/public/original-dataset.json"))
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(root, "client/public/assets/capraz-manset-logo.svg")
      )
    ).toBe(true);
    expect(
      fs.existsSync(path.join(root, "client/public/assets/logo-horizontal.svg"))
    ).toBe(true);
  });

  it.skipIf(!originalHtmlPath)(
    "verifies the explicitly supplied original HTML bytes",
    () => {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(root, "data/import-manifest.json"), "utf8")
      );
      // A supplied missing path or mismatched file must fail, never silently skip.
      const original = fs.readFileSync(originalHtmlPath!);
      expect(sha256(original)).toBe(manifest.source.sha256);
      expect(original.length).toBe(manifest.source.bytes);
    }
  );

  it("deterministically records raw source and emitted dataset hashes with a synthetic artifact", () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), "capraz-extractor-"));
    try {
      fs.mkdirSync(path.join(project, "scripts"));
      fs.copyFileSync(
        path.join(root, "scripts/extract-public.mjs"),
        path.join(project, "scripts/extract-public.mjs")
      );
      fs.symlinkSync(
        path.join(root, "node_modules"),
        path.join(project, "node_modules"),
        "dir"
      );
      const data = {
        meta: { counts: { harvested: 1, political: 0 } },
        A: [{ t: "Çapraz Manşet" }],
        E: [],
        S: [],
        R: [],
      };
      const rawData = `\n  ${JSON.stringify(data, null, 2)}\n`;
      const logo =
        "data:image/svg+xml," +
        encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"/>');
      const original = `<style>:root { color: black; }</style>
<script id="cm-data" type="application/json">${rawData}</script>
<script id="cm-logo" type="application/json">${JSON.stringify({ h: logo, hd: logo, cmp: "<svg/>" })}</script>
<script>
// Turkish layer (T1–T7)
(function (root) {
"use strict";
const API = { setLiterature() {}, setRegister() {} };
if (typeof module !== "undefined" && module.exports) module.exports = API; else root.CM3 = API;
})(this);
CM3.setLiterature([]);
CM3.setRegister([]);
</script>
<script>(function () { function route() {} route(); })();</script>`;
      const source = path.join(project, "synthetic.html");
      fs.writeFileSync(source, original);
      const run = () =>
        execFileSync(
          process.execPath,
          [path.join(project, "scripts/extract-public.mjs"), source],
          { cwd: project, stdio: "pipe" }
        );
      run();
      const dataset = fs.readFileSync(
        path.join(project, "data/original-dataset.json")
      );
      const manifestBytes = fs.readFileSync(
        path.join(project, "data/import-manifest.json")
      );
      const manifest = JSON.parse(manifestBytes.toString("utf8"));
      expect(manifest.source.sha256).toBe(sha256(original));
      expect(manifest.source.datasetSha256).toBe(sha256(rawData));
      expect(manifest.source.datasetFileSha256).toBe(sha256(dataset));
      expect(manifest.source.datasetFileSha256).not.toBe(
        manifest.source.datasetSha256
      );
      expect(dataset.toString("utf8")).toBe(`${JSON.stringify(data)}\n`);
      run();
      expect(
        fs.readFileSync(path.join(project, "data/original-dataset.json"))
      ).toEqual(dataset);
      expect(
        fs.readFileSync(path.join(project, "data/import-manifest.json"))
      ).toEqual(manifestBytes);
    } finally {
      fs.rmSync(project, { recursive: true, force: true });
    }
  });

  it("removes generated inline handlers and dynamic code execution from the migrated renderer", () => {
    const source = legacyFiles
      .filter(file => /^\d\d-/.test(file))
      .map(file => fs.readFileSync(path.join(legacyDirectory, file), "utf8"))
      .join("\n");
    expect(source).not.toContain('onclick="');
    expect(source).not.toContain("new Function");
    expect(source).not.toMatch(/\beval\s*\(/);
    expect(source).toContain("data-cm-route");
    expect(source).toContain("runtime.setHTML");
    expect(source).toContain("runtime.insertHTML");
    expect(
      fs.readFileSync(path.join(root, "client/src/public/runtime.ts"), "utf8")
    ).toContain('!raw.startsWith("//")');
  });
});
