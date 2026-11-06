# gpt-tools

## SKUID 运营工具箱 1.1.13

支持跨页连续使用：浮窗的打开状态、位置、当前工具，以及四个工具的输入和输出会在同一浏览器的网页间同步；刷新、新开页面和重新打开工具栏面板也可恢复。

点击浏览器右上角扩展图标即可使用全部工具；弹出面板右上角的“显示悬浮窗”开关可统一隐藏或恢复网页中的香蕉按钮，设置自动保存。

好评率计算支持“新增好评”和“删除非好评”两种方案：当前评价数、好评数、当前好评率任填两项，再填写目标好评率，即可反推所需最少数量。四个入口以 2×2 排列：第一行 SKUID 转换 / SPU信息匹配，第二行拍二发三计算 / 好评率计算。

SKUID 转换支持可选的“每 N 个分组”：结果横向分列，每列可独立复制，列多时显示横向滚动条。

悬浮按钮使用无签名、透明背景的黄色香蕉，鼠标悬停时旋转，支持拖动。

“SPU信息匹配”支持将实际输入的 SKU 置顶，并以浅色分割线与其余 SKU 隔开。输入 SPU 时仍展示全部 SKU，无分割线。

下载 `dist/skuid-separator-extension-v1.1.13.zip` 并解压，在 Chrome 的 `chrome://extensions/` 中启用开发者模式，点击“加载已解压的扩展程序”，选择包含 `manifest.json` 的目录。

源文件位于 `skuid-separator-extension/`，插件运行时无需 Node.js 或 npm。

[阅读详细使用说明](skuid-separator-extension/README.md)：包含安装步骤、四个工具的使用示例、利润计算口径、底表格式与查询规则、更新方法和常见问题。

## 开发验证

```bash
npm ci
npx playwright install chromium
npm test
```

如使用系统 Chromium，可通过 `CHROMIUM_PATH=/usr/bin/chromium npm test` 指定路径。测试在浏览器中模拟扩展存储及剪贴板，检查实际查询界面的排序、分割线、复制结果及查询切换。
