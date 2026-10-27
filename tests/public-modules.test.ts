import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const legacyDirectory = path.join(root, "client/src/public/legacy");
const legacyFiles = fs.readdirSync(legacyDirectory).filter((file) => file.endsWith(".js")).sort();

describe("public renderer extraction", () => {
  it("exports the parent integration mount contract", async () => {
    const publicBootstrap = await import("../client/src/public/bootstrap");
    expect(typeof publicBootstrap.mountPublicWebsite).toBe("function");
  });

  it("keeps every generated renderer and analysis module syntactically valid ESM", () => {
    const files = [
      ...legacyFiles.map((file) => path.join(legacyDirectory, file)),
      path.join(root, "client/src/analysis/turkish.js"),
    ];
    for (const file of files) {
      expect(() => parse(fs.readFileSync(file, "utf8"), { sourceType: "module" })).not.toThrow();
    }
  });

  it("records the supplied original and keeps the compact dataset out of browser public assets", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "data/import-manifest.json"), "utf8"));
    const original = fs.readFileSync("/home/ubuntu/upload/ÇaprazManşet3.0.html");
    expect(manifest.provenance).toBe("provided");
    expect(manifest.source.sha256).toBe(crypto.createHash("sha256").update(original).digest("hex"));
    expect(manifest.counts).toMatchObject({ embeddedRenderedArticles: 15913, events: 1489, sources: 29, registrySources: 53 });
    expect(fs.existsSync(path.join(root, "client/public/original-dataset.json"))).toBe(false);
    expect(fs.existsSync(path.join(root, "client/public/assets/capraz-manset-logo.svg"))).toBe(true);
    expect(fs.existsSync(path.join(root, "client/public/assets/logo-horizontal.svg"))).toBe(true);
  });

  it("removes generated inline handlers and dynamic code execution from the migrated renderer", () => {
    const source = legacyFiles
      .filter((file) => /^\d\d-/.test(file))
      .map((file) => fs.readFileSync(path.join(legacyDirectory, file), "utf8"))
      .join("\n");
    expect(source).not.toContain('onclick="');
    expect(source).not.toContain("new Function");
    expect(source).not.toMatch(/\beval\s*\(/);
    expect(source).toContain("data-cm-route");
    expect(source).toContain("runtime.setHTML");
    expect(source).toContain("runtime.insertHTML");
    expect(fs.readFileSync(path.join(root, "client/src/public/runtime.ts"), "utf8")).toContain('!raw.startsWith("//")');
  });
});
