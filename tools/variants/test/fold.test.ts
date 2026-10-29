import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { foldTable, parseDictionary, renderModule, simplifiedTable } from "../src/fold.ts";

const st = parseDictionary("# comment\n台\t臺 檯 颱 台\n驿\t驛\n伪\t僞\n干\t幹 乾 干\n");
const jp = parseDictionary("駅\t驛\n稲\t稻\n弁\t弁 辨 瓣\n");
const tw = parseDictionary("僞\t偽\n");

describe("foldTable", () => {
  const table = foldTable([st, jp, tw]);

  it("folds Simplified and Japanese forms to the Traditional form", () => {
    assert.equal(table.get("台"), "臺");
    assert.equal(table.get("驿"), "驛");
    assert.equal(table.get("駅"), "驛");
    assert.equal(table.get("稲"), "稻");
  });

  it("follows chains to one form per group", () => {
    assert.equal(table.get("伪"), "偽");
    assert.equal(table.get("僞"), "偽");
    assert.equal(table.has("偽"), false);
  });

  it("uses the first candidate that differs from the key", () => {
    assert.equal(table.get("干"), "幹");
    assert.equal(table.get("弁"), "辨");
  });

  it("never maps a character to itself or in a cycle", () => {
    const cyclic = foldTable([parseDictionary("甲\t乙\n"), parseDictionary("乙\t甲\n")]);
    assert.deepEqual([...cyclic], [["甲", "乙"]]);
  });
});

describe("simplifiedTable", () => {
  it("maps Simplified characters to the Taiwan form and leaves Japanese forms out", () => {
    const table = simplifiedTable(st, tw);
    assert.equal(table.get("伪"), "偽");
    assert.equal(table.get("驿"), "驛");
    assert.equal(table.has("駅"), false);
    assert.equal(table.has("稲"), false);
  });
});

describe("renderModule", () => {
  it("writes each table as an export of string literals", () => {
    const text = renderModule({ A: new Map([["台", "臺"]]), B: new Map([["伪", "偽"]]) }, "// header");
    assert.match(text, /^\/\/ header\n/);
    assert.match(text, /export const A: readonly string\[\] = \[\n {2}"台臺",/);
    assert.match(text, /export const B: readonly string\[\] = \[\n {2}"伪偽",/);
  });
});
