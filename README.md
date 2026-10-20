# gpt-tools

## SKUID 运营工具箱 1.1.6

第三个功能“SPU信息匹配”支持将实际输入的 SKU 置顶，并以浅色分割线与其余 SKU 隔开。输入 SPU 时仍展示全部 SKU，无分割线。

下载 `dist/skuid-separator-extension-v1.1.6.zip` 并解压，在 Chrome 的 `chrome://extensions/` 中启用开发者模式，点击“加载已解压的扩展程序”，选择包含 `manifest.json` 的目录。

源文件位于 `skuid-separator-extension/`，插件运行时无需 Node.js 或 npm。

[阅读详细使用说明](skuid-separator-extension/README.md)：包含安装步骤、三个工具的使用示例、利润计算口径、底表格式与查询规则、更新方法和常见问题。

## 开发验证

```bash
npm ci
npx playwright install chromium
npm test
```

如使用系统 Chromium，可通过 `CHROMIUM_PATH=/usr/bin/chromium npm test` 指定路径。测试在浏览器中模拟扩展存储及剪贴板，检查实际查询界面的排序、分割线、复制结果及查询切换。
