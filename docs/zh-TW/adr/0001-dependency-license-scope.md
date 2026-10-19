# 0001. 相依套件授權範圍

[English](../../adr/0001-dependency-license-scope.md) | 繁體中文

> 本文件為英文版之翻譯；如有歧異，以英文版為準。

| | |
|---|---|
| 狀態 | 已接受 |
| 日期 | 2026-10-19 |

## 背景

TripReplay 以 MIT 授權釋出。[相依套件授權政策](../license-policy.md) 0.2 版要求所有元件（含遞移相依、建置工具、地圖資料及字型）皆須為 MIT 授權。[授權可行性評估](../license-assessment.md)發現，任何需要顯示真實地圖、渲染繁體中文或提供安裝版的產品皆無法符合此規定：未找到 MIT 授權的地圖資料或 CJK 字型、TypeScript 為 Apache-2.0、Tauri 的視窗層為 Apache-2.0，且所有受調查的地圖渲染器皆相依於 ISC、BSD 或 Apache-2.0 程式碼。

## 決策

採行評估中的選項 C：

- TripReplay 本身的原始碼維持 MIT 授權。
- 發行成品可包含以 MIT、ISC、BSD-2-Clause、BSD-3-Clause、0BSD、Zlib、Apache-2.0 及 Unicode-3.0 授權的第三方程式碼；資產另可採用 OFL-1.1 及 CC0-1.0。
- 發行成品中禁止 Copyleft 授權。
- 不隨附散布的開發工具，以及未隨附的平台元件，皆豁免。
- 地圖資料一律不隨附，於執行期依選定供應商的條款下載。

本決策以政策條文為準。

## 曾考慮的方案

- **選項 A — 所有項目皆嚴格限 MIT。** 不採用：就既定產品而言不可行。
- **選項 B — 隨附程式碼限 MIT，工具與平台豁免。** 不採用：須大量重新實作小型函式庫並自行開發原生外殼，相較於選項 C 成本過高、效益不成比例。

## 影響

- MapLibre GL JS、deck.gl、React、Tauri 等主流函式庫可准入，但仍須逐版本審查。
- 共用程式碼可採用 TypeScript 作為主要語言。
- 發行成品須附上自動產生的 `THIRD-PARTY-NOTICES` 檔案，包含 Apache-2.0 `NOTICE` 內容。
- 下游使用者可重用 TripReplay，而不受 Copyleft 義務約束。
- 公共領域程式碼（特別是 SQLite）與 CDLA-Permissive-2.0 資料，仍待日後修訂政策時決議。
