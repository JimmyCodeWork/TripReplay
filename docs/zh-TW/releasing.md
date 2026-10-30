# 發行流程

[English](../releasing.md) | 繁體中文

> 本文件為英文版之翻譯；如有歧異，以英文版為準。

| | |
|---|---|
| 日期 | 2026-10-30 |
| 狀態 | 生效中 |

說明如何發行 TripReplay 的版本。這些步驟符合 [1.0 定義 §6.5](release-1.0.md#65-發行工程) 的發行工程要求，以及[相依套件授權政策 §6](license-policy.md#6-發行門檻) 的發行門檻。

## 1. 建置產出

`pnpm run build` 會將 Web 應用程式寫入 `apps/web/dist`。除應用程式本身外，還包含：

| 檔案 | 內容 |
|---|---|
| `THIRD-PARTY-NOTICES.txt` | 建置中每個第三方元件及其授權與完整授權條文；應用程式內有連結可開啟 |
| `sbom.cdx.json` | CycloneDX 1.5 格式的 SBOM：各元件的名稱、版本、套件 URL、SPDX 授權及 SHA-512 雜湊值 |
| `sw.js`、`manifest.webmanifest`、`icons/` | 讓應用程式可安裝、且無需連線即可啟動的 service worker 與 manifest |

授權聲明與 SBOM 皆由建置本身產生：Vite 外掛（`tools/release`）讀取打包工具實際納入的模組，加上這些套件的正式相依套件（部分套件如 `maplibre-gl` 提供的預先打包檔已包含其相依套件），以及 `licenses/embedded.json` 所列的內嵌內容。若打包的套件未在 `licenses/inventory.json` 中審核，或宣告的授權與審核時不同，**建置即會失敗**。

建置出的頁面帶有內容安全政策，僅允許連線至地圖下載來源；指令碼與 worker 只能來自本網站。

## 2. 步驟

1. 在分支上，於根目錄的 `package.json` 設定新版本。
2. 在 `CHANGELOG.md` 及其翻譯中，將 `## [Unreleased]` 改為 `## [x.y.z] - YYYY-MM-DD`，並在其上方新增空白的 `## [Unreleased]` 段落。
3. 開啟拉取請求，CI 通過後合併。
4. 在 `main` 上為合併後的提交加上標籤並推送：

   ```sh
   git tag vx.y.z
   git push origin vx.y.z
   ```

5. 發行流程會檢查標籤是否與版本相符，執行 `verify`、建置與瀏覽器測試，並發布 GitHub 發行版本，附上：
   - `tripreplay-web-vx.y.z.zip`：`apps/web/dist` 的內容，可直接部署；
   - `tripreplay-vx.y.z.sbom.cdx.json` 與 `THIRD-PARTY-NOTICES.txt`；
   - 上述檔案的 `SHA256SUMS`。

   發行說明為 `CHANGELOG.md` 中該版本的段落。含連字號的標籤（例如 `v0.1.0-beta.1`）會以預先發行版本發布。

## 3. 部署

發行壓縮檔是使用相對路徑的靜態網站，可部署於任何 HTTPS 位置，包括子路徑。伺服器必須以 `application/manifest+json` 傳送 `.webmanifest` 檔案，且不可長時間快取 `sw.js`，瀏覽器才能找到新版本。
