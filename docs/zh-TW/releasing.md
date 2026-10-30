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

`pnpm run android:build` 會建置 Android 應用程式（[ADR 0008](adr/0008-android-in-1-0.md)）：以 `vite build --mode native` 將頁面建置至 `apps/web/dist-native`，再由 Capacitor 複製到 `apps/android/android` 的 Gradle 專案。在 Gradle 封裝之前，`tools/release/src/android.ts` 會讀取 Gradle 為發行建置解析出的函式庫，依 `licenses/inventory.json` 的 `maven` 區段檢查，並改寫頁面的 `THIRD-PARTY-NOTICES.txt` 與 `sbom.cdx.json`，使其涵蓋 Web 元件、Capacitor 執行環境及這些函式庫。若有函式庫未經審查，**建置即會失敗**。應用程式在「開放原始碼授權」中顯示這份授權聲明。

## 2. 步驟

1. 在分支上，於根目錄的 `package.json` 設定新版本。
2. 建置發行版本，並以人工方式檢查[使用指南](user-guide.md)的核心情境：在 Firefox 與 Safari 中（自動化測試尚未涵蓋這兩個瀏覽器），以及在該分支 CI 建置的 Android 應用程式中，包括一次備份與還原。將變動記錄於[瀏覽器支援與已知問題](browser-support.md)及其翻譯。
3. 在 `CHANGELOG.md` 及其翻譯中，將 `## [Unreleased]` 改為 `## [x.y.z] - YYYY-MM-DD`，並在其上方新增空白的 `## [Unreleased]` 段落。
4. 開啟拉取請求，CI 通過後合併。
5. 在 `main` 上為合併後的提交加上標籤並推送：

   ```sh
   git tag vx.y.z
   git push origin vx.y.z
   ```

6. 發行流程會檢查標籤是否與版本相符，執行 `verify`、建置與瀏覽器測試，並發布 GitHub 發行版本，附上：
   - `tripreplay-web-vx.y.z.zip`：`apps/web/dist` 的內容，可直接部署；
   - `tripreplay-android-vx.y.z.apk`：以發行金鑰簽署的 Android 應用程式（§4）；
   - 兩者各自的 SBOM 與授權聲明：`tripreplay-web-vx.y.z.sbom.cdx.json`、`tripreplay-android-vx.y.z.sbom.cdx.json`、`THIRD-PARTY-NOTICES-web.txt` 與 `THIRD-PARTY-NOTICES-android.txt`；
   - 上述檔案的 `SHA256SUMS`。

   發行說明為 `CHANGELOG.md` 中該版本的段落。含連字號的標籤（例如 `v0.1.0-beta.1`）會以預先發行版本發布。

## 3. 部署

發行壓縮檔是使用相對路徑的靜態網站，可部署於任何 HTTPS 位置，包括子路徑。伺服器必須以 `application/manifest+json` 傳送 `.webmanifest` 檔案，且不可長時間快取 `sw.js`，瀏覽器才能找到新版本。

## 4. Android 簽署金鑰

Android 只會安裝與已安裝應用程式使用相同金鑰簽署的更新。金鑰只需建立一次，保存在儲存庫的 Secrets 中供發行流程使用，並在 GitHub 以外另行備份。**若金鑰遺失，使用者必須解除安裝應用程式（連同其中的旅行）才能安裝新版本。**

1. 建立金鑰，並設定不含反斜線的長密碼：

   ```sh
   keytool -genkeypair -v -keystore tripreplay-release.jks -alias tripreplay \
     -keyalg RSA -keysize 4096 -validity 10000
   ```

2. 在儲存庫設定的 **Secrets and variables → Actions** 中新增：

   | Secret | 值 |
   |---|---|
   | `ANDROID_KEYSTORE_BASE64` | 以 Base64 編碼的金鑰檔：`base64 -w0 tripreplay-release.jks` |
   | `ANDROID_KEYSTORE_PASSWORD` | 金鑰檔的密碼 |
   | `ANDROID_KEY_ALIAS` | `tripreplay` |
   | `ANDROID_KEY_PASSWORD` | 金鑰的密碼（未另行設定時與金鑰檔相同） |

3. 將 `tripreplay-release.jks` 及其密碼保存在密碼管理工具或其他安全的地方，並刪除其他副本。切勿提交至版本庫；`.gitignore` 已排除金鑰檔與 `keystore.properties`。

缺少這些 Secrets 時發行流程會失敗；發布前也會以 `apksigner` 檢查 APK 的簽章。

CI 的測試版本則以公開的固定除錯金鑰 `apps/android/android/app/debug.keystore` 簽署，讓每個版本都能覆蓋安裝前一個版本。測試版本會以「TripReplay Debug」的名稱安裝，與正式發行的應用程式並存，資料也各自獨立。切勿以此金鑰簽署發行版本。
