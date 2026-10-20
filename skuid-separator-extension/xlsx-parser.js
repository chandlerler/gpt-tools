(() => {
  const fieldNames = ["spu", "sku", "supplier", "purchase", "logistics", "rating"];

  const normalizeHeader = (value) => String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[（）()：:，,]/g, "")
    .replace(/[_-]/g, "");

  const normalizeId = (value) => {
    const text = String(value ?? "").trim();
    return /^\d+(\.0+)?$/.test(text) ? text.replace(/\.0+$/, "") : text;
  };

  const normalizeValue = (value) => String(value ?? "").trim();

  const classifyHeader = (header) => {
    if (header.includes("供应商名称") || header.includes("供应商")) return "supplier";
    if (header.includes("商品采购价") || header.includes("采购价") || header.includes("采购价格")) return "purchase";
    if (header.includes("京配物流成本") || header.includes("物流成本")) return "logistics";
    if (header.includes("真实好评率") || header.includes("好评率")) return "rating";
    if (header.includes("skuid") && !header.includes("spu")) return "sku";
    if (header.includes("spuid") && !header.includes("sku")) return "spu";
    return null;
  };

  const mapHeaderRow = (row) => {
    const map = {};
    row.forEach((value, index) => {
      const field = classifyHeader(normalizeHeader(value));
      if (field && map[field] === undefined) map[field] = index;
    });
    return map;
  };

  const findHeader = (rows) => {
    let best = { index: -1, score: -1, map: {} };
    rows.slice(0, 20).forEach((row, index) => {
      const map = mapHeaderRow(row);
      const score = fieldNames.reduce((count, field) => count + Number(map[field] !== undefined), 0);
      if (score > best.score) best = { index, score, map };
    });
    return best;
  };

  const columnToIndex = (column) => {
    let result = 0;
    for (const char of column) result = result * 26 + char.charCodeAt(0) - 64;
    return result - 1;
  };

  const cellValue = (cell, sharedStrings) => {
    const type = cell.getAttribute("t");
    if (type === "inlineStr") {
      const inlineText = cell.getElementsByTagName("is")[0];
      if (!inlineText) return "";
      return Array.from(inlineText.getElementsByTagName("t")).map((node) => node.textContent).join("");
    }

    const valueNode = cell.getElementsByTagName("v")[0];
    const rawValue = valueNode ? valueNode.textContent : "";
    if (type === "s") {
      const sharedIndex = Number(rawValue);
      return Number.isInteger(sharedIndex) ? sharedStrings[sharedIndex] ?? "" : "";
    }
    return rawValue;
  };

  const parseWorksheet = (xml, sharedStrings) => {
    const document = new DOMParser().parseFromString(xml, "application/xml");
    if (document.getElementsByTagName("parsererror").length) throw new Error("工作表 XML 解析失败。");
    const rows = [];

    for (const rowNode of document.getElementsByTagName("row")) {
      const row = [];
      for (const cell of rowNode.getElementsByTagName("c")) {
        const reference = cell.getAttribute("r") || "";
        const column = reference.match(/^([A-Z]+)/)?.[1];
        const index = column ? columnToIndex(column) : row.length;
        row[index] = cellValue(cell, sharedStrings);
      }
      rows.push(Array.from(row, (value) => value ?? ""));
    }
    return rows;
  };

  const readEntry = async (bytes, entry) => {
    const localOffset = entry.localOffset;
    const localView = new DataView(bytes.buffer, bytes.byteOffset + localOffset, 30);
    if (localView.getUint32(0, true) !== 0x04034b50) throw new Error("XLSX 压缩包格式无效。");
    const localNameLength = localView.getUint16(26, true);
    const localExtraLength = localView.getUint16(28, true);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(start, start + entry.compressedSize);

    if (entry.method === 0) return new TextDecoder().decode(compressed);
    if (entry.method !== 8) throw new Error(`暂不支持的 XLSX 压缩方式：${entry.method}`);
    if (typeof DecompressionStream === "undefined") throw new Error("当前浏览器不支持解压 XLSX。");

    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new TextDecoder().decode(await new Response(stream).arrayBuffer());
  };

  const readZip = async (buffer) => {
    const bytes = new Uint8Array(buffer);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocdOffset = -1;
    const minimum = Math.max(0, bytes.length - 22 - 65535);
    for (let index = bytes.length - 22; index >= minimum; index -= 1) {
      if (view.getUint32(index, true) === 0x06054b50) {
        eocdOffset = index;
        break;
      }
    }
    if (eocdOffset < 0) throw new Error("未找到 XLSX 压缩包目录。");

    const entryCount = view.getUint16(eocdOffset + 10, true);
    const directoryOffset = view.getUint32(eocdOffset + 16, true);
    const directorySize = view.getUint32(eocdOffset + 12, true);
    if (directoryOffset === 0xffffffff || directorySize === 0xffffffff) throw new Error("暂不支持 ZIP64 格式的 XLSX。");

    const entries = new Map();
    let offset = directoryOffset;
    const directoryEnd = directoryOffset + directorySize;
    for (let index = 0; index < entryCount && offset < directoryEnd; index += 1) {
      if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("XLSX 压缩包目录无效。");
      const method = view.getUint16(offset + 10, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const localOffset = view.getUint32(offset + 42, true);
      const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLength);
      const name = new TextDecoder().decode(nameBytes);
      entries.set(name, { method, compressedSize, localOffset });
      offset += 46 + nameLength + extraLength + commentLength;
    }

    const files = new Map();
    for (const [name, entry] of entries) files.set(name, await readEntry(bytes, entry));
    return files;
  };

  const resolveSheetPath = (target) => {
    const path = String(target || "").replace(/^\//, "");
    if (path.startsWith("xl/")) return path;
    if (path.startsWith("/xl/")) return path.slice(1);
    return `xl/${path}`;
  };

  const buildDataset = (rows, header, meta) => {
    const map = header.map;
    const skus = [];
    const skuIndex = {};
    const spuIndex = {};

    for (const row of rows.slice(header.index + 1)) {
      const spuId = normalizeId(row[map.spu]);
      const skuId = normalizeId(row[map.sku]);
      if (!spuId || !skuId || skuIndex[skuId] !== undefined) continue;

      const supplier = normalizeValue(row[map.supplier]);
      if (!spuIndex[spuId]) spuIndex[spuId] = { supplier: "", skuIds: [] };
      if (!spuIndex[spuId].supplier && supplier) spuIndex[spuId].supplier = supplier;
      if (!spuIndex[spuId].skuIds.includes(skuId)) spuIndex[spuId].skuIds.push(skuId);

      skuIndex[skuId] = skus.length;
      skus.push({
        skuId,
        spuId,
        supplier,
        purchasePrice: normalizeValue(row[map.purchase]),
        logisticsCost: normalizeValue(row[map.logistics]),
        goodRate: normalizeValue(row[map.rating])
      });
    }

    if (!skus.length) throw new Error("未解析到包含有效 SPU_ID 和 SKU_ID 的数据行。");
    return {
      fileName: meta.fileName,
      importedAt: meta.importedAt,
      spuCount: Object.keys(spuIndex).length,
      skuCount: skus.length,
      skus,
      skuIndex,
      spuIndex
    };
  };

  const parseWorkbook = async (buffer, meta = {}) => {
    const files = await readZip(buffer);
    const workbookXml = files.get("xl/workbook.xml");
    const relationshipsXml = files.get("xl/_rels/workbook.xml.rels");
    if (!workbookXml || !relationshipsXml) throw new Error("XLSX 缺少工作簿定义。");

    const parser = new DOMParser();
    const workbookDocument = parser.parseFromString(workbookXml, "application/xml");
    const relationshipDocument = parser.parseFromString(relationshipsXml, "application/xml");
    if (workbookDocument.getElementsByTagName("parsererror").length) throw new Error("工作簿 XML 解析失败。");

    const relationships = new Map();
    for (const relationship of relationshipDocument.getElementsByTagName("Relationship")) {
      relationships.set(relationship.getAttribute("Id"), relationship.getAttribute("Target"));
    }

    const sharedStringsXml = files.get("xl/sharedStrings.xml");
    const sharedStrings = [];
    if (sharedStringsXml) {
      const sharedDocument = parser.parseFromString(sharedStringsXml, "application/xml");
      for (const item of sharedDocument.getElementsByTagName("si")) {
        sharedStrings.push(Array.from(item.getElementsByTagName("t")).map((node) => node.textContent).join(""));
      }
    }

    let best = null;
    for (const sheetNode of workbookDocument.getElementsByTagName("sheet")) {
      const relationshipId = sheetNode.getAttribute("r:id");
      const sheetPath = resolveSheetPath(relationships.get(relationshipId));
      const sheetXml = files.get(sheetPath);
      if (!sheetXml) continue;
      const rows = parseWorksheet(sheetXml, sharedStrings);
      const header = findHeader(rows);
      const preference = sheetNode.getAttribute("name") === "数据" || sheetPath === "xl/worksheets/sheet2.xml" ? 0.5 : 0;
      const score = header.score + preference;
      if (!best || score > best.score) best = { rows, header, score };
    }

    if (!best || best.header.score < 2 || best.header.map.spu === undefined || best.header.map.sku === undefined) {
      throw new Error("未找到有效列名，请确认包含商品SPU_ID、商品SKU_ID等列。");
    }

    const missingFields = fieldNames.filter((field) => best.header.map[field] === undefined);
    const dataset = buildDataset(best.rows, best.header, {
      fileName: meta.fileName || "底表.xlsx",
      importedAt: meta.importedAt || Date.now()
    });
    return { ...dataset, missingFields };
  };

  window.SkuidXlsx = { parseWorkbook };
})();
