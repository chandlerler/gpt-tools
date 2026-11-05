const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");

const extension = path.resolve(__dirname, "../skuid-separator-extension");
const visibilityKey = "skuid-separator-floating-enabled";

test("toolbar popup and shared floating visibility", async (t) => {
  const manifest = JSON.parse(fs.readFileSync(path.join(extension, "manifest.json")));
  assert.equal(manifest.action.default_popup, "popup.html");
  const files = new Set(["popup.html", "popup.css", "content.js", "rating-calculator.js", "xlsx-parser.js", "icons/banana.png"]);
  const server = http.createServer((req, res) => {
    const name = req.url.slice(1);
    if (name === "page.html") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end('<!doctype html><body>Test web page<script src="xlsx-parser.js"></script><script src="rating-calculator.js"></script><script src="content.js"></script></body>');
    } else if (files.has(name)) {
      const type = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript", ".png": "image/png" }[path.extname(name)];
      res.setHeader("Content-Type", type);
      res.setHeader("Content-Security-Policy", "script-src 'self'; object-src 'self'");
      res.end(fs.readFileSync(path.join(extension, name)));
    } else { res.writeHead(404); res.end(); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ headless: true, ignoreDefaultArgs: ["--hide-scrollbars"], ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  t.after(() => browser.close());
  const context = await browser.newContext();
  const stored = {};
  const errors = [];
  let failWrites = false;
  await context.exposeBinding("storageRead", () => structuredClone(stored));
  async function write(values, remove = false) {
    if (failWrites) throw new Error("Simulated storage failure");
    const changes = {};
    for (const [key, value] of Object.entries(values)) {
      changes[key] = { oldValue: stored[key], newValue: remove ? undefined : value };
      if (remove) delete stored[key]; else stored[key] = value;
    }
    await Promise.all(context.pages().map((page) => page.evaluate((changes) => {
      window.storageListeners?.forEach((listener) => listener(changes, "local"));
    }, changes)));
  }
  await context.exposeBinding("storageWrite", (_source, values) => write(values));
  await context.exposeBinding("storageRemove", (_source, key) => write({ [key]: null }, true));
  await context.addInitScript(({ base }) => {
    window.storageListeners = [];
    window.chrome = {
      runtime: { getURL: (name) => base + name },
      storage: {
        onChanged: { addListener: (listener) => window.storageListeners.push(listener) },
        local: {
          get: async (_keys, callback) => { const values = await window.storageRead(); callback?.(values); return values; },
          set: (values) => window.storageWrite(values),
          remove: (key) => window.storageRemove(key)
        }
      }
    };
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (text) => { window.copied = text; } } });
  }, { base });
  async function open(name, popup = false) {
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize(popup ? { width: 460, height: 580 } : { width: 1000, height: 850 });
    await page.goto(base + name);
    await page.locator("#skuid-separator-extension-root").waitFor({ state: "attached" });
    return page;
  }
  let popup = await open("popup.html", true);
  const web = await open("page.html");
  const web2 = await open("page.html");
  await t.test("popup opens all tools directly; floating launcher is enabled by default", async () => {
    assert.equal(await popup.locator(".panel").isVisible(), true);
    assert.equal(await popup.locator(".launcher").isVisible(), false);
    assert.equal(await popup.locator("#floatingEnabled").isChecked(), true);
    await web.locator(".launcher").waitFor();
    await web.locator(".launcher").click();
    assert.equal(await web.locator(".panel").isVisible(), true);
    assert.equal(await web.locator(".floating-setting").isVisible(), false);
    await popup.locator("#source").fill("101 102 103");
    await popup.locator("#groupEnabled").check();
    await popup.locator("#groupSize").fill("2");
    await popup.locator("#convert").click();
    assert.equal(await popup.locator(".result-group").count(), 2);
    await popup.getByRole("button", { name: "复制第 2 组", exact: true }).click();
    assert.equal(await popup.evaluate(() => window.copied), "103");
    if (process.env.POPUP_SCREENSHOT) await popup.screenshot({ path: process.env.POPUP_SCREENSHOT });
    assert.ok(await popup.locator(".panel").evaluate((node) => node.getBoundingClientRect().bottom <= 580));
  });
  await t.test("disabling hides open floating panels in all tabs, including newly opened pages", async () => {
    await popup.locator("#floatingEnabled").uncheck();
    await web.locator(".launcher").waitFor({ state: "hidden" });
    assert.equal(await web.locator(".panel").isVisible(), false);
    assert.equal(await web2.locator(".launcher").isVisible(), false);
    assert.equal(await popup.locator(".panel").isVisible(), true);
    assert.equal(stored[visibilityKey], false);
    const fresh = await open("page.html");
    assert.equal(await fresh.locator(".launcher").isVisible(), false);
    await fresh.close();
    await popup.close();
    popup = await open("popup.html", true);
    await popup.waitForFunction(() => !document.getElementById("skuid-separator-extension-root").shadowRoot.querySelector("#floatingEnabled").checked);
    assert.equal(await popup.locator(".panel").isVisible(), true);
    assert.equal(await popup.locator("#groupSize").inputValue(), "2");
  });
  await t.test("profit calculation works inside the toolbar popup", async () => {
    await popup.locator('[data-tool="profit"]').click();
    for (const [id, value] of Object.entries({ purchasePrice: "10", logisticsCost: "1.8", cpsRate: "5", salePrice: "20", mergeRate: "60" })) await popup.locator(`#${id}`).fill(value);
    await popup.locator("#calculateProfit").click();
    assert.equal(await popup.locator("#singleOrderProfit").textContent(), "¥7.20");
    assert.equal(await popup.locator("#mergedProfit").textContent(), "¥13.14");
  });
  await t.test("popup imports XLSX and shares the data with existing floating tools", async () => {
    await popup.locator('[data-tool="spu"]').click();
    await popup.locator("#baseTableInput").setInputFiles(path.join(__dirname, "fixtures/spu-sample.xlsx"));
    await popup.waitForFunction(() => document.getElementById("skuid-separator-extension-root").shadowRoot.querySelector("#baseTableStatus").textContent.includes("已保存"));
    await popup.locator("#spuQueryInput").fill("102");
    await popup.locator("#spuQueryButton").click();
    assert.deepEqual(await popup.locator(".row-title").allTextContents(), ["SKU_ID：102", "SKU_ID：101"]);
    await popup.locator("#floatingEnabled").check();
    await web.locator(".launcher").waitFor();
    assert.equal(await web.locator(".panel").isVisible(), false);
    await web.locator(".launcher").click();
    await web.locator('[data-tool="spu"]').click();
    await web.locator("#spuQueryInput").fill("900");
    await web.locator("#spuQueryButton").click();
    assert.equal(await web.locator(".spu-row").count(), 2);
    await popup.locator("#clearBaseTable").click();
    await web.locator("#spuResult").waitFor({ state: "hidden" });
    assert.equal(await web.locator("#baseTableStatus").textContent(), "未上传底表");
  });
  await t.test("four tabs use the requested 2 by 2 layout in both entry points", async () => {
    for (const page of [popup, web]) {
      assert.deepEqual(await page.locator(".tool-tab").evaluateAll((nodes) => nodes.map((node) => node.dataset.tool)), ["converter", "spu", "profit", "rating"]);
      const boxes = await page.locator(".tool-tab").evaluateAll((nodes) => nodes.map((node) => {
        const { x, y } = node.getBoundingClientRect(); return { x, y };
      }));
      assert.equal(boxes[0].y, boxes[1].y);
      assert.equal(boxes[2].y, boxes[3].y);
      assert.equal(boxes[0].x, boxes[2].x);
      assert.equal(boxes[1].x, boxes[3].x);
      assert.ok(boxes[2].y > boxes[0].y);
    }
  });
  await t.test("rating UI calculates, validates, estimates and restores saved inputs", async () => {
    await popup.locator('[data-tool="rating"]').click();
    for (const [id, value] of Object.entries({ ratingTotal: "1000", ratingPositive: "950", ratingCurrent: "95", ratingTarget: "98" })) await popup.locator(`#${id}`).fill(value);
    await popup.locator("#ratingTarget").press("Enter");
    assert.equal(await popup.locator("#ratingAdditional").textContent(), "1500 个好评");
    assert.equal(await popup.locator("#ratingNewTotal").textContent(), "2500");
    assert.equal(await popup.locator("#ratingAfter").textContent(), "98%");
    assert.equal(await popup.locator("#ratingResult").isVisible(), true);
    assert.equal(await popup.locator("#spuTool").isVisible(), false);
    if (process.env.RATING_SCREENSHOT) await popup.screenshot({ path: process.env.RATING_SCREENSHOT });
    assert.ok(await popup.locator(".panel").evaluate((node) => node.getBoundingClientRect().bottom <= 580));
    await popup.locator("#ratingCurrent").fill("94");
    assert.equal(await popup.locator("#ratingResult").isVisible(), false);
    await popup.locator("#calculateRating").click();
    assert.equal(await popup.locator("#ratingActual").textContent(), "95%");
    assert.match(await popup.locator("#ratingExplanation").textContent(), /好评数计算/);
    await popup.locator("#ratingPositive").fill("");
    await popup.locator("#calculateRating").click();
    assert.equal(await popup.locator("#ratingAdditional").textContent(), "2000 个好评");
    assert.match(await popup.locator("#ratingExplanation").textContent(), /估算/);
    await popup.locator("#ratingTarget").fill("100");
    await popup.locator("#calculateRating").click();
    assert.match(await popup.locator("#ratingAdditional").textContent(), /无法达到/);
    await popup.locator("#ratingPositive").fill("1001");
    await popup.locator("#calculateRating").click();
    assert.equal(await popup.locator("#ratingResult").isVisible(), false);
    assert.match(await popup.locator("#ratingNote").textContent(), /不能大于/);
    await popup.locator("#ratingPositive").fill("950");
    await popup.locator("#ratingTarget").fill("98");
    await popup.close();
    popup = await open("popup.html", true);
    await popup.waitForFunction(() => document.getElementById("skuid-separator-extension-root").shadowRoot.querySelector("#ratingTotal").value === "1000");
    await popup.locator('[data-tool="rating"]').click();
    assert.equal(await popup.locator("#ratingPositive").inputValue(), "950");
    assert.equal(await popup.locator("#ratingTarget").inputValue(), "98");
    await popup.locator("#calculateRating").click();
    assert.equal(await popup.locator("#ratingAdditional").textContent(), "1500 个好评");
    await web.locator('[data-tool="rating"]').click();
    await web.locator(".close").click();
    await web.locator(".launcher").click();
    assert.equal(await web.locator("#ratingTotal").evaluate((node) => node.getRootNode().activeElement === node), true);
  });
  await t.test("a failed toggle save reports an error and preserves visibility", async () => {
    failWrites = true;
    await popup.locator("#floatingEnabled").click();
    await popup.locator("#floatingSettingError").waitFor();
    assert.equal(await popup.locator("#floatingEnabled").isChecked(), true);
    assert.equal(stored[visibilityKey], true);
    assert.equal(await web.locator(".launcher").isVisible(), true);
    failWrites = false;
  });
  assert.deepEqual(errors, []);
});
