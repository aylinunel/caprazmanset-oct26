#!/usr/bin/env node
/**
 * Reproducibly extracts the supplied Çapraz Manşet artifact into public-only
 * frontend modules. It never puts the historical dataset in client/public.
 *
 * Usage: node scripts/extract-public.mjs [legacy-html-path]
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import generateModule from "@babel/generator";
import * as t from "@babel/types";
import postcss from "postcss";

const traverse = traverseModule.default;
const generate = generateModule.default;
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
const sourcePath = process.argv[2] || "/home/ubuntu/upload/ÇaprazManşet3.0.html";

const out = (...parts) => path.join(repo, ...parts);
const write = (file, content) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const normalized = content.replace(/[\t ]+$/gm, "");
  fs.writeFileSync(file, normalized.endsWith("\n") ? normalized : `${normalized}\n`, "utf8");
};
const sha256 = (input) => crypto.createHash("sha256").update(input).digest("hex");

function scriptTags(html) {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map((match, index) => ({
    index,
    attributes: match[1],
    body: match[2],
  }));
}

function styleTags(html) {
  return [...html.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi)].map((match, index) => ({
    index,
    attributes: match[1],
    body: match[2],
  }));
}

function idOf(attributes) {
  return /\bid\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1] || null;
}

function decodeSvgDataUri(dataUri) {
  const comma = dataUri.indexOf(",");
  if (comma < 0) throw new Error("Expected a data URI for an original logo asset.");
  const meta = dataUri.slice(0, comma);
  const payload = dataUri.slice(comma + 1);
  if (!/^data:image\/svg\+xml/i.test(meta)) throw new Error("Expected the supplied logo to be SVG.");
  return /;base64/i.test(meta) ? Buffer.from(payload, "base64").toString("utf8") : decodeURIComponent(payload);
}

function sourceShape(data) {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, Array.isArray(value) ? value.length : value && typeof value === "object" ? 1 : 0]),
  );
}

function cssScopeSelector(selector) {
  const scope = "[data-capraz-public]";
  const trimmed = selector.trim();
  if (!trimmed || /^\d+(?:\.\d+)?%$/.test(trimmed) || trimmed === "from" || trimmed === "to") return selector;

  let scoped = trimmed
    .replace(/:root/g, scope)
    .replace(/(^|[\s>+~,(])html(?=\b|[.#[:])/g, `$1${scope}`)
    .replace(/(^|[\s>+~,(])body(?=\b|[.#[:])/g, `$1${scope}`);

  if (scoped.includes(scope)) return scoped;
  if (scoped.startsWith("@")) return scoped;
  return `${scope} ${scoped}`;
}

function scopeCss(raw) {
  const root = postcss.parse(raw);
  root.walkRules((rule) => {
    let parent = rule.parent;
    while (parent) {
      if (parent.type === "atrule" && /keyframes$/i.test(parent.name)) return;
      parent = parent.parent;
    }
    rule.selectors = rule.selectors.map(cssScopeSelector);
  });
  return root.toString();
}

function transformTurkishLayer(raw) {
  let source = raw;
  source = source.replace(
    /\(function \(root\) \{\s*\n"use strict";/,
    'const CM3 = (function () {\n"use strict";',
  );
  source = source.replace(
    /if \(typeof module !== "undefined" && module\.exports\) module\.exports = API; else root\.CM3 = API;/,
    "return API;",
  );
  source = source.replace(/\}\)\(this\);\s*\nCM3\.setLiterature/, "})();\n\nCM3.setLiterature");
  if (!source.includes("const CM3 =") || !source.includes("return API;") || !source.includes("CM3.setRegister")) {
    throw new Error("The Turkish-layer export contract changed; extraction stopped before writing partial files.");
  }
  return `${source}\n\nexport { CM3 };\nexport default CM3;\n`;
}

function runtimeMember(name) {
  return t.memberExpression(t.identifier("runtime"), t.identifier(name));
}

function sinkName(member) {
  if (!t.isMemberExpression(member)) return null;
  if (!member.computed && t.isIdentifier(member.property)) return member.property.name;
  if (member.computed && t.isStringLiteral(member.property)) return member.property.value;
  return null;
}

function legacyAliases() {
  return `  const window = runtime.window;
  const document = runtime.document;
  const location = runtime.location;
  const CM3 = runtime.CM3;
  const addEventListener = runtime.addEventListener;
  const removeEventListener = runtime.removeEventListener;
  const innerWidth = runtime.window.innerWidth;
  const innerHeight = runtime.window.innerHeight;
  const devicePixelRatio = runtime.window.devicePixelRatio;
  const matchMedia = runtime.window.matchMedia.bind(runtime.window);
  const performance = runtime.window.performance;
  const requestAnimationFrame = runtime.window.requestAnimationFrame.bind(runtime.window);
  const cancelAnimationFrame = runtime.window.cancelAnimationFrame.bind(runtime.window);
  const setTimeout = runtime.window.setTimeout.bind(runtime.window);
  const clearTimeout = runtime.window.clearTimeout.bind(runtime.window);
  const localStorage = runtime.window.localStorage;
  const IntersectionObserver = runtime.window.IntersectionObserver;
`;
}

function sectionFor(line) {
  if (line < 680) return "foundation";
  if (line < 1632) return "events-and-sources";
  if (line < 2407) return "maps-and-rules";
  if (line < 4366) return "analysis-and-findings";
  if (line < 5015) return "public-routes";
  if (line < 5856) return "narrative-and-advanced";
  if (line < 6261) return "presentation-and-corrections";
  if (line < 6746) return "historical-features";
  return "historical-v3";
}

function moduleId(index, name) {
  return `${String(index).padStart(2, "0")}-${name}`;
}

function transformRenderer(raw) {
  const ast = parse(raw, { sourceType: "script", plugins: ["jsx"] });
  let iifePath = null;
  traverse(ast, {
    CallExpression(candidate) {
      if (
        !iifePath &&
        candidate.parentPath.isExpressionStatement() &&
        (candidate.node.callee.type === "FunctionExpression" || candidate.node.callee.type === "ArrowFunctionExpression") &&
        candidate.node.callee.body.type === "BlockStatement"
      ) {
        iifePath = candidate.get("callee");
      }
    },
  });
  if (!iifePath) throw new Error("Expected the renderer to be an IIFE.");

  const initialBodyPaths = iifePath.get("body").get("body");
  const initialBody = initialBodyPaths.map((item) => item.node);
  const rootBindings = new Map();
  const variableNames = [];

  for (const statement of initialBody) {
    if (t.isFunctionDeclaration(statement) && statement.id) rootBindings.set(statement.id.name, null);
    if (t.isVariableDeclaration(statement)) {
      for (const declaration of statement.declarations) {
        if (!t.isIdentifier(declaration.id)) {
          throw new Error(`Unsupported top-level binding pattern at line ${statement.loc?.start.line}.`);
        }
        rootBindings.set(declaration.id.name, null);
        variableNames.push(declaration.id.name);
      }
    }
  }

  for (const [name] of rootBindings) {
    const binding = iifePath.scope.getBinding(name);
    if (!binding) throw new Error(`Could not resolve legacy top-level binding ${name}.`);
    rootBindings.set(name, binding);
  }

  // Rewrite only references to the IIFE's own top-level bindings. Babel's
  // binding identity check leaves parameters, nested locals and shadowed names alone.
  traverse(ast, {
    Identifier(candidate) {
      const name = candidate.node.name;
      const expected = rootBindings.get(name);
      if (!expected || candidate.scope.getBinding(name) !== expected) return;
      const parent = candidate.parentPath;
      const isWrite =
        (parent.isAssignmentExpression() && candidate.key === "left") ||
        (parent.isUpdateExpression() && candidate.key === "argument") ||
        (parent.isForInStatement() && candidate.key === "left") ||
        (parent.isForOfStatement() && candidate.key === "left");
      if (isWrite) {
        candidate.replaceWith(runtimeMember(name));
        candidate.skip();
        return;
      }
      if (candidate.isReferencedIdentifier()) {
        candidate.replaceWith(runtimeMember(name));
        candidate.skip();
      }
    },
    StringLiteral(candidate) {
      // These are the renderer's six legacy HTML onclick templates. The final
      // attributes are declarative data-cm-route actions handled by runtime.ts.
      if (candidate.node.value.includes('onclick="location.hash=\'')) {
        candidate.node.value = candidate.node.value.replaceAll('onclick="location.hash=\'', 'data-cm-route="');
      }
    },
  });

  // Babel may report a read of a function-scoped `var` as a binding
  // identifier too (for example `if (!XTICK)`). The rewrite above deliberately
  // relies on referenced-identifier semantics instead. Verify the extraction
  // did not leave any reads or writes that still resolve to the source IIFE's
  // root scope: split ESM modules cannot resolve those legacy globals.
  const leakedRootReferences = [];
  traverse(ast, {
    Identifier(candidate) {
      const expected = rootBindings.get(candidate.node.name);
      if (!expected || candidate.scope.getBinding(candidate.node.name) !== expected) return;
      if (!candidate.isReferencedIdentifier()) return;
      leakedRootReferences.push(`${candidate.node.name}@${candidate.node.loc?.start.line ?? "unknown"}`);
    },
  });
  if (leakedRootReferences.length) {
    throw new Error(`Unrewritten renderer root references: ${[...new Set(leakedRootReferences)].join(", ")}`);
  }

  // All retained string-HTML sinks route through DOMPurify. No global element
  // prototype patch is used, so React and the admin application stay untouched.
  traverse(ast, {
    AssignmentExpression(candidate) {
      const property = sinkName(candidate.node.left);
      if (!property || !t.isMemberExpression(candidate.node.left)) return;
      const target = candidate.node.left.object;
      if (property === "innerHTML") {
        const helper = candidate.node.operator === "+=" ? "appendHTML" : "setHTML";
        candidate.replaceWith(t.callExpression(t.memberExpression(t.identifier("runtime"), t.identifier(helper)), [target, candidate.node.right]));
        candidate.skip();
      } else if (property === "outerHTML" && candidate.node.operator === "=") {
        candidate.replaceWith(t.callExpression(t.memberExpression(t.identifier("runtime"), t.identifier("replaceHTML")), [target, candidate.node.right]));
        candidate.skip();
      }
    },
    CallExpression(candidate) {
      const callee = candidate.node.callee;
      if (sinkName(callee) !== "insertAdjacentHTML" || !t.isMemberExpression(callee)) return;
      candidate.replaceWith(
        t.callExpression(t.memberExpression(t.identifier("runtime"), t.identifier("insertHTML")), [callee.object, ...candidate.node.arguments]),
      );
      candidate.skip();
    },
  });

  // The supplied helper assumed logo values were data-URI SVG strings. The
  // extracted originals are served as immutable public assets, so preserve
  // data-URI support while returning an existing absolute asset path as-is.
  traverse(ast, {
    FunctionDeclaration(candidate) {
      if (candidate.node.id?.name !== "svgURI") return;
      const value = t.identifier("s");
      const assetPath = t.callExpression(
        t.memberExpression(t.regExpLiteral("^(\\/|https?:)"), t.identifier("test")),
        [value],
      );
      const legacyDataUri = t.binaryExpression(
        "+",
        t.stringLiteral("data:image/svg+xml;charset=utf-8,"),
        t.callExpression(t.identifier("encodeURIComponent"), [t.identifier("s")]),
      );
      candidate.node.body = t.blockStatement([t.returnStatement(t.conditionalExpression(assetPath, t.identifier("s"), legacyDataUri))]);
    },
  });

  const transformedBody = iifePath.node.body.body;
  for (const statement of transformedBody) {
    if (t.isFunctionDeclaration(statement) && statement.id) {
      const functionName = statement.id.name;
      const expression = t.functionExpression(
        t.identifier(functionName),
        statement.params,
        statement.body,
        statement.generator,
        statement.async,
      );
      const replacement = t.expressionStatement(t.assignmentExpression("=", runtimeMember(functionName), expression));
      replacement.loc = statement.loc;
      replacement.__cmFunction = true;
      Object.assign(replacement, { leadingComments: statement.leadingComments, trailingComments: statement.trailingComments });
      const index = transformedBody.indexOf(statement);
      transformedBody[index] = replacement;
    } else if (t.isVariableDeclaration(statement)) {
      const replacements = statement.declarations.map((declaration) => {
        const right = declaration.init || t.unaryExpression("void", t.numericLiteral(0));
        const replacement = t.expressionStatement(t.assignmentExpression("=", runtimeMember(declaration.id.name), right));
        replacement.loc = declaration.loc || statement.loc;
        return replacement;
      });
      const index = transformedBody.indexOf(statement);
      transformedBody.splice(index, 1, ...replacements);
    }
  }

  const chunks = new Map();
  for (const statement of transformedBody) {
    const name = sectionFor(statement.loc?.start.line || 0);
    if (!chunks.has(name)) chunks.set(name, { functions: [], initializers: [] });
    const group = chunks.get(name);
    if (statement.__cmFunction) group.functions.push(statement);
    else group.initializers.push(statement);
  }

  const generated = [];
  let index = 0;
  for (const [name, group] of chunks) {
    const id = moduleId(index, name);
    const functionCode = group.functions.map((statement) => generate(statement, { comments: true }).code).join("\n\n");
    const initializerCode = group.initializers.map((statement) => generate(statement, { comments: true }).code).join("\n\n");
    const camel = name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const exported = `${camel.charAt(0).toUpperCase()}${camel.slice(1)}`;
    const file = `client/src/public/legacy/${id}.js`;
    write(
      out(file),
      `/* Generated by scripts/extract-public.mjs from the supplied artifact.\n * Transitional compatibility module: see docs/public-migration.md. */\n\nexport function register${exported}(runtime) {\n${legacyAliases()}\n${functionCode ? `${functionCode.split("\n").map((line) => `  ${line}`).join("\n")}\n` : ""}}\n\nexport function initialize${exported}(runtime) {\n${legacyAliases()}\n${initializerCode ? `${initializerCode.split("\n").map((line) => `  ${line}`).join("\n")}\n` : ""}}\n`,
    );
    generated.push({ id, exported, file, functions: group.functions.length, initializers: group.initializers.length });
    index += 1;
  }

  const importLines = generated
    .map(({ id, exported }) => `import { register${exported}, initialize${exported} } from "./${id}.js";`)
    .join("\n");
  const registrations = generated.map(({ exported }) => `  register${exported}(runtime);`).join("\n");
  const initializers = generated.map(({ exported }) => `  initialize${exported}(runtime);`).join("\n");
  const bindingList = [...new Set(variableNames)].map((name) => JSON.stringify(name)).join(", ");
  write(
    out("client/src/public/legacy/index.js"),
    `/* Generated public renderer entrypoint. Function registrations intentionally\n * happen before sequential initializers to retain function-declaration hoisting. */\nimport CM3 from "../../analysis/turkish.js";\n${importLines}\n\nexport function mountLegacyRenderer(runtime) {\n  runtime.CM3 = CM3;\n  runtime.window.CM3 = CM3;\n  runtime.window.DATA = runtime.data;\n${registrations}\n  runtime.initializeBindings([${bindingList}]);\n${initializers}\n  runtime.installPublicOverrides();\n  return runtime;\n}\n`,
  );
  return generated;
}

function main() {
  const html = fs.readFileSync(sourcePath, "utf8");
  const scripts = scriptTags(html);
  const styles = styleTags(html);
  const dataScript = scripts.find((item) => idOf(item.attributes) === "cm-data");
  const logoScript = scripts.find((item) => idOf(item.attributes) === "cm-logo");
  const rendererScript = scripts.find((item) => item.body.includes("function route"));
  const turkishScript = scripts.find((item) => item.body.includes("Turkish layer (T1–T7)"));
  if (!dataScript || !logoScript || !rendererScript || !turkishScript) throw new Error("One or more expected supplied-artifact sections were not found.");

  const data = JSON.parse(dataScript.body);
  const logos = JSON.parse(logoScript.body);
  const sourceBytes = fs.readFileSync(sourcePath);
  const sourceHash = sha256(sourceBytes);
  const dataHash = sha256(dataScript.body);

  write(out("data/original-dataset.json"), JSON.stringify(data));
  write(out("client/public/assets/capraz-manset-logo.svg"), decodeSvgDataUri(logos.h));
  write(out("client/public/assets/logo-horizontal.svg"), decodeSvgDataUri(logos.h));
  write(out("client/public/assets/capraz-manset-logo-dark.svg"), decodeSvgDataUri(logos.hd));
  write(out("client/public/assets/capraz-manset-compare.svg"), logos.cmp);

  const manifest = {
    schemaVersion: 1,
    provenance: "provided",
    source: {
      originalFile: path.basename(sourcePath),
      sha256: sourceHash,
      bytes: sourceBytes.length,
      datasetSha256: dataHash,
      datasetFormat: "compact original D shape; all supplied keys preserved",
    },
    counts: {
      harvested: data.meta?.counts?.articles ?? data.meta?.counts?.harvested ?? null,
      political: data.meta?.counts?.political ?? null,
      embeddedRenderedArticles: data.A?.length ?? null,
      events: data.E?.length ?? null,
      sources: data.S?.length ?? null,
      registrySources: data.R?.length ?? null,
      keys: sourceShape(data),
    },
    assets: {
      logo: "client/public/assets/capraz-manset-logo.svg",
      parentLogoAlias: "client/public/assets/logo-horizontal.svg",
      darkLogo: "client/public/assets/capraz-manset-logo-dark.svg",
      compareMark: "client/public/assets/capraz-manset-compare.svg",
    },
    note: "Historical counts and analytical fields are supplied data, not independently verified by this migration.",
  };
  write(out("data/import-manifest.json"), JSON.stringify(manifest, null, 2));

  const css = scopeCss(styles.map((item) => item.body).join("\n\n"));
  write(
    out("client/src/styles/public-legacy.css"),
    `${css}\n\n/* Mounted public-only provenance and safe-link disclosures. */\n[data-capraz-public] .cm-provenance{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:7px 14px;border-bottom:1px solid var(--line,#d8d5cd);background:var(--surface,#fff);color:var(--muted,#625e55);font:11px/1.35 var(--ff-m,ui-monospace,monospace)}\n[data-capraz-public] .cm-provenance a{color:inherit;text-decoration:underline;text-underline-offset:2px}\n[data-capraz-public] [data-cm-route]{cursor:pointer}\n[data-capraz-public] .cm-correction-backdrop{position:fixed;inset:0;z-index:1000;background:rgba(27,24,19,.58);display:grid;place-items:center;padding:16px}\n[data-capraz-public] .cm-correction-dialog{width:min(620px,100%);max-height:calc(100vh - 32px);overflow:auto;background:var(--surface,#fff);color:var(--ink,#1b1813);border:1px solid var(--line,#d8d5cd);border-radius:8px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.25)}\n[data-capraz-public] .cm-correction-dialog label{display:grid;gap:5px;margin:12px 0;font-weight:600}\n[data-capraz-public] .cm-correction-dialog input,[data-capraz-public] .cm-correction-dialog textarea{font:inherit;padding:8px;border:1px solid var(--line,#d8d5cd);background:var(--raise,#fbfcfd);color:inherit}\n[data-capraz-public] .cm-correction-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}\n[data-capraz-public] .cm-correction-status{min-height:1.4em;color:var(--muted,#625e55)}\n[data-capraz-public] .cm-correction-honeypot{position:absolute;left:-10000px;opacity:0;pointer-events:none}\n`,
  );

  const turkish = transformTurkishLayer(turkishScript.body);
  write(out("client/src/analysis/turkish.js"), turkish);
  write(out("tests/fixtures/turkish-raw-baseline.js"), `/* Mechanically adapted raw supplied Turkish layer for migration comparison tests. */\n${turkish}`);
  const modules = transformRenderer(rendererScript.body);

  write(
    out("client/src/public/legacy/generated-manifest.json"),
    JSON.stringify(
      {
        source: "supplied ÇaprazManset3.0 renderer",
        sourceSha256: sourceHash,
        modules: modules.map(({ id, file, functions, initializers }) => ({ id, file, functions, initializers })),
        totalFunctions: modules.reduce((sum, module) => sum + module.functions, 0),
        totalSequentialInitializers: modules.reduce((sum, module) => sum + module.initializers, 0),
      },
      null,
      2,
    ),
  );

  console.log(JSON.stringify({ sourceHash, datasetBytes: dataScript.body.length, modules: modules.length, manifest: "data/import-manifest.json" }, null, 2));
}

main();
