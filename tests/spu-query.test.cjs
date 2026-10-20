const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("playwright");

const extension = path.resolve(__dirname, "../skuid-separator-extension");
const dataset = {
  fileName: "fixture.xlsx",
  importedAt: 1,
  skuCount: 4,
  spuCount: 2,
  skus: [
    { spuId: "900", skuId: "101", purchasePrice: "11", logisticsCost: "1.8", goodRate: "98" },
    { spuId: "900", skuId: "102", purchasePrice: "22", logisticsCost: "2", goodRate: "97" },
    { spuId: "900", skuId: "103", purchasePrice: "33", logisticsCost: "3", goodRate: "96" },
    { spuId: "901", skuId: "104", purchasePrice: "44", logisticsCost: "4", goodRate: "95" }
  ],
  skuIndex: { "101": 0, "102": 1, "103": 2, "104": 3 },
  spuIndex: {
    "900": { skuIds: ["101", "102", "103"], supplier: "测试供应商" },
    "901": { skuIds: ["104"], supplier: "单 SKU 供应商" }
  }
};

test("SPU information matching in Chromium", async (t) => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
  });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.evaluate(({ data, bananaUrl }) => {
    window.fixture = data;
    window.chrome = {
      runtime: { getURL: () => bananaUrl },
      storage: { local: {
        get: (_keys, callback) => callback({ "skuid-separator-base-table": data }),
        set: async () => {},
        remove: async () => {}
      } }
    };
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: async (text) => { window.copied = text; } }
    });
  }, {
    data: dataset,
    bananaUrl: `data:image/png;base64,${fs.readFileSync(path.join(extension, "icons/banana.png")).toString("base64")}`
  });
  await page.addScriptTag({ path: path.join(extension, "xlsx-parser.js") });
  await page.addScriptTag({ path: path.join(extension, "content.js") });
  await t.test("banana loads without a background and rotates only on hover", async () => {
    const launcher = page.locator(".launcher");
    const banana = page.locator(".banana-icon");
    await banana.evaluate((image) => image.decode());
    assert.equal(await banana.evaluate((image) => image.naturalWidth), 192);
    assert.equal(await launcher.evaluate((node) => getComputedStyle(node).backgroundColor), "rgba(0, 0, 0, 0)");
    assert.equal(await launcher.evaluate((node) => getComputedStyle(node).backgroundImage), "none");
    assert.equal(await banana.evaluate((node) => getComputedStyle(node).animationName), "none");
    await launcher.hover();
    assert.equal(await banana.evaluate((node) => getComputedStyle(node).animationName), "banana-spin");
    const initialTransform = await banana.evaluate((node) => getComputedStyle(node).transform);
    await page.waitForFunction((initial) => {
      const image = document.getElementById("skuid-separator-extension-root").shadowRoot.querySelector(".banana-icon");
      return getComputedStyle(image).transform !== initial;
    }, initialTransform);
    await page.mouse.move(0, 0);
    assert.equal(await banana.evaluate((node) => getComputedStyle(node).animationName), "none");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await launcher.hover();
    assert.equal(await banana.evaluate((node) => getComputedStyle(node).animationName), "none");
    await page.emulateMedia({ reducedMotion: "no-preference" });
  });
  await t.test("banana remains draggable without opening the panel", async () => {
    const bounds = await page.locator(".launcher").boundingBox();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down();
    await page.mouse.move(60, 200, { steps: 10 });
    assert.equal(await page.locator(".banana-icon").evaluate((node) => getComputedStyle(node).animationName), "none");
    await page.mouse.up();
    assert.equal(await page.locator("#skuid-separator-extension-root").getAttribute("data-side"), "left");
    assert.equal(await page.locator(".panel").isVisible(), false);
  });
  await page.locator(".launcher").click();
  await page.locator('[data-tool="spu"]').click();

  async function query(id, enter = false) {
    await page.locator("#spuQueryInput").fill(id);
    if (enter) await page.locator("#spuQueryInput").press("Enter");
    else await page.locator("#spuQueryButton").click();
    return page.locator("#spuRows .row-title").allTextContents();
  }
  const titles = (...ids) => ids.map((id) => `SKU_ID：${id}`);

  await t.test("middle SKU appears first with a light divider and correct metrics", async () => {
    assert.deepEqual(await query("102"), titles("102", "101", "103"));
    assert.equal(await page.locator(".spu-divider").count(), 1);
    assert.equal(await page.locator(".spu-divider").evaluate((node) => node.previousElementSibling.textContent.includes("SKU_ID：102")), true);
    assert.equal(await page.locator(".spu-divider").evaluate((node) => node.nextElementSibling.textContent.includes("SKU_ID：101")), true);
    assert.match(await page.locator(".spu-row").first().textContent(), /采购22.*物流2.*好评率97%/);
    assert.equal(await page.locator(".spu-divider").evaluate((node) => getComputedStyle(node).borderTopColor), "rgb(226, 232, 240)");
    assert.equal(await page.locator(".spu-divider").evaluate((node) => getComputedStyle(node).borderTopWidth), "1px");
    await page.locator("#copySkuIds").click();
    assert.equal(await page.evaluate(() => window.copied), "102\n101\n103");
  });

  await t.test("SPU query restores table order and removes the divider", async () => {
    assert.deepEqual(await query("900"), titles("101", "102", "103"));
    assert.equal(await page.locator(".spu-divider").count(), 0);
    assert.equal(await page.locator("#spuLink").getAttribute("href"), "https://item.jd.com/101.html");
    await page.locator("#copySkuIds").click();
    assert.equal(await page.evaluate(() => window.copied), "101\n102\n103");
    assert.deepEqual(await page.evaluate(() => window.fixture.spuIndex["900"].skuIds), ["101", "102", "103"]);
  });

  await t.test("first and last SKU queries keep all results without duplicate dividers", async () => {
    assert.deepEqual(await query("101"), titles("101", "102", "103"));
    assert.equal(await page.locator(".spu-divider").count(), 1);
    assert.deepEqual(await query(" 103.0 ", true), titles("103", "101", "102"));
    assert.equal(await page.locator(".spu-divider").count(), 1);
  });

  await t.test("single-SKU results do not leave a dangling divider", async () => {
    assert.deepEqual(await query("104"), titles("104"));
    assert.equal(await page.locator(".spu-divider").count(), 0);
    assert.deepEqual(await query("901"), titles("104"));
    assert.equal(await page.locator(".spu-divider").count(), 0);
  });

  await t.test("unmatched and empty input clear previous results", async () => {
    await query("102");
    assert.deepEqual(await query("999"), []);
    assert.equal(await page.locator(".spu-divider").count(), 0);
    assert.match(await page.locator("#spuNote").textContent(), /未在当前底表中匹配/);
    await query("");
    assert.match(await page.locator("#spuNote").textContent(), /请输入 SPU_ID 或 SKU_ID/);
  });

  await t.test("batch SPU links clear SKU detail results", async () => {
    await query("102");
    await page.locator("#spuBatchInput").fill("900,901");
    await page.locator("#spuBatchButton").click();
    assert.equal(await page.locator(".spu-divider").count(), 0);
    assert.deepEqual(await page.locator("#spuBatchLinks a").allTextContents(), [
      "https://item.jd.com/101.html", "https://item.jd.com/104.html"
    ]);
    await query("900");
    assert.equal(await page.locator("#spuBatchResult").isVisible(), false);
  });

  assert.deepEqual(errors, []);
});
