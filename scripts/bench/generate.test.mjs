// node --test scripts/bench/generate.test.mjs
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generate, INPUTS, sha256 } from "./generate.mjs";

describe("the bench inputs", () => {
  for (const [name, spec] of Object.entries(INPUTS)) {
    it(`${name}: two runs give the same bytes`, () => {
      const a = generate(spec, 256 * 1024);
      const b = generate(spec, 256 * 1024);
      assert.equal(sha256(a), sha256(b));
      assert.ok(a.length > 250 * 1024 && a.length <= 256 * 1024);
    });
  }

  it("each input is its own bytes", () => {
    const sums = Object.values(INPUTS).map((spec) => sha256(generate(spec, 64 * 1024)));
    assert.equal(new Set(sums).size, sums.length);
  });

  it("a smaller size is the start of the full file", () => {
    const small = generate(INPUTS.plain, 64 * 1024);
    const larger = generate(INPUTS.plain, 128 * 1024);
    assert.ok(larger.subarray(0, small.length).equals(small));
  });

  it("the SGR input carries colour and the CJK input wide characters", () => {
    assert.ok(generate(INPUTS.sgr, 4096).toString("utf8").includes("\x1b[38;2;"));
    assert.match(generate(INPUTS.cjk, 4096).toString("utf8"), /[一-鿿]/);
  });
});
