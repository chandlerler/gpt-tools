const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("playwright");

const extension = path.resolve(__dirname, "../skuid-separator-extension");
const storageKey = "skuid-separator-settings";

test("optional converter grouping in Chromium", async (t) => {
  const browser = await chromium.launch({
    headless: true,
    ignoreDefaultArgs: ["--hide-scrollbars"],
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
  });
  t.after(() => browser.close());
  const errors = [];
  async function open(settings = {}) {
    const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.evaluate(({ settings, bananaUrl }) => {
      window.saved = { "skuid-separator-settings": settings };
      window.writes = [];
      window.chrome = {
        runtime: { getURL: () => bananaUrl },
        storage: { local: {
          get: (_keys, callback) => callback(window.saved),
          set: async (values) => Object.assign(window.saved, values)
        } }
      };
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async (value) => { window.writes.push(value); },
          readText: async () => window.clipboardInput
        }
      });
    }, { settings, bananaUrl: `data:image/png;base64,${fs.readFileSync(path.join(extension, "icons/banana.png")).toString("base64")}` });
    await page.addScriptTag({ path: path.join(extension, "content.js") });
    await page.locator(".launcher").click();
    return page;
  }
  const page = await open();
  const ids = Array.from({ length: 123 }, (_, i) => String(10000000000000 + i));
  const groups = () => page.locator(".group-output").evaluateAll((nodes) => nodes.map((node) => node.value));
  const lastCopy = () => page.evaluate(() => window.writes.at(-1));

  await t.test("grouping is off by default and ordinary conversion is unchanged", async () => {
    assert.equal(await page.locator("#groupEnabled").isChecked(), false);
    assert.equal(await page.locator("#groupSize").isDisabled(), true);
    await page.locator("#source").fill("101 102；101、103\n104");
    await page.locator("#convert").click();
    assert.equal(await page.locator("#result").inputValue(), "101,102,101,103,104");
    assert.equal(await lastCopy(), "101,102,101,103,104");
    assert.equal(await page.locator("#groupedResult").isVisible(), false);
  });

  await t.test("123 SKUs form 50/50/23 columns with individual and whole copies", async () => {
    await page.locator("#source").fill(ids.join(" "));
    await page.locator("#groupEnabled").check();
    await page.locator("#groupSize").fill("50");
    await page.locator("#convert").click();
    const expected = [ids.slice(0, 50), ids.slice(50, 100), ids.slice(100)].map((items) => items.join(","));
    assert.deepEqual(await groups(), expected);
    assert.equal(await lastCopy(), ids.join(","));
    assert.equal(await page.locator("#result").isVisible(), false);
    assert.equal(await page.locator("#copyResult").textContent(), "复制全部");
    for (let i = 0; i < expected.length; i++) {
      await page.getByRole("button", { name: `复制第 ${i + 1} 组`, exact: true }).click();
      assert.equal(await lastCopy(), expected[i]);
    }
    await page.locator("#copyResult").click();
    assert.equal(await lastCopy(), ids.join(","));
    assert.equal(await page.locator("#groupedResult").evaluate((node) => node.scrollWidth > node.clientWidth && getComputedStyle(node).overflowX === "auto"), true);
    await page.locator("#groupedResult").evaluate((node) => { node.scrollLeft = node.scrollWidth; });
    assert.ok(await page.locator("#groupedResult").evaluate((node) => node.scrollLeft > 0));
    await page.locator("#groupedResult").evaluate((node) => { node.scrollLeft = 0; });
    if (process.env.GROUPING_SCREENSHOT) await page.locator(".panel").screenshot({ path: process.env.GROUPING_SCREENSHOT });
  });

  await t.test("all separator modes work within groups, including links and custom text", async () => {
    await page.locator("#source").fill("101 102 101 104 105");
    await page.locator("#groupSize").fill("2");
    for (const [mode, separator] of [["space", " "], ["newline", "\n"], ["link", "\n"], ["custom", " | "]]) {
      await page.locator(`label.choice:has(input[value=${mode}])`).click();
      if (mode === "custom") await page.locator("#customSeparator").fill(separator);
      const values = ["101", "102", "101", "104", "105"].map((id) => mode === "link" ? `https://item.jd.com/${id}.html` : id);
      assert.deepEqual(await groups(), [values.slice(0, 2), values.slice(2, 4), values.slice(4)].map((items) => items.join(separator)));
      await page.getByRole("button", { name: "复制第 2 组", exact: true }).click();
      assert.equal(await lastCopy(), values.slice(2, 4).join(separator));
    }
  });

  await t.test("one item, exact groups and groups larger than the input have no empty columns", async () => {
    await page.locator("label.choice:has(input[value=comma])").click();
    await page.locator("#source").fill("101 102 103 104");
    for (const [size, expected] of [["1", ["101", "102", "103", "104"]], ["2", ["101,102", "103,104"]], ["50", ["101,102,103,104"]]]) {
      await page.locator("#groupSize").fill(size);
      assert.deepEqual(await groups(), expected);
    }
  });

  await t.test("invalid size clears stale results and never copies", async () => {
    for (const size of ["", "0", "-2", "1.5", "9007199254740992"]) {
      const count = await page.evaluate(() => window.writes.length);
      await page.locator("#groupSize").fill(size);
      await page.locator("#convert").click();
      assert.match(await page.locator("#note").textContent(), /大于 0 的整数/);
      assert.deepEqual(await groups(), []);
      assert.equal(await page.locator("#result").inputValue(), "");
      assert.equal(await page.evaluate(() => window.writes.length), count);
    }
    await page.locator("#groupEnabled").uncheck();
    assert.equal(await page.locator("#result").inputValue(), "101,102,103,104");
    assert.equal(await page.locator("#result").isVisible(), true);
    assert.equal(await page.locator("#groupedResult").isVisible(), false);
  });

  await t.test("clipboard input groups without copying until requested; empty input clears columns", async () => {
    await page.locator("#groupEnabled").check();
    await page.locator("#groupSize").fill("2");
    await page.evaluate(() => { window.clipboardInput = "201,202；203"; });
    const count = await page.evaluate(() => window.writes.length);
    await page.locator("#readClipboard").click();
    assert.deepEqual(await groups(), ["201,202", "203"]);
    assert.equal(await page.evaluate(() => window.writes.length), count);
    await page.locator("#source").fill(" ,；\n");
    await page.locator("#convert").click();
    assert.deepEqual(await groups(), []);
    assert.equal(await page.locator("#result").inputValue(), "");
  });

  await t.test("group preferences persist and controls fit a narrow viewport", async () => {
    const settings = await page.evaluate((key) => window.saved[key], storageKey);
    const restored = await open(settings);
    assert.equal(await restored.locator("#groupEnabled").isChecked(), true);
    assert.equal(await restored.locator("#groupSize").inputValue(), "2");
    assert.equal(await restored.locator("#groupSize").isDisabled(), false);
    await restored.setViewportSize({ width: 360, height: 800 });
    const custom = await restored.locator("#customSeparator").boundingBox();
    const group = await restored.locator(".group-options").boundingBox();
    assert.ok(group.x >= custom.x + custom.width);
    assert.ok(Math.abs(group.y - custom.y) < 5);
    assert.equal(await restored.locator(".custom-wrap").evaluate((node) => node.scrollWidth <= node.clientWidth), true);
    await restored.close();
  });
  assert.deepEqual(errors, []);
});
