const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../skuid-separator-extension/rating-calculator.js"), "utf8"), context);
const calculate = context.SkuidRating.calculate;

test("exact count formula rounds up and returns the minimum at decimal boundaries", () => {
  for (const [total, positive, targetRate, expected] of [
    [1000, 950, "98", "1500"], [100, 90, "95", "100"],
    [7, 5, "80", "3"], [1000, 900, "90.1", "11"],
    [10000, 9990, "99.9", "0"], [100, 50, "66.666666", "50"],
    [100, 0, "99.999999", "9999999900"]
  ]) {
    const result = calculate({ total, positive, targetRate });
    assert.equal(result.additional, expected);
    assert.equal(result.estimated, false);
    const scale = 100000000n;
    const [whole, decimal = ""] = targetRate.split(".");
    const target = BigInt(whole) * 1000000n + BigInt(decimal.padEnd(6, "0"));
    const x = BigInt(result.additional), n = BigInt(total), p = BigInt(positive);
    assert.ok((p + x) * scale >= (n + x) * target);
    if (x > 0n) assert.ok((p + x - 1n) * scale < (n + x - 1n) * target);
  }
});

test("current rate can estimate, and an exact count takes priority when both are supplied", () => {
  const estimated = calculate({ total: "1000", currentRate: "95", targetRate: "98" });
  assert.equal(estimated.additional, "1500");
  assert.equal(estimated.estimated, true);
  assert.equal(estimated.current, "95%");
  assert.equal(estimated.after, "98%");
  const exact = calculate({ total: "1000", positive: "950", currentRate: "94", targetRate: "98" });
  assert.equal(exact.additional, "1500");
  assert.equal(exact.current, "95%");
  assert.equal(exact.usedPositive, true);
  assert.equal(exact.estimated, false);
  assert.equal(calculate({ total: "3", currentRate: "66.67", targetRate: "80" }).additional, "2");
});

test("already met targets, zero reviews, and strict 100 percent are handled explicitly", () => {
  assert.equal(calculate({ total: 100, positive: 96, targetRate: 95 }).additional, "0");
  assert.equal(calculate({ total: 100, positive: 0, targetRate: 0 }).additional, "0");
  assert.equal(calculate({ total: 100, positive: 99, targetRate: 100 }).status, "unreachable");
  assert.equal(calculate({ total: 100, positive: 100, targetRate: 100 }).additional, "0");
  const empty = calculate({ total: 0, positive: 0, targetRate: 100 });
  assert.equal(empty.additional, "1");
  assert.equal(empty.after, "100%");
  assert.equal(empty.current, "暂无评价");
  assert.equal(calculate({ total: 0, positive: 0, targetRate: 0 }).additional, "0");
});

test("invalid counts, incomplete inputs, impossible counts and invalid rates are rejected", () => {
  const valid = { total: "100", positive: "90", targetRate: "95" };
  for (const changes of [
    { total: "" }, { total: "-1" }, { total: "2.5" },
    { positive: "101" }, { positive: "1.2" }, { positive: "-1" },
    { positive: "", currentRate: "" }, { targetRate: "" },
    { targetRate: "100.1" }, { targetRate: "-1" }, { targetRate: "99.1234567" },
    { currentRate: "101" }, { total: "0", positive: "0", currentRate: "90" }
  ]) assert.throws(() => calculate({ ...valid, ...changes }));
});

test("large integer counts are not rounded by JavaScript Number", () => {
  const result = calculate({ total: "9007199254740993", positive: "9007199254740992", targetRate: "99.999999" });
  assert.equal(result.additional, "0");
  assert.equal(result.total, "9007199254740993");
});

test("any two current values resolve the same data for both modes", () => {
  for (const inputs of [
    { total: "1000", positive: "950" },
    { total: "1000", currentRate: "95" },
    { positive: "950", currentRate: "95" }
  ]) {
    const add = calculate({ ...inputs, targetRate: "98" });
    const remove = calculate({ ...inputs, targetRate: "98", mode: "delete" });
    assert.equal(add.additional, "1500");
    assert.equal(remove.removed, "31");
    assert.equal(remove.total, "969");
    assert.equal(remove.after, "98.0392%");
    for (const result of [add, remove]) {
      assert.equal(result.beforeTotal, "1000");
      assert.equal(result.positive, "950");
      assert.equal(result.nonPositive, "50");
      assert.equal(result.estimated, !inputs.total || !inputs.positive);
    }
  }
});

test("percentage inference rounds counts consistently and flags estimates", () => {
  const total = calculate({ positive: "5", currentRate: "71.43", targetRate: "80" });
  assert.equal(total.beforeTotal, "7");
  assert.equal(total.current, "71.4286%");
  assert.equal(total.additional, "3");
  assert.equal(total.inferred, "total");
  const positive = calculate({ total: "3", currentRate: "50", targetRate: "80", mode: "delete" });
  assert.equal(positive.positive, "2");
  assert.equal(positive.removed, "1");
  assert.equal(positive.inferred, "positive");
  assert.equal(calculate({ positive: "1", currentRate: "40", targetRate: "50" }).beforeTotal, "3");
});

test("deletion returns the minimal possible integer without deleting good reviews", () => {
  for (let n = 0; n <= 12; n++) {
    for (let p = 0; p <= n; p++) {
      for (const target of [0, 1, 50, 80, 99, 100]) {
        const result = calculate({ total: String(n), positive: String(p), targetRate: String(target), mode: "delete" });
        let expected = null;
        for (let d = 0; d <= n - p; d++) {
          if ((target === 0 && d === 0) || (n - d > 0 && p * 100 >= (n - d) * target)) { expected = d; break; }
        }
        if (expected === null) assert.equal(result.status, "unreachable");
        else {
          assert.equal(result.removed, String(expected));
          assert.equal(result.total, String(n - expected));
          assert.ok(BigInt(result.removed) <= BigInt(result.nonPositive));
        }
      }
    }
  }
  assert.equal(calculate({ total: 1000, positive: 950, targetRate: "99.9", mode: "delete" }).removed, "50");
});

test("under-specified or inconsistent pairs request enough information", () => {
  for (const inputs of [
    { total: "0" }, { positive: "50" }, { currentRate: "95" },
    { positive: "0", currentRate: "0" },
    { positive: "5", currentRate: "0" },
    { positive: "0", currentRate: "10" }
  ]) assert.throws(() => calculate({ ...inputs, targetRate: "98" }));
  assert.throws(() => calculate({ total: 100, positive: 95, targetRate: 98, mode: "unknown" }));
  assert.equal(calculate({ total: 0, currentRate: 0, targetRate: 100 }).additional, "1");
  assert.equal(calculate({ total: 100, positive: 0, targetRate: 1, mode: "delete" }).status, "unreachable");
  assert.equal(calculate({ total: 100, positive: 95, targetRate: 100, mode: "delete" }).removed, "5");
});
