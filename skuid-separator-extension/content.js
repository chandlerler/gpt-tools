(() => {
  const rootId = "skuid-separator-extension-root";
  const storageKey = "skuid-separator-settings";
  const calculatorStorageKey = "skuid-separator-calculator";
  const positionStorageKey = "skuid-separator-position";
  const baseTableStorageKey = "skuid-separator-base-table";
  const floatingVisibilityKey = "skuid-separator-floating-enabled";
  const isPopup = location.href === chrome.runtime.getURL("popup.html");
  const separatorMap = { comma: ",", space: " ", newline: "\n", link: "\n" };

  if (document.getElementById(rootId)) return;

  const root = document.createElement("div");
  root.id = rootId;
  root.dataset.side = "right";
  root.dataset.panelDirection = "up";
  root.dataset.mode = isPopup ? "popup" : "floating";
  root.style.cssText = isPopup
    ? "display:block;position:relative;width:460px"
    : "all:initial;display:none;position:fixed;right:24px;top:calc(100vh - 76px);z-index:2147483647";
  (isPopup ? document.body : document.documentElement).appendChild(root);
  const shadow = root.attachShadow({ mode: "open" });

  shadow.innerHTML = `
    <style>
      :host{all:initial}*{box-sizing:border-box} .launcher{width:52px;height:52px;padding:0;border:0;background:transparent;box-shadow:none;cursor:grab;display:grid;place-items:center;touch-action:none;user-select:none}.launcher:focus-visible{outline:2px solid #c99a00;outline-offset:4px;border-radius:8px}.launcher.dragging{cursor:grabbing}.banana-icon{display:block;width:52px;height:52px;object-fit:contain;pointer-events:none;user-select:none;transform-origin:center}.launcher:hover .banana-icon{animation:banana-spin 1.6s linear infinite}.launcher.dragging .banana-icon{animation:none}@keyframes banana-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.launcher:hover .banana-icon{animation:none}}.panel{position:absolute;right:0;bottom:64px;width:430px;padding:16px;border:1px solid rgba(34,47,80,.12);border-radius:16px;color:#1d2638;background:rgba(255,255,255,.98);box-shadow:0 16px 46px rgba(22,36,73,.22);font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}:host([data-side="left"]) .panel{right:auto;left:0}:host([data-panel-direction="down"]) .panel{top:64px;bottom:auto}.hidden{display:none}.header,.result-header{display:flex;align-items:center;justify-content:space-between}.header{margin-bottom:12px}h1{margin:0;font-size:16px;font-weight:700}.close{width:28px;height:28px;padding:0;border:0;border-radius:7px;cursor:pointer;color:#526075;background:transparent;font-size:21px;line-height:1}.close:hover{color:#172033;background:#eef2f8}.label{display:block;margin:10px 0 6px;color:#536176;font-size:12px;font-weight:600}textarea,input{width:100%;border:1px solid #d4ddea;border-radius:8px;outline:none;color:#1d2638;background:#fff;font:inherit}textarea{min-height:75px;padding:9px 10px;resize:vertical}textarea:focus,input:focus{border-color:#3f75ee;box-shadow:0 0 0 3px rgba(63,117,238,.13)}textarea[readonly]{color:#36445b;background:#f7f9fc}.choice-row{display:flex;flex-wrap:wrap;gap:6px}.choice{position:relative;cursor:pointer}.choice input{position:absolute;opacity:0;pointer-events:none}.choice span{display:inline-block;padding:5px 8px;border:1px solid #d4ddea;border-radius:7px;color:#4e5d73;background:#fff;font-size:12px}.choice input:checked+span{border-color:#3f75ee;color:#245bd1;background:#edf3ff;font-weight:600}.custom-wrap{display:flex;gap:7px;align-items:center;margin-top:8px}.custom-wrap label{flex:0 0 auto;color:#536176;font-size:12px}#customSeparator{height:30px;padding:5px 8px;font-size:12px}#customSeparator:disabled{cursor:not-allowed;color:#9ca8b8;background:#f3f5f8}.actions{display:flex;gap:8px;margin-top:14px}.actions button{font:inherit}.button{height:34px;padding:0 11px;border:0;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600}.primary{flex:1;color:#fff;background:#2d68e8}.primary:hover{background:#1e59d9}.secondary{color:#315ec0;background:#edf3ff}.secondary:hover{background:#e0ebff}.result-header{margin-top:10px}.result-header .label{margin:0 0 6px}.copy{padding:2px 5px;border:0;cursor:pointer;color:#2e67df;background:transparent;font-size:12px}.copy:hover{text-decoration:underline}.note{min-height:17px;margin:8px 0 0;color:#68778d;font-size:11px}.note.success{color:#16824d}.note.error{color:#c03d42}@media(max-width:480px){.panel{width:calc(100vw - 24px)}}
    </style>
    <style>
      .upload-row{display:flex;gap:8px;align-items:center}.upload-row input{width:310px;height:32px;padding:4px 6px;font-size:12px}.upload-row button{height:32px;flex:0 0 auto}.spu-query{display:grid;gap:8px;margin-top:11px}.spu-query .calc-field input{margin-top:0}.spu-query .button{height:34px}.spu-result{margin-top:13px;padding:10px;border:1px solid #c9d8ef;border-radius:10px;background:#fbfcff}.link-list{display:grid;gap:6px;margin-top:2px}.link-list a{display:block;min-width:0;padding:7px 8px;border:1px solid #d8e3f3;border-radius:8px;background:#f5f8ff;color:#245bd1;font-size:11px;text-decoration:none;word-break:break-all}.link-list a:hover{background:#edf3ff;text-decoration:underline}.spu-title-row{display:flex;align-items:center;gap:8px;font-size:13px}.result-label{color:#536176;font-weight:600}.spu-link{color:#2d68e8;font-weight:600;text-decoration:none;word-break:break-all}.spu-link:hover{text-decoration:underline}.spu-info{margin:10px 0;color:#536176;font-size:12px}.spu-info strong{display:block;margin-top:2px;color:#1d2638;font-size:13px}.spu-row{display:flex;flex-wrap:nowrap;align-items:center;gap:6px;overflow:hidden;padding:7px 9px;border:1px solid #d8e3f3;border-radius:8px;background:#f5f8ff;margin-top:8px;font-size:11px;line-height:1.35;color:#1d2638;white-space:nowrap}.spu-row .row-title{flex:0 1 auto;min-width:0;color:#5c6b82;font-variant-numeric:tabular-nums}.spu-row .metric{display:inline-flex;flex:0 0 auto;align-items:center;gap:3px;color:#1d2638;font-variant-numeric:tabular-nums}.spu-row .metric i{font-style:normal;color:#68778d}.spu-row+.spu-row{margin-top:7px}
    </style>
    <style>
      .tool-switcher{display:flex;gap:6px;margin:0 0 12px;padding:4px;border-radius:9px;background:#f1f4f9}.tool-tab{flex:1;height:30px;padding:0 6px;border:0;border-radius:6px;cursor:pointer;color:#607087;background:transparent;font:600 12px -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}.tool-tab.active{color:#245bd1;background:#fff;box-shadow:0 1px 3px rgba(34,47,80,.12)}.calc-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.calc-field{display:block;color:#536176;font-size:12px;font-weight:600}.calc-field input{height:34px;margin-top:5px;padding:7px 8px;font-size:13px}.calc-button{width:100%;margin-top:14px}.profit-list{display:grid;gap:8px;margin-top:13px}.profit-card{padding:10px;border-radius:9px;background:#f5f8ff}.profit-card span{display:block;color:#5c6b82;font-size:12px}.profit-card strong{display:block;margin-top:3px;color:#245bd1;font-size:21px;line-height:1.2}.calc-formula{margin:9px 0 0;color:#748196;font-size:11px;line-height:1.5}.calc-note{min-height:17px;margin:7px 0 0;color:#c03d42;font-size:11px}.tool-body{max-height:calc(100vh - 180px);overflow-y:auto;overflow-x:hidden;padding-right:2px;scrollbar-width:thin;scrollbar-color:#c6d2e4 transparent}.tool-body::-webkit-scrollbar{width:7px}.tool-body::-webkit-scrollbar-thumb{background:#c6d2e4;border-radius:999px}.tool-body::-webkit-scrollbar-thumb:hover{background:#aebdd4}.tool-body::-webkit-scrollbar-track{background:transparent}
    </style>
    <style>
      .spu-divider{height:0;margin:12px 0;border:0;border-top:1px solid #e2e8f0}
      .floating-setting{display:inline-flex;align-items:center;gap:6px;color:#536176;font-size:12px;cursor:pointer}.floating-setting.hidden{display:none}.floating-setting input{width:15px;height:15px;margin:0;accent-color:#2d68e8}:host([data-mode="popup"]) .panel{position:static;width:460px;max-width:100%;border:0;border-radius:0;box-shadow:none}:host([data-mode="popup"]) .launcher,:host([data-mode="popup"]) .close{display:none}:host([data-mode="popup"]) .tool-body{max-height:450px}
      .custom-wrap #customSeparator{flex:1;min-width:30px;width:0}.group-options{display:flex;flex:0 0 auto;align-items:center;gap:4px;white-space:nowrap;color:#536176;font-size:12px}.group-options label{display:inline-flex;align-items:center;gap:4px;cursor:pointer}.group-options #groupEnabled{width:14px;height:14px;margin:0;accent-color:#2d68e8}.group-options #groupSize{width:50px;height:30px;padding:4px;font-size:12px}.group-options #groupSize:disabled{color:#9ca8b8;background:#f3f5f8}.grouped-results{display:flex;gap:10px;max-width:100%;overflow-x:auto;padding:2px 0 10px;scrollbar-width:thin;scrollbar-color:#b8c8e0 #f1f4f9}.grouped-results.hidden{display:none}.grouped-results::-webkit-scrollbar{height:8px}.grouped-results::-webkit-scrollbar-thumb{background:#b8c8e0;border-radius:8px}.grouped-results::-webkit-scrollbar-track{background:#f1f4f9}.result-group{flex:0 0 220px;min-width:0;padding:9px;border:1px solid #d4ddea;border-radius:8px;background:#f7f9fc}.group-header{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:6px;color:#536176;font-size:12px}.group-copy{display:grid;place-items:center;width:26px;height:26px;padding:4px;border:0;border-radius:5px;background:transparent;color:#2d68e8;cursor:pointer}.group-copy:hover{background:#e0ebff}.group-copy:focus-visible{outline:2px solid #3f75ee;outline-offset:1px}.group-copy svg{width:16px;height:16px}.group-output{display:block;height:180px;min-height:100px;resize:vertical;font-size:12px;line-height:1.5}
    </style>
    <section class="panel hidden" aria-label="常用小工具">
      <div class="header"><h1>常用小工具</h1><label class="floating-setting hidden"><input id="floatingEnabled" type="checkbox" checked>显示悬浮窗</label><button class="close" type="button" aria-label="收起">×</button></div>
      <p id="floatingSettingError" class="note error hidden" role="status"></p>
    <div class="tool-switcher" role="tablist" aria-label="工具选择"><button class="tool-tab active" type="button" data-tool="converter" role="tab" aria-selected="true">SKUID 转换</button><button class="tool-tab" type="button" data-tool="profit" role="tab" aria-selected="false">拍二发三计算</button><button class="tool-tab" type="button" data-tool="spu" role="tab" aria-selected="false">SPU信息匹配</button></div>
      <div id="converterTool" class="tool-body">
      <label class="label" for="source">输入 SKUID（支持空格、换行、逗号、分号混合）</label>
      <textarea id="source" placeholder="例如：10031208685973 10031208358356；10033347973969"></textarea>
      <span class="label">输出分隔方式</span>
      <div class="choice-row">
        <label class="choice"><input type="radio" name="separator" value="comma" checked><span>英文逗号</span></label>
        <label class="choice"><input type="radio" name="separator" value="space"><span>空格</span></label>
        <label class="choice"><input type="radio" name="separator" value="newline"><span>换行</span></label>
        <label class="choice"><input type="radio" name="separator" value="link"><span>链接</span></label>
        <label class="choice"><input type="radio" name="separator" value="custom"><span>自定义</span></label>
      </div>
      <div class="custom-wrap"><label for="customSeparator">自定义分隔符</label><input id="customSeparator" type="text" maxlength="20" placeholder="例如： | " disabled><div class="group-options"><label for="groupEnabled"><input id="groupEnabled" type="checkbox" aria-label="启用分组">每</label><input id="groupSize" type="number" min="1" step="1" value="50" inputmode="numeric" aria-label="每组 SKUID 数量" disabled><label for="groupSize">个分组</label></div></div>
      <div class="actions"><button id="readClipboard" class="button secondary" type="button">读取剪贴板</button><button id="convert" class="button primary" type="button">转换并复制</button></div>
      <div class="result-header"><label class="label" for="result">转换结果</label><button id="copyResult" class="copy" type="button">复制结果</button></div>
      <textarea id="result" readonly placeholder="转换结果会显示在这里"></textarea>
      <div id="groupedResult" class="grouped-results hidden" role="region" aria-label="分组转换结果" tabindex="0"></div>
      <p id="note" class="note" role="status"></p>
      </div>
      <div id="profitTool" class="tool-body hidden">
        <div class="calc-grid">
          <label class="calc-field" for="purchasePrice">采购价<input id="purchasePrice" type="number" min="0" step="0.01" inputmode="decimal" placeholder="请输入采购价"></label>
          <label class="calc-field" for="logisticsCost">物流成本<input id="logisticsCost" type="number" min="0" step="0.01" inputmode="decimal" value="1.8"></label>
          <label class="calc-field" for="cpsRate">CPS 佣金服务费 (%)<input id="cpsRate" type="number" min="0" max="100" step="0.01" inputmode="decimal" placeholder="例如：10"></label>
          <label class="calc-field" for="salePrice">售价<input id="salePrice" type="number" min="0" step="0.01" inputmode="decimal" placeholder="请输入售价"></label>
          <label class="calc-field" for="mergeRate">预估合单率 (%)<input id="mergeRate" type="number" min="0" max="100" step="0.01" inputmode="decimal" value="60" placeholder="例如：60"></label>
        </div>
        <button id="calculateProfit" class="button primary calc-button" type="button">计算单均利润</button>
        <div class="profit-list">
          <div class="profit-card"><span>不合单单均利润（拍一单）</span><strong id="singleOrderProfit">--</strong></div>
          <div class="profit-card"><span>合单后预估单均利润</span><strong id="mergedProfit">--</strong></div>
        </div>

        <p id="calcNote" class="calc-note" role="status"></p>
      </div>
      <div id="spuTool" class="tool-body hidden">
        <label class="label" for="baseTableInput">上传商品底表（.xlsx）</label>
        <div class="upload-row"><input id="baseTableInput" type="file" accept=".xlsx"><button id="clearBaseTable" class="button secondary" type="button">删除</button></div>
        <p id="baseTableStatus" class="note" role="status">未上传底表</p>
        <div class="spu-query">
          <label class="calc-field" for="spuQueryInput">输入 SPU_ID / SKU_ID<input id="spuQueryInput" type="text" inputmode="numeric" placeholder="例如：10034123659846"></label>
          <button id="spuQueryButton" class="button primary" type="button">查询信息</button>
        </div>
        <div class="spu-query batch-links">
          <label class="calc-field" for="spuBatchInput">根据一系列 SPU_ID 获取 SKU 链接<input id="spuBatchInput" type="text" inputmode="numeric" placeholder="例如：10034123659846,10034123788651"></label>
          <button id="spuBatchButton" class="button secondary" type="button">生成 SKU 链接</button>
        </div>
        <div id="spuBatchResult" class="spu-result hidden">
          <div class="result-header"><span class="label">SKU 链接（每个 SPU 取 1 个）</span><button id="copySpuLinks" class="copy" type="button">复制</button></div>
          <div id="spuBatchLinks" class="link-list"></div>
        </div>
        <div id="spuResult" class="spu-result hidden">
          <div class="spu-title-row"><span class="result-label">SPU_ID</span><a id="spuLink" class="spu-link" target="_blank" rel="noopener noreferrer"></a></div>
          <div class="spu-info"><span>供应商</span><strong id="spuSupplier">--</strong></div>
          <div id="spuRows"></div>
          <button id="copySkuIds" class="button secondary" type="button">一键复制所有SKUID</button>
        </div>
        <p id="spuNote" class="note" role="status"></p>
      </div>
    </section>
    <button class="launcher" type="button" aria-label="打开常用小工具" title="常用小工具（可拖动，悬停旋转）"><img class="banana-icon" src="${chrome.runtime.getURL("icons/banana.png")}" alt="" aria-hidden="true" draggable="false"></button>
  `;

  const elements = {
    panel: shadow.querySelector(".panel"), launcher: shadow.querySelector(".launcher"), close: shadow.querySelector(".close"),
    floatingSetting: shadow.querySelector(".floating-setting"), floatingEnabled: shadow.querySelector("#floatingEnabled"), floatingSettingError: shadow.querySelector("#floatingSettingError"),
    source: shadow.querySelector("#source"), result: shadow.querySelector("#result"), customSeparator: shadow.querySelector("#customSeparator"),
    groupEnabled: shadow.querySelector("#groupEnabled"), groupSize: shadow.querySelector("#groupSize"), groupedResult: shadow.querySelector("#groupedResult"),
    readClipboard: shadow.querySelector("#readClipboard"), convert: shadow.querySelector("#convert"), copyResult: shadow.querySelector("#copyResult"),
    note: shadow.querySelector("#note"), separators: [...shadow.querySelectorAll('input[name="separator"]')],
    toolButtons: [...shadow.querySelectorAll(".tool-tab")], converterTool: shadow.querySelector("#converterTool"), profitTool: shadow.querySelector("#profitTool"),
    spuTool: shadow.querySelector("#spuTool"),
    purchasePrice: shadow.querySelector("#purchasePrice"), logisticsCost: shadow.querySelector("#logisticsCost"), cpsRate: shadow.querySelector("#cpsRate"), salePrice: shadow.querySelector("#salePrice"), mergeRate: shadow.querySelector("#mergeRate"),
    calculateProfit: shadow.querySelector("#calculateProfit"), singleOrderProfit: shadow.querySelector("#singleOrderProfit"), mergedProfit: shadow.querySelector("#mergedProfit"), calcNote: shadow.querySelector("#calcNote"),
    baseTableInput: shadow.querySelector("#baseTableInput"), clearBaseTable: shadow.querySelector("#clearBaseTable"), baseTableStatus: shadow.querySelector("#baseTableStatus"),
    spuQueryInput: shadow.querySelector("#spuQueryInput"), spuQueryButton: shadow.querySelector("#spuQueryButton"), spuResult: shadow.querySelector("#spuResult"),
    spuBatchInput: shadow.querySelector("#spuBatchInput"), spuBatchButton: shadow.querySelector("#spuBatchButton"), spuBatchResult: shadow.querySelector("#spuBatchResult"), spuBatchLinks: shadow.querySelector("#spuBatchLinks"), copySpuLinks: shadow.querySelector("#copySpuLinks"),
    spuLink: shadow.querySelector("#spuLink"), spuSupplier: shadow.querySelector("#spuSupplier"), spuRows: shadow.querySelector("#spuRows"), copySkuIds: shadow.querySelector("#copySkuIds"), spuNote: shadow.querySelector("#spuNote")
  };

  const selectedSeparator = () => elements.separators.find((input) => input.checked).value;
  const delimiter = () => selectedSeparator() === "custom" ? elements.customSeparator.value : separatorMap[selectedSeparator()];
  const notify = (message, type = "") => {
    elements.note.textContent = message;
    elements.note.className = `note ${type}`;
  };
  const saveSettings = () => {
    chrome.storage.local.set({ [storageKey]: {
      separator: selectedSeparator(), customSeparator: elements.customSeparator.value,
      groupEnabled: elements.groupEnabled.checked, groupSize: elements.groupSize.value
    } });
  };
  const clampTop = (top) => Math.min(Math.max(top, 12), Math.max(12, window.innerHeight - 64));
  const setPosition = ({ side, top }) => {
    if (isPopup) return;
    const clampedTop = clampTop(top);
    root.dataset.side = side;
    root.dataset.panelDirection = clampedTop < window.innerHeight / 2 ? "down" : "up";
    root.style.top = `${clampedTop}px`;
    root.style.bottom = "auto";
    root.style.left = side === "left" ? "24px" : "auto";
    root.style.right = side === "right" ? "24px" : "auto";
  };
  const savePosition = () => {
    chrome.storage.local.set({ [positionStorageKey]: { side: root.dataset.side, top: root.getBoundingClientRect().top } });
  };

  const clearConversion = () => {
    elements.result.value = "";
    elements.result.classList.remove("hidden");
    elements.groupedResult.replaceChildren();
    elements.groupedResult.classList.add("hidden");
    elements.copyResult.textContent = "复制结果";
  };

  const renderGroups = (values, size, separator) => {
    const groups = [];
    for (let index = 0; index < values.length; index += size) {
      const items = values.slice(index, index + size);
      const groupNumber = groups.length + 1;
      const group = document.createElement("section");
      group.className = "result-group";
      const header = document.createElement("div");
      header.className = "group-header";
      const title = document.createElement("span");
      title.textContent = `第 ${groupNumber} 组 · ${items.length} 个`;
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "group-copy";
      copy.title = `复制第 ${groupNumber} 组`;
      copy.setAttribute("aria-label", copy.title);
      copy.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>';
      const output = document.createElement("textarea");
      output.className = "group-output";
      output.readOnly = true;
      output.setAttribute("aria-label", `第 ${groupNumber} 组转换结果`);
      output.value = items.join(separator);
      copy.addEventListener("click", () => copyText(output.value));
      header.append(title, copy);
      group.append(header, output);
      groups.push(group);
    }
    elements.groupedResult.replaceChildren(...groups);
    elements.groupedResult.scrollLeft = 0;
  };

  const convert = () => {
    clearConversion();
    const values = elements.source.value.split(/[\s,;，；、]+/).map((item) => item.trim()).filter(Boolean);
    const selected = selectedSeparator();
    if (!values.length) {
      notify("请先输入或读取 SKUID。", "error");
      return "";
    }
    if (selected === "custom" && !delimiter()) {
      notify("请输入自定义分隔符。", "error");
      return "";
    }
    const grouping = elements.groupEnabled.checked;
    const groupSize = Number(elements.groupSize.value);
    if (grouping && (!Number.isSafeInteger(groupSize) || groupSize < 1)) {
      notify("请输入有效的分组数量（大于 0 的整数）。", "error");
      return "";
    }
    const outputValues = selected === "link" ? values.map((id) => `https://item.jd.com/${id}.html`) : values;
    const output = outputValues.join(delimiter());
    elements.result.value = output;
    if (grouping) renderGroups(outputValues, groupSize, delimiter());
    elements.result.classList.toggle("hidden", grouping);
    elements.groupedResult.classList.toggle("hidden", !grouping);
    elements.copyResult.textContent = grouping ? "复制全部" : "复制结果";
    notify(`已识别 ${values.length} 个 SKUID。${grouping ? `已分为 ${Math.ceil(values.length / groupSize)} 组。` : ""}`, "success");
    return output;
  };

  const calculateProfit = () => {
    const values = [elements.purchasePrice, elements.logisticsCost, elements.cpsRate, elements.salePrice, elements.mergeRate].map((input) => Number.parseFloat(input.value));
    const [purchasePrice, logisticsCost, cpsRate, salePrice, mergeRate] = values;
    if (!values.every(Number.isFinite) || values.some((value) => value < 0) || cpsRate > 100 || mergeRate > 100) {
      elements.calcNote.textContent = "请填写有效的非负数；CPS 佣金服务费和合单率不能超过 100%。";
      elements.singleOrderProfit.textContent = "--";
      elements.mergedProfit.textContent = "--";
      return;
    }
    const cpsMultiplier = cpsRate / 100;
    const mergeRatio = mergeRate / 100;
    // 不合单：每单独立发货
    const singleOrderProfit = salePrice - salePrice * cpsMultiplier - logisticsCost - purchasePrice;
    // 合单后：以100单为基准，合单率 R% 表示 R 单拍二（合为 R/2 个物流），(100−R) 单拍一
    // 总物流包裹 = (100 − R) + R/2 = 100 − R/2
    // 总采购件数 = (100 − R) × 1 + R × 2 = 100 + R
    // 总收入 = (100 − R) × 售价 + R × 2 × 售价 = 售价 × (100 + R)
    // 总CPS = 售价 × (100 + R) × CPS%
    // 单均利润 = (总收入 − 总CPS − 总物流×物流成本 − 总采购×采购价) ÷ 100
    const totalRevenue = salePrice * (100 + mergeRate);
    const totalCps = totalRevenue * cpsMultiplier;
    const totalLogistics = (100 - mergeRate / 2) * logisticsCost;
    const totalPurchase = (100 + mergeRate) * purchasePrice;
    const mergedProfit = (totalRevenue - totalCps - totalLogistics - totalPurchase) / 100;
    elements.singleOrderProfit.textContent = `¥${singleOrderProfit.toFixed(2)}`;
    elements.mergedProfit.textContent = `¥${mergedProfit.toFixed(2)}`;
    elements.calcNote.textContent = "";
  };

  const saveCalculatorInputs = () => {
    const settings = {
      purchasePrice: elements.purchasePrice.value,
      logisticsCost: elements.logisticsCost.value,
      cpsRate: elements.cpsRate.value,
      salePrice: elements.salePrice.value,
      mergeRate: elements.mergeRate.value
    };
    chrome.storage.local.set({ [calculatorStorageKey]: settings });
  };

  const setBaseTableStatus = (message, type = "") => {
    elements.baseTableStatus.textContent = message;
    elements.baseTableStatus.className = `note ${type}`;
  };

  const resetSpuResult = () => {
    lastSkuIds = [];
    elements.spuResult.classList.add("hidden");
    elements.spuLink.textContent = "";
    elements.spuLink.removeAttribute("href");
    elements.spuSupplier.textContent = "--";
    elements.spuRows.replaceChildren();
    elements.spuNote.textContent = "";
  };

  const showBaseTable = (baseTable) => {
    if (!baseTable) {
      elements.baseTableInput.value = "";
      setBaseTableStatus("未上传底表");
      resetSpuResult();
      return;
    }
    const importedAt = new Date(baseTable.importedAt);
    const format = (value) => String(value).padStart(2, "0");
    const timeText = `${importedAt.getFullYear()}-${format(importedAt.getMonth() + 1)}-${format(importedAt.getDate())} ${format(importedAt.getHours())}:${format(importedAt.getMinutes())}`;
    const missing = baseTable.missingFields?.length ? `；缺少列：${baseTable.missingFields.join("、")}` : "";
    setBaseTableStatus(`已保存：${baseTable.fileName}（${baseTable.skuCount} 个 SKU / ${baseTable.spuCount} 个 SPU，${timeText}）${missing}`, "success");
  };

  const formatValue = (value, suffix = "") => value === "" || value === null || value === undefined ? "--" : `${value}${suffix}`;
  const normalizeId = (value) => {
    const text = String(value ?? "").trim();
    return /^\d+(\.0+)?$/.test(text) ? text.replace(/\.0+$/, "") : text;
  };

  const showSpuResult = (baseTable, sku, queriedSkuId = null) => {
    const spu = baseTable.spuIndex[sku.spuId];
    const skuIds = queriedSkuId === null
      ? [...spu.skuIds]
      : [queriedSkuId, ...spu.skuIds.filter((skuId) => skuId !== queriedSkuId)];
    lastSkuIds = [...skuIds];
    elements.spuResult.classList.remove("hidden");
    elements.spuLink.href = `https://item.jd.com/${spu.skuIds[0]}.html`;
    elements.spuLink.textContent = sku.spuId;
    elements.spuSupplier.textContent = spu.supplier || "--";
    elements.spuRows.replaceChildren(...skuIds.map((skuId) => {
      const item = baseTable.skus[baseTable.skuIndex[skuId]];
      const row = document.createElement("div");
      row.className = "spu-row";
      const title = document.createElement("span");
      title.className = "row-title";
      title.textContent = `SKU_ID：${skuId}`;
      row.appendChild(title);
      const metrics = [
        ["采购", formatValue(item.purchasePrice)],
        ["物流", formatValue(item.logisticsCost)],
        ["好评率", formatValue(String(item.goodRate ?? "").replace(/%+$/, ""), "%")]
      ].map(([label, value]) => {
        const metric = document.createElement("span");
        metric.className = "metric";
        const metricLabel = document.createElement("i");
        metricLabel.textContent = label;
        metric.append(metricLabel, value);
        return metric;
      });
      row.append(...metrics);
      return row;
    }));
    if (queriedSkuId !== null && skuIds.length > 1) {
      const divider = document.createElement("hr");
      divider.className = "spu-divider";
      elements.spuRows.firstElementChild.after(divider);
    }
    requestAnimationFrame(() => {
      elements.spuRows.querySelectorAll(".spu-row").forEach((row) => {
        let fontSize = 11;
        row.style.fontSize = "";
        while (fontSize > 7 && row.scrollWidth > row.clientWidth) {
          fontSize -= 0.5;
          row.style.fontSize = `${fontSize}px`;
        }
      });
    });
    elements.spuNote.textContent = "";
  };

  const querySpu = () => {
    elements.spuBatchResult.classList.add("hidden");
    elements.spuBatchLinks.replaceChildren();
    const baseTable = baseTableData;
    if (!baseTable) {
      resetSpuResult();
      elements.spuNote.textContent = "请先上传并保存底表。";
      return;
    }
    const queryId = normalizeId(elements.spuQueryInput.value);
    if (!queryId) {
      resetSpuResult();
      elements.spuNote.textContent = "请输入 SPU_ID 或 SKU_ID。";
      return;
    }
    if (baseTable.skuIndex[queryId] !== undefined) {
      showSpuResult(baseTable, baseTable.skus[baseTable.skuIndex[queryId]], queryId);
      return;
    }
    if (baseTable.spuIndex[queryId]?.skuIds.length) {
      showSpuResult(baseTable, baseTable.skus[baseTable.skuIndex[baseTable.spuIndex[queryId].skuIds[0]]]);
      return;
    }
    resetSpuResult();
    elements.spuNote.textContent = "未在当前底表中匹配到该 ID。";
  };

  const generateSpuLinks = () => {
    resetSpuResult();
    elements.spuBatchResult.classList.add("hidden");
    elements.spuBatchLinks.replaceChildren();
    if (!baseTableData) {
      elements.spuNote.textContent = "请先上传并保存底表。";
      return;
    }
    const values = elements.spuBatchInput.value.split(/[\s,;，；、]+/).map(normalizeId).filter(Boolean);
    if (!values.length) {
      elements.spuNote.textContent = "请输入至少一个 SPU_ID。";
      return;
    }
    const links = [];
    const missingIds = [];
    values.forEach((spuId) => {
      const skuId = baseTableData.spuIndex[spuId]?.skuIds[0];
      if (skuId) {
        links.push(`https://item.jd.com/${skuId}.html`);
      } else {
        missingIds.push(spuId);
      }
    });
    elements.spuBatchLinks.replaceChildren(...links.map((link) => {
      const anchor = document.createElement("a");
      anchor.href = link;
      anchor.textContent = link;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      return anchor;
    }));
    elements.spuBatchResult.classList.toggle("hidden", !links.length);
    elements.spuNote.textContent = missingIds.length ? `以下 SPU_ID 未匹配：${missingIds.join("、")}` : "";
  };

  const importBaseTable = async (file) => {
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) {
      setBaseTableStatus("请上传 .xlsx 格式底表。", "error");
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      const dataset = await window.SkuidXlsx.parseWorkbook(buffer, { fileName: file.name, importedAt: Date.now() });
      await chrome.storage.local.remove(baseTableStorageKey);
      await chrome.storage.local.set({ [baseTableStorageKey]: dataset });
      baseTableData = dataset;
      elements.baseTableInput.value = "";
      showBaseTable(dataset);
      resetSpuResult();
    } catch (error) {
      console.error("[SKUID 分隔转换器] 底表解析失败：", error);
      setBaseTableStatus(error.message || "底表解析失败，请检查文件格式。", "error");
    }
  };

  const clearBaseTable = async () => {
    await chrome.storage.local.remove(baseTableStorageKey);
    baseTableData = null;
    showBaseTable(null);
  };

  const switchTool = (tool) => {
    elements.converterTool.classList.toggle("hidden", tool !== "converter");
    elements.profitTool.classList.toggle("hidden", tool !== "profit");
    elements.spuTool.classList.toggle("hidden", tool !== "spu");
    elements.toolButtons.forEach((button) => {
      const isActive = button.dataset.tool === tool;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    });
  };

  const copySkuIds = () => copyText(lastSkuIds.filter(Boolean).join("\n"), {
    emptyMessage: "没有可复制的 SKU_ID。",
    failureMessage: "SKU_ID 复制失败，请重试。"
  });

  const copyText = async (text, options = {}) => {
    const emptyMessage = options.emptyMessage || "没有可复制的转换结果。";
    const failureMessage = options.failureMessage || "复制失败，请手动复制结果。";
    if (!text) {
      notify(emptyMessage, "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      notify("已复制到剪贴板。", "success");
    } catch {
      const fallbackInput = document.createElement("textarea");
      fallbackInput.value = text;
      fallbackInput.setAttribute("readonly", "");
      fallbackInput.style.position = "fixed";
      fallbackInput.style.left = "-9999px";
      document.body.appendChild(fallbackInput);
      fallbackInput.select();
      const copied = document.execCommand("copy");
      fallbackInput.remove();
      notify(copied ? "已复制到剪贴板。" : failureMessage, copied ? "success" : "error");
    }
  };

  const updateCustomInput = () => {
    elements.customSeparator.disabled = selectedSeparator() !== "custom";
    saveSettings();
  };

  let dragState;
  let suppressClick = false;
  let baseTableData;
  let lastSkuIds = [];
  elements.launcher.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const bounds = root.getBoundingClientRect();
    dragState = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startTop: bounds.top, moved: false };
    elements.launcher.setPointerCapture(event.pointerId);
  });
  elements.launcher.addEventListener("pointermove", (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const movedX = event.clientX - dragState.startX;
    const movedY = event.clientY - dragState.startY;
    if (!dragState.moved && Math.hypot(movedX, movedY) < 5) return;
    dragState.moved = true;
    elements.launcher.classList.add("dragging");
    setPosition({ side: event.clientX < window.innerWidth / 2 ? "left" : "right", top: dragState.startTop + movedY });
  });
  const finishDrag = (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    if (dragState.moved) {
      suppressClick = event.type === "pointerup";
      savePosition();
    }
    elements.launcher.classList.remove("dragging");
    dragState = undefined;
  };
  elements.launcher.addEventListener("pointerup", finishDrag);
  elements.launcher.addEventListener("pointercancel", finishDrag);
  elements.launcher.addEventListener("click", () => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    elements.panel.classList.remove("hidden");
    (elements.spuTool.classList.contains("hidden") ? (elements.converterTool.classList.contains("hidden") ? elements.purchasePrice : elements.source) : elements.spuQueryInput).focus();
  });
  elements.close.addEventListener("click", () => elements.panel.classList.add("hidden"));
  elements.toolButtons.forEach((button) => button.addEventListener("click", () => switchTool(button.dataset.tool)));
  const refreshConversion = () => {
    if (elements.source.value.trim() || elements.result.value) convert();
  };
  elements.separators.forEach((input) => input.addEventListener("change", () => {
    updateCustomInput();
    refreshConversion();
  }));
  elements.customSeparator.addEventListener("input", () => {
    saveSettings();
    refreshConversion();
  });
  elements.groupEnabled.addEventListener("change", () => {
    elements.groupSize.disabled = !elements.groupEnabled.checked;
    saveSettings();
    refreshConversion();
  });
  elements.groupSize.addEventListener("input", () => {
    saveSettings();
    refreshConversion();
  });
  elements.readClipboard.addEventListener("click", async () => {
    try {
      elements.source.value = await navigator.clipboard.readText();
      convert();
    } catch {
      notify("无法读取剪贴板，请将内容粘贴到输入框。", "error");
    }
  });
  elements.convert.addEventListener("click", async () => {
    const output = convert();
    if (output) await copyText(output);
  });
  elements.copyResult.addEventListener("click", () => copyText(elements.result.value));
  elements.calculateProfit.addEventListener("click", calculateProfit);
  [elements.purchasePrice, elements.logisticsCost, elements.cpsRate, elements.salePrice, elements.mergeRate].forEach((input) => {
    input.addEventListener("input", saveCalculatorInputs);
    input.addEventListener("change", saveCalculatorInputs);
  });
  elements.baseTableInput.addEventListener("change", async (event) => importBaseTable(event.target.files?.[0]));
  elements.clearBaseTable.addEventListener("click", clearBaseTable);
  elements.spuQueryButton.addEventListener("click", querySpu);
  elements.spuBatchButton.addEventListener("click", generateSpuLinks);
  elements.copySpuLinks.addEventListener("click", () => copyText([...elements.spuBatchLinks.children].map((link) => link.href).join("\n"), {
    emptyMessage: "没有可复制的 SKU 链接。",
    failureMessage: "SKU 链接复制失败，请重试。"
  }));
  elements.copySkuIds.addEventListener("click", copySkuIds);
  elements.spuQueryInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") querySpu();
  });

  window.addEventListener("resize", () => {
    setPosition({ side: root.dataset.side, top: root.getBoundingClientRect().top });
  });

  let floatingEnabled = true;
  const applyFloatingVisibility = (value) => {
    floatingEnabled = value !== false;
    elements.floatingEnabled.checked = floatingEnabled;
    if (!isPopup) {
      root.style.display = floatingEnabled ? "block" : "none";
      if (!floatingEnabled) elements.panel.classList.add("hidden");
    }
  };
  if (isPopup) {
    elements.panel.classList.remove("hidden");
    elements.floatingSetting.classList.remove("hidden");
  }
  elements.floatingEnabled.addEventListener("change", async () => {
    const enabled = elements.floatingEnabled.checked;
    elements.floatingEnabled.disabled = true;
    elements.floatingSettingError.classList.add("hidden");
    try {
      await chrome.storage.local.set({ [floatingVisibilityKey]: enabled });
      applyFloatingVisibility(enabled);
    } catch {
      elements.floatingEnabled.checked = floatingEnabled;
      elements.floatingSettingError.textContent = "悬浮窗设置保存失败，请重试。";
      elements.floatingSettingError.classList.remove("hidden");
    } finally {
      elements.floatingEnabled.disabled = false;
    }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[floatingVisibilityKey]) applyFloatingVisibility(changes[floatingVisibilityKey].newValue);
    if (changes[baseTableStorageKey]) {
      baseTableData = changes[baseTableStorageKey].newValue || null;
      showBaseTable(baseTableData);
      resetSpuResult();
      elements.spuBatchResult.classList.add("hidden");
      elements.spuBatchLinks.replaceChildren();
    }
  });
  chrome.storage.local.get([storageKey, calculatorStorageKey, positionStorageKey, baseTableStorageKey, floatingVisibilityKey], (stored) => {
    applyFloatingVisibility(stored[floatingVisibilityKey]);
    const settings = stored[storageKey];
    if (settings) {
      const input = elements.separators.find((option) => option.value === settings.separator);
      if (input) input.checked = true;
      elements.customSeparator.value = settings.customSeparator || "";
      elements.groupEnabled.checked = settings.groupEnabled === true;
      elements.groupSize.value = settings.groupSize ?? "50";
      elements.groupSize.disabled = !elements.groupEnabled.checked;
      updateCustomInput();
    }
    const position = stored[positionStorageKey];
    if (position && (position.side === "left" || position.side === "right") && Number.isFinite(position.top)) {
      setPosition(position);
    }
    const calculatorSettings = stored[calculatorStorageKey];
    if (calculatorSettings) {
      elements.purchasePrice.value = calculatorSettings.purchasePrice ?? "";
      elements.logisticsCost.value = calculatorSettings.logisticsCost ?? "";
      elements.cpsRate.value = calculatorSettings.cpsRate ?? "";
      elements.salePrice.value = calculatorSettings.salePrice ?? "";
      elements.mergeRate.value = calculatorSettings.mergeRate ?? "";
    }
    if (stored[baseTableStorageKey]) {
      baseTableData = stored[baseTableStorageKey];
      showBaseTable(baseTableData);
    }
  });
})();

