# 0003. 主要程式語言與工具鏈

[English](../../adr/0003-language-and-toolchain.md) | 繁體中文

> 本文件為英文版之翻譯；如有歧異，以英文版為準。

| | |
|---|---|
| 狀態 | 已接受 |
| 日期 | 2026-10-19 |

## 背景

[產品規格 §5](../specification.md#5-系統架構) 提議在 Web 與五種安裝版平台之間，共用領域模型、時間軸、渲染器與 UI 的程式碼。[ADR 0001](0001-dependency-license-scope.md) 允許使用 Apache-2.0 授權的開發工具。里程碑 M0.2 要求在加入任何產品程式碼或相依套件之前，先確定程式語言與工具鏈。

## 決策

| 領域 | 選擇 | 版本 | 授權 |
|---|---|---|---|
| 共用程式碼 | TypeScript，嚴格模式，ES 模組 | 7.0.2 | Apache-2.0（開發工具） |
| 工具執行環境 | Node.js LTS | 24 | MIT（開發工具） |
| 套件管理 | pnpm workspaces | 12.14.0 | MIT（開發工具） |
| Lint 與格式化 | Biome | 2.5.15 | MIT OR Apache-2.0（開發工具） |
| 單元測試 | 工具程式使用 Node.js 內建測試執行器；產品套件建立後使用 Vitest | — | MIT（開發工具） |
| 安裝版平台外殼 | Rust，依技術驗證 S4 選定的外殼 | — | 於架構決策關卡確定 |
| 行動原生外掛 | Kotlin（Android）、Swift（iOS 與 macOS） | — | 於架構決策關卡確定 |

慣例：

- **版本庫結構。** 採單一 monorepo：`packages/*` 放置產品規格所列的共用模組，`apps/*` 放置 Web 版與各平台外殼，`tools/*` 放置版本庫工具。
- **精確版本。** 相依套件一律以精確版本儲存（`saveExact`），並提交 lockfile。
- **型別安全。** 啟用 `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes` 及 `erasableSyntaxOnly`，使工具程式可不經建置步驟直接於 Node.js 執行。
- **自足的工具程式。** 授權檢查僅使用 Node.js 標準函式庫，使檢查機制不相依於其所檢查的套件。
- **供應鏈安全。** GitHub Actions 一律固定至完整的 commit SHA，並以唯讀權限執行。
- **Rust 相依。** 加入第一個 Rust crate 時，將以 `cargo-deny` 套用相同的白名單。

UI 框架維持產品規格的提議（React），並於技術驗證 S4 後的架構決策關卡確認。

## 曾考慮的方案

- **C# 搭配 .NET（Avalonia 或 .NET MAUI）。** 具備完善的 MIT 授權生態系，維護者亦熟悉。共用核心不採用：Web 版須隨附 WebAssembly 執行環境，且本產品所依賴的瀏覽器原生 API（WebCodecs、OPFS、WebGL／WebGPU 地圖渲染）僅在 JavaScript 中能獲得完整支援。
- **ESLint 與 Prettier。** 成熟，但需兩套工具及較大的外掛相依樹。Biome 以單一執行檔涵蓋兩者。
- **npm 或 Yarn。** pnpm 嚴格的相依隔離與內建的授權列表功能，較適合授權檢查。

## 影響

- 貢獻者需要 Node.js 24 與 pnpm 12；由於啟用 `engineStrict`，較舊的 Node.js 版本將無法安裝。
- TypeScript 7 為原生編譯器；依賴 TypeScript 5 及更早版本 JavaScript 編譯器 API 的外掛無法使用。
- 第二個測試執行器（Vitest）將隨第一個產品套件引入，並於同一個 Pull Request 中加入授權相依清單。
