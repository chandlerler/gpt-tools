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
    const name = req.url.split("?")[0].slice(1);
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
  let writeCount = 0;
  let delayNextRead = false;
  let releaseRead;
  await context.exposeBinding("storageRead", async () => {
    const snapshot = structuredClone(stored);
    if (delayNextRead) {
      delayNextRead = false;
      await new Promise((resolve) => { releaseRead = resolve; });
    }
    return snapshot;
  });
  async function write(values, remove = false) {
    if (failWrites) throw new Error("Simulated storage failure");
    writeCount++;
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
    window.clipboardWrites = [];
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (text) => { window.copied = text; window.clipboardWrites.push(text); } } });
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
    assert.match(await popup.locator("#ratingExplanation").textContent(), /好评数和当前评价数计算/);
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
  await t.test("rating supports every pair and switches between adding and deleting", async () => {
    await popup.locator('[data-tool="rating"]').click();
    async function fill(total, positive, rate, target = "98") {
      for (const [id, value] of Object.entries({ ratingTotal: total, ratingPositive: positive, ratingCurrent: rate, ratingTarget: target })) await popup.locator(`#${id}`).fill(value);
    }
    for (const pair of [["1000", "950", ""], ["1000", "", "95"], ["", "950", "95"]]) {
      await fill(...pair);
      await popup.locator("#calculateRatingDelete").click();
      assert.equal(await popup.locator("#ratingAdditional").textContent(), "31 条非好评评价");
      assert.equal(await popup.locator("#ratingBaseTotal").textContent(), "1000");
      assert.equal(await popup.locator("#ratingBasePositive").textContent(), "950");
      assert.equal(await popup.locator("#ratingNonPositive").textContent(), "50");
      assert.equal(await popup.locator("#ratingNewTotal").textContent(), "969");
      assert.equal(await popup.locator("#ratingAfter").textContent(), "98.0392%");
      assert.equal(await popup.locator("#ratingNewTotalLabel").textContent(), "删除后评价总数");
      assert.equal(await popup.locator("#ratingAfterLabel").textContent(), "删除后好评率");
      if (!pair[0] || !pair[1]) assert.match(await popup.locator("#ratingExplanation").textContent(), /估算/);
      await popup.locator("#calculateRating").click();
      assert.equal(await popup.locator("#ratingAdditional").textContent(), "1500 个好评");
      assert.equal(await popup.locator("#ratingNewTotalLabel").textContent(), "新增后评价总数");
    }
    await fill("1000", "950", "", "100");
    await popup.locator("#calculateRatingDelete").click();
    assert.equal(await popup.locator("#ratingAdditional").textContent(), "50 条非好评评价");
    assert.equal(await popup.locator("#ratingAfter").textContent(), "100%");
    await fill("", "0", "0");
    await popup.locator("#calculateRatingDelete").click();
    assert.match(await popup.locator("#ratingNote").textContent(), /无法反推/);
    assert.equal(await popup.locator("#ratingResult").isVisible(), false);
    await fill("1000", "", "");
    await popup.locator("#calculateRating").click();
    assert.match(await popup.locator("#ratingNote").textContent(), /至少填写两项/);
    await fill("100", "0", "");
    await popup.locator("#calculateRatingDelete").click();
    assert.equal(await popup.locator("#ratingAdditional").textContent(), "无法达到目标");
    assert.match(await popup.locator("#ratingExplanation").textContent(), /当前没有好评/);
    await fill("1000", "950", "");
    await popup.locator("#calculateRatingDelete").click();
    if (process.env.DELETE_RATING_SCREENSHOT) await popup.screenshot({ path: process.env.DELETE_RATING_SCREENSHOT });
    assert.ok(await popup.locator(".panel").evaluate((node) => node.getBoundingClientRect().bottom <= 580));
    await popup.close();
    popup = await open("popup.html", true);
    await popup.waitForFunction(() => document.getElementById("skuid-separator-extension-root").shadowRoot.querySelector("#ratingTotal").value === "1000");
    await popup.locator('[data-tool="rating"]').click();
    await popup.locator("#calculateRatingDelete").click();
    assert.equal(await popup.locator("#ratingAdditional").textContent(), "31 条非好评评价");
    await web.locator('[data-tool="rating"]').click();
    for (const [id, value] of Object.entries({ ratingTotal: "1000", ratingPositive: "950", ratingTarget: "98" })) await web.locator(`#${id}`).fill(value);
    await web.locator("#calculateRatingDelete").click();
    assert.equal(await web.locator("#ratingAdditional").textContent(), "31 条非好评评价");
  });
  const waitValue = (page, id, value) => page.waitForFunction(({ id, value }) => {
    return document.getElementById("skuid-separator-extension-root")?.shadowRoot.querySelector(`#${id}`)?.value === value;
  }, { id, value });
  await t.test("converter input, exact output and copyable groups survive page changes without recopying", async () => {
    await popup.locator('[data-tool="converter"]').click();
    await popup.locator("#source").fill("101 102 103 104 105");
    await popup.locator("#groupEnabled").check();
    await popup.locator("#groupSize").fill("2");
    await popup.locator("#convert").click();
    for (const page of [web, web2]) {
      await waitValue(page, "result", "101,102,103,104,105");
      assert.equal(await page.locator("#converterTool").isVisible(), true);
      assert.deepEqual(await page.locator(".group-output").evaluateAll((nodes) => nodes.map((node) => node.value)), ["101,102", "103,104", "105"]);
    }
    const copiedBefore = await web2.evaluate(() => window.clipboardWrites.length);
    await web.locator("#source").fill("Edited input, not yet converted");
    await waitValue(popup, "source", "Edited input, not yet converted");
    assert.equal(await popup.locator("#result").inputValue(), "101,102,103,104,105");
    const writesBefore = writeCount;
    const fresh = await open("page.html?continuity");
    await waitValue(fresh, "source", "Edited input, not yet converted");
    assert.equal(await fresh.locator(".panel").isVisible(), true);
    assert.equal(await fresh.locator("#result").inputValue(), "101,102,103,104,105");
    assert.equal(writeCount, writesBefore, "Restoring an inactive page must not write stale state back");
    assert.equal(await fresh.evaluate(() => window.clipboardWrites.length), 0);
    await fresh.getByRole("button", { name: "复制第 2 组", exact: true }).click();
    assert.equal(await fresh.evaluate(() => window.copied), "103,104");
    assert.equal(await web2.evaluate(() => window.clipboardWrites.length), copiedBefore);
    await fresh.close();
    const anotherSite = await context.newPage();
    anotherSite.on("pageerror", (error) => errors.push(error.message));
    await anotherSite.goto(base.replace("127.0.0.1", "localhost") + "page.html?another-site");
    await waitValue(anotherSite, "source", "Edited input, not yet converted");
    assert.equal(await anotherSite.locator(".panel").isVisible(), true);
    assert.equal(await anotherSite.locator("#result").inputValue(), "101,102,103,104,105");
    assert.equal(await anotherSite.evaluate(() => window.clipboardWrites.length), 0);
    await anotherSite.close();
    await web.locator("#source").fill("");
    await web.locator("#source").pressSequentially("rapid-typing-12345");
    await waitValue(popup, "source", "rapid-typing-12345");
    assert.equal(await web.locator("#source").inputValue(), "rapid-typing-12345");
    await web2.goto(base + "page.html?navigated");
    await waitValue(web2, "source", "rapid-typing-12345");
    assert.equal(await web2.locator("#result").inputValue(), "101,102,103,104,105");
    assert.equal(await web2.evaluate(() => window.clipboardWrites.length), 0);
    await popup.locator("#source").fill("final input before closing popup");
    await popup.close();
    popup = await open("popup.html", true);
    await waitValue(popup, "source", "final input before closing popup");
    assert.equal(await popup.locator("#result").inputValue(), "101,102,103,104,105");
  });
  await t.test("position and expanded state follow across existing, new and reloaded pages", async () => {
    const bounds = await web.locator(".launcher").boundingBox();
    await web.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await web.mouse.down();
    await web.mouse.move(60, 220, { steps: 10 });
    await web.mouse.up();
    const position = await web.locator("#skuid-separator-extension-root").evaluate((node) => ({ side: node.dataset.side, top: node.getBoundingClientRect().top }));
    assert.equal(position.side, "left");
    await web2.waitForFunction((position) => {
      const node = document.getElementById("skuid-separator-extension-root");
      return node.dataset.side === position.side && node.getBoundingClientRect().top === position.top;
    }, position);
    const fresh = await open("page.html?position");
    await fresh.locator(".panel").waitFor();
    assert.deepEqual(await fresh.locator("#skuid-separator-extension-root").evaluate((node) => ({ side: node.dataset.side, top: node.getBoundingClientRect().top })), position);
    await fresh.setViewportSize({ width: 1000, height: 500 });
    await fresh.waitForFunction(() => document.getElementById("skuid-separator-extension-root").shadowRoot.querySelector(".panel").getBoundingClientRect().bottom <= innerHeight);
    await web.locator(".close").click();
    await web2.locator(".panel").waitFor({ state: "hidden" });
    await fresh.locator(".panel").waitFor({ state: "hidden" });
    await fresh.reload();
    await waitValue(fresh, "source", "final input before closing popup");
    assert.equal(await fresh.locator(".panel").isVisible(), false);
    await web2.locator(".launcher").click();
    await web.locator(".panel").waitFor();
    await fresh.locator(".panel").waitFor();
    await fresh.close();
  });
  await t.test("startup storage reads cannot roll back newer events", async () => {
    delayNextRead = true;
    const fresh = await open("page.html?delayed-read");
    assert.equal(typeof releaseRead, "function");
    await popup.locator("#source").fill("changed while another page was loading");
    await waitValue(web, "source", "changed while another page was loading");
    releaseRead();
    await waitValue(fresh, "source", "changed while another page was loading");
    assert.equal(await fresh.locator("#result").inputValue(), "101,102,103,104,105");
    await fresh.close();
  });
  await t.test("returning from a suspended page recovers missed changes without writing back", async () => {
    const key = "skuid-separator-continuity-converter";
    stored[key] = structuredClone(stored[key]);
    stored[key].client = "another-tab-while-suspended";
    stored[key].data.fields.source = "updated while the page was suspended";
    const before = writeCount;
    await web.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
    await waitValue(web, "source", "updated while the page was suspended");
    assert.equal(await web.locator("#result").inputValue(), "101,102,103,104,105");
    assert.equal(writeCount, before);
  });
  await t.test("profit and rating outputs, errors and chosen operation are restored exactly", async () => {
    await popup.locator('[data-tool="profit"]').click();
    await popup.locator("#purchasePrice").fill("10");
    await popup.locator("#calculateProfit").click();
    await web.waitForFunction(() => document.getElementById("skuid-separator-extension-root").shadowRoot.querySelector("#singleOrderProfit").textContent === "¥7.20");
    await web.locator("#purchasePrice").fill("15");
    await waitValue(popup, "purchasePrice", "15");
    assert.equal(await popup.locator("#singleOrderProfit").textContent(), "¥7.20", "An uncalculated edit must retain the exact prior output");
    await popup.locator('[data-tool="rating"]').click();
    for (const [id, value] of Object.entries({ ratingTotal: "1000", ratingPositive: "950", ratingCurrent: "", ratingTarget: "98" })) await popup.locator(`#${id}`).fill(value);
    await popup.locator("#calculateRatingDelete").click();
    await web.waitForFunction(() => document.getElementById("skuid-separator-extension-root").shadowRoot.querySelector("#ratingAdditional").textContent === "31 条非好评评价");
    const fresh = await open("page.html?rating");
    await fresh.locator("#ratingResult").waitFor();
    assert.equal(await fresh.locator("#ratingAdditional").textContent(), "31 条非好评评价");
    assert.equal(await fresh.locator("#ratingNewTotalLabel").textContent(), "删除后评价总数");
    await popup.locator("#ratingTarget").fill("101");
    await web.locator("#ratingResult").waitFor({ state: "hidden" });
    await popup.locator("#calculateRatingDelete").click();
    await fresh.waitForFunction(() => document.getElementById("skuid-separator-extension-root").shadowRoot.querySelector("#ratingNote").textContent.includes("不能超过"));
    await popup.close();
    popup = await open("popup.html", true);
    await waitValue(popup, "ratingTarget", "101");
    assert.equal(await popup.locator("#ratingTool").isVisible(), true);
    assert.match(await popup.locator("#ratingNote").textContent(), /不能超过/);
    assert.equal(await popup.locator("#ratingResult").isVisible(), false);
    await popup.locator('[data-tool="profit"]').click();
    assert.equal(await popup.locator("#purchasePrice").inputValue(), "15");
    assert.equal(await popup.locator("#singleOrderProfit").textContent(), "¥7.20");
    await fresh.close();
  });
  await t.test("SPU details and batch links survive navigation without stale table results", async () => {
    await popup.locator('[data-tool="spu"]').click();
    await popup.locator("#baseTableInput").setInputFiles(path.join(__dirname, "fixtures/spu-sample.xlsx"));
    await popup.waitForFunction(() => document.getElementById("skuid-separator-extension-root").shadowRoot.querySelector("#baseTableStatus").textContent.includes("已保存"));
    await popup.locator("#spuQueryInput").fill("102");
    await popup.locator("#spuQueryButton").click();
    await web.locator(".spu-divider").waitFor();
    await popup.locator("#spuQueryInput").fill("999");
    const fresh = await open("page.html?spu");
    await waitValue(fresh, "spuQueryInput", "999");
    assert.deepEqual(await fresh.locator(".row-title").allTextContents(), ["SKU_ID：102", "SKU_ID：101"]);
    assert.equal(await fresh.locator(".spu-divider").count(), 1);
    await fresh.locator("#copySkuIds").click();
    assert.equal(await fresh.evaluate(() => window.copied), "102\n101");
    await fresh.locator("#spuQueryButton").click();
    await popup.locator("#spuResult").waitFor({ state: "hidden" });
    assert.match(await popup.locator("#spuNote").textContent(), /未在当前底表/);
    await popup.locator("#spuBatchInput").fill("900,999");
    await popup.locator("#spuBatchButton").click();
    await web.locator("#spuBatchLinks a").waitFor();
    await fresh.reload();
    await fresh.locator("#spuBatchLinks a").waitFor();
    assert.equal(await fresh.locator("#spuBatchLinks a").getAttribute("href"), "https://item.jd.com/101.html");
    assert.match(await fresh.locator("#spuNote").textContent(), /999/);
    await fresh.locator("#copySpuLinks").click();
    assert.equal(await fresh.evaluate(() => window.copied), "https://item.jd.com/101.html");
    // A tab may close between updating the table and its view snapshot.
    // Old view snapshots must never resurrect results from a removed table.
    await write({ "skuid-separator-base-table": null }, true);
    await fresh.reload();
    await waitValue(fresh, "spuBatchInput", "900,999");
    assert.equal(await fresh.locator("#spuBatchResult").isVisible(), false);
    assert.equal(await fresh.locator("#baseTableStatus").textContent(), "未上传底表");
    await fresh.close();
  });
  await t.test("failed continuity saves are reported and can be retried", async () => {
    await popup.locator('[data-tool="converter"]').click();
    failWrites = true;
    await popup.locator("#source").fill("unsaved input");
    await popup.locator("#floatingSettingError").waitFor();
    assert.match(await popup.locator("#floatingSettingError").textContent(), /跨页状态保存失败/);
    failWrites = false;
    await popup.locator("#source").fill("saved after retry");
    await waitValue(web, "source", "saved after retry");
    await popup.locator("#floatingSettingError").waitFor({ state: "hidden" });
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
