import { describe, expect, it } from "vitest";
import migrated from "../client/src/analysis/turkish.js";
import raw from "./fixtures/turkish-raw-baseline.js";

type CM3 = typeof migrated;

function compactDataset() {
  return {
    A: [],
    E: [{ i: "e1", s: ["left", "edge-left", "mid", "edge-right", "right"], a: [] }],
    S: [
      { s: "left", n: "Sol", lean: 44 },
      { s: "edge-left", n: "Sol eşik", lean: 45 },
      { s: "mid", n: "Merkez", lean: 55 },
      { s: "edge-right", n: "Sağ eşik", lean: 56 },
      { s: "right", n: "Sağ", lean: 100 },
    ],
    FD: [
      { s: "left", ok: true, w: 20, n: 20 },
      { s: "edge-left", ok: true, w: 20, n: 20 },
      { s: "mid", ok: true, w: 20, n: 20 },
      { s: "edge-right", ok: true, w: 20, n: 20 },
      { s: "right", ok: true, w: 20, n: 20 },
    ],
    R: [],
  };
}

function same<T>(fn: (api: CM3) => T): T {
  const migratedResult = fn(migrated);
  expect(migratedResult).toEqual(fn(raw as CM3));
  return migratedResult;
}

describe("public Turkish analysis migration", () => {
  it("preserves Turkish casing, apostrophe handling, suffix boundaries, and notice kinds", () => {
    expect(same((api) => api.trLower("IĞDIR İZMİR"))).toBe("ığdır izmir");
    expect(same((api) => api.stemTR("Meclis'te"))).toBe("meclis");
    expect(same((api) => api.stemTR("kitaplardan"))).toBe("kitap");
    expect(same((api) => api.suffixOnly("evlerde", "evler"))).toBe(true);
    expect(same((api) => api.noticeKind("T.C. İZMİR 1. ASLİYE HUKUK MAHKEMESİ"))).toEqual({ kind: "asliyeHukuk", family: "court" });
    expect(same((api) => api.noticeKind("BELEDİYE BAŞKANLIĞI İHALE DUYURUSU"))).toEqual({ kind: "belediye", family: "public" });
  });

  it("preserves the 44/45/55/56 placement thresholds and panel-admission boundary", () => {
    const result = same((api) => api.panel(compactDataset() as never));
    expect(result.map((row: { s: string; bloc: string; admittedOld: boolean; admittedNew: boolean }) => [row.s, row.bloc, row.admittedOld, row.admittedNew])).toEqual([
      ["left", "left", true, true],
      ["edge-left", "mid", true, true],
      ["mid", "mid", true, true],
      ["edge-right", "right", true, true],
      ["right", "right", true, true],
    ]);
  });

  it("preserves reviewer score gates at their historical 90 percent pass lines", () => {
    const noticeItems = Array.from({ length: 10 }, (_, index) => ({ id: `n${index}`, flagged: 1 }));
    const atThreshold = Object.fromEntries(noticeItems.map((item, index) => [item.id, index === 9 ? "h" : "e"]));
    expect(same((api) => api.scoreIlan(noticeItems, atThreshold))).toMatchObject({ total: 10, done: 10, precision: 0.9, pass: true });

    const yankiItems = [{ id: "f", flagged: 1 }, { id: "p", flagged: 0 }];
    expect(same((api) => api.scoreYanki(yankiItems, { f: "e", p: "h" }))).toMatchObject({ pass: true, done: 2 });
    expect(same((api) => api.scoreYanki(yankiItems, { f: "e", p: "e" }))).toMatchObject({ pass: false, plainSame: 1 });

    const markItems = [{ id: "m", xIs: "new", X: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"], Y: ["x"] }];
    expect(same((api) => api.scoreIsaret(markItems, { m: { realX: 9, realY: 1 } }))).toMatchObject({ done: 1, newShare: 0.9, pass: true });
    expect(same((api) => api.scoreIsaret(markItems, { m: { realX: 8, realY: 1 } }))).toMatchObject({ newShare: 0.8, pass: false });
  });
});
