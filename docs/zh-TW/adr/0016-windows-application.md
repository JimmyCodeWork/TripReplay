# 0016. 以 WebView2 與 NSIS 安裝檔提供 Windows 應用程式

[English](../../adr/0016-windows-application.md) | 繁體中文

> 本文件為英文版之翻譯；如有歧異，以英文版為準。

| | |
|---|---|
| 狀態 | 已接受。決定 [ADR 0008](0008-android-in-1-0.md) 決策 5 留待日後決定的 Windows 外殼 |
| 日期 | 2026-11-15 |

## 背景

維護者希望提供 TripReplay 的 Windows 安裝檔，目前先不簽章。[ADR 0008](0008-android-in-1-0.md) 排除了 Tauri（其應用程式會連結 MPL-2.0 的 crate），並規定其他安裝版的外殼須在檢查完整相依樹的授權後再決定。候選方案如下：

- **Electron。** 本身為 MIT，但每個 Electron 建置都附帶 Chromium 的 FFmpeg 函式庫（LGPL-2.1），執行環境也多出約 100 MB。[相依套件授權政策 §3.4](../license-policy.md#34-發行成品中禁止的授權) 禁止發行成品包含 LGPL。
- **Tauri。** 已由 ADR 0008 排除。
- **以小型原生程式包裝 WebView2 控制項。** WebView2 即 Microsoft Edge 的引擎，Windows 10 與 11 會以 Evergreen WebView2 Runtime 自動更新；程式本身不需附帶。

## 決策

1. **外殼。** Windows 應用程式（`apps/windows`）是以 .NET 10、Windows Forms 與 WebView2 控制項撰寫的 C# 程式。它從所在資料夾，經由虛擬主機 `https://app.tripreplay.example` 提供以 `vite build --mode desktop` 建置的頁面，使頁面擁有自己的安全來源。連往其他網站的連結會在預設瀏覽器開啟；全螢幕時會去掉視窗框並填滿螢幕。
2. **封裝。** 程式以自封式（self-contained）方式發布為 64 位元 Windows 版，因此不需另外安裝 .NET。安裝檔以 NSIS 建置，且只使用 zlib 壓縮：NSIS 的 LZMA 壓縮器採 CPL-1.0、bzip2 壓縮器採 bzip2 授權，皆不在白名單內。安裝檔以目前使用者身分安裝到 `%LOCALAPPDATA%\Programs\TripReplay`，不需系統管理員權限，並建立捷徑與解除安裝程式，介面語言依 Windows 顯示英文或繁體中文。
3. **授權把關。** 程式發布時所用的 NuGet 套件（.NET 執行環境套件與 WebView2 SDK）在 `licenses/inventory.json` 的 `nuget` 區段審查；其 stub 會成為安裝檔一部分的 NSIS，則在 `installer` 區段審查。`tools/release/src/windows.ts` 會檢查這些項目並寫出應用程式的聲明與 SBOM；**只要有未審查的套件，建置就會失敗**。WebView2 Runtime 屬於 Windows 的一部分，不隨應用程式散布。
4. **資料。** 應用程式將旅程、地圖與設定保存在 `%LOCALAPPDATA%\TripReplay` 下自己的 WebView2 設定檔中，與所有瀏覽器分開。解除安裝時會保留這些資料，重新安裝後仍可找到。
5. **簽章。** 安裝檔與程式目前皆未簽章，因此 Windows SmartScreen 會在第一次啟動前發出警告；日後可在不改變建置流程的情況下加入簽章。
6. **建置。** `pnpm run windows:build` 可在 Linux 或 Windows 上建置安裝檔。CI 會在每個 Pull Request 建置並保留為成品，發行工作流程則將安裝檔連同其 SBOM 與聲明附加到每個 GitHub Release。

## 考慮過的替代方案

- **Electron。** 附帶的 LGPL FFmpeg 不符政策，體積也大得多。
- **以 WiX 或 MSIX 取代 NSIS。** WiX 採 MS-RL，屬 Copyleft 授權；MSIX 必須簽章才能安裝。
- **只提供漸進式網頁應用程式（PWA）。** PWA 仍可使用，但維護者希望有不依賴瀏覽器安裝選項的安裝檔。

## 影響

- 每個版本都附有約 50 MB 的 Windows 安裝檔。更新時執行新的安裝檔即可，旅程會保留。
- 在簽章之前，使用者須在 SmartScreen 中選擇「其他資訊 → 仍要執行」。
- 與 Android 應用程式相同，應用程式中的旅程與瀏覽器中的旅程分開，須以備份移轉。
- MCP 伺服器接受應用程式的來源（[ADR 0012](0012-mcp-server.md)）。
- 應用程式在 CI 中建置，但在 Windows 上以人工測試。
