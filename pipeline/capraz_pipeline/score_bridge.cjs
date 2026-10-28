// Reads JSONL {id, title, summary} on stdin, writes JSONL scores on stdout.
// Uses shared/analysis/rules.cjs, the same file the public analyser runs.
"use strict";
const path = require("path");
const readline = require("readline");
const R = require(path.resolve(__dirname, "../../shared/analysis/rules.cjs"));

function pack(text) {
  const s = R.scoreText(text || "");
  const e = [];
  s.evidence.forEach((x) => x.ev.forEach((t) => e.push([x.key, t, x.level, x.own ? "own_voice" : "quoted_only"])));
  return { k: s.k, v: s.v, b: s.b, e };
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  if (!line) return;
  const r = JSON.parse(line);
  const h = pack(r.title);
  const l = r.summary ? pack(r.summary) : null;
  process.stdout.write(JSON.stringify({ id: r.id, h, l }) + "\n");
});
rl.on("close", () => process.stdout.write(JSON.stringify({ rulesVersion: R.RULES_VERSION }) + "\n"));
