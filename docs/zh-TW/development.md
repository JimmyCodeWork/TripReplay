# 開發指南

[English](../development.md) | 繁體中文

> 本文件為英文版之翻譯；如有歧異，以英文版為準。

## 必要條件

| 工具 | 版本 | 說明 |
|---|---|---|
| Node.js | 24（LTS） | 見 [`.node-version`](../../.node-version)。較舊的版本會在安裝時被拒絕。 |
| pnpm | 12.14.0 | 已於 `package.json` 中鎖定；執行 `corepack enable` 即可自動使用鎖定的版本。 |
| Git | 任一近期版本 | |
| Docker | 選用 | 僅 `pnpm run verify:clean` 需要。 |

## 開始使用

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm run hooks:install   # 選用；見「本機驗證」
```

## 指令

| 指令 | 用途 |
|---|---|
| `pnpm run verify` | 依相同順序執行 CI 的所有檢查 |
| `pnpm run verify:clean` | 於乾淨的 Linux 容器中執行 `verify`（需要 Docker） |
| `pnpm run dev` | 以開發模式（Vite）啟動 Web 應用程式，網址為 `http://localhost:5173` |
| `pnpm run build` | 將 Web 應用程式建置至 `apps/web/dist` |
| `pnpm run hooks:install` | 啟用版本庫的 Git hooks |
| `pnpm run lint` | 檢查格式與 lint 規則（Biome）；有任何問題即失敗 |
| `pnpm run format` | 套用格式化及安全的 lint 修正 |
| `pnpm run typecheck` | 對所有 TypeScript 原始碼進行型別檢查：核心、應用層及工具不含 DOM 型別（`tsconfig.json`），轉接器則包含（`tsconfig.browser.json`） |
| `pnpm test` | 執行所有 workspace 套件的測試 |
| `pnpm run test:browser` | 於無頭 Chromium（Playwright）中執行轉接器測試；見[瀏覽器測試](#瀏覽器測試) |
| `pnpm run deps:check` | 檢查套件界線（見[應用程式架構 §5](architecture.md#5-規則)） |
| `pnpm run i18n:check` | 檢查訊息目錄（見[在地化 §3](localization.md#3-訊息目錄)） |
| `pnpm run license:check` | 依授權政策檢查已安裝的相依套件 |

`verify` 會依序執行 `lint`、`typecheck`、`test`、`deps:check`、`i18n:check` 及 `license:check`，遇到第一個失敗即停止。

## 本機驗證

所有檢查皆可於本機執行。CI workflow（[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)）會在每個 Pull Request 及每次推送至 `main` 時執行相同的 `pnpm run verify` 指令，接著執行 `pnpm run test:browser`，因此在本機通過的變更，在 CI 中同樣會通過。

### 瀏覽器測試

轉接器套件透過 Vitest 瀏覽器模式與 Playwright，於無頭 Chromium 中測試其使用的瀏覽器 API（OPFS、IndexedDB、WebGL）。首次使用時以 `pnpm --filter @tripreplay/storage exec playwright install chromium` 安裝瀏覽器。無法下載時，可改將 `CHROMIUM_PATH` 設為既有 Chromium 執行檔的路徑。WebGL 使用軟體實作 SwiftShader，因此不需要 GPU。這些測試不包含於 `verify`，因此執行 `verify` 不需要瀏覽器。

### 驗證層級

| 層級 | 指令 | 使用時機 |
|---|---|---|
| 1. 工作目錄 | `pnpm run verify` | 開發期間及每次推送前 |
| 2. 乾淨容器 | `pnpm run verify:clean` | 合併至 `main` 前、變更相依套件或工具後，或不同機器的結果不一致時 |

`verify:clean` 會將工作目錄（排除 `node_modules`、`.git` 及本機檔案）複製至 `node:24` Debian 容器，依 lockfile 安裝相依套件後執行 `verify`。它可在任何主機（包括 Windows 與 macOS）上重現 CI 環境，且不會留下映像檔。相依套件會在多次執行之間快取。

### Git hooks

`pnpm run hooks:install` 會將此 clone 的 `core.hooksPath` 設為 [`.githooks/`](../../.githooks)。這些 hooks 為 POSIX shell 指令碼，在 Windows 上亦可透過 Git for Windows 執行。

| Hook | 執行內容 | 目的 |
|---|---|---|
| `pre-commit` | `pnpm run lint` | 於 commit 前發現格式與 lint 錯誤 |
| `pre-push` | `pnpm run verify` | 阻擋會導致 CI 失敗的推送 |

如需單次略過 hook，請於 `git commit` 或 `git push` 加上 `--no-verify`。如需停用 hooks，請執行 `git config --unset core.hooksPath`。

## 版本庫結構

| 路徑 | 內容 |
|---|---|
| `apps/web/` | Web 應用程式：建立轉接器並掛載介面的組合根；各平台外殼將於日後加入 |
| `packages/` | 產品套件：`domain`、`themes`、`i18n`、`timeline`、`app`、`renderer`、`map`、`storage`、`ui`；其餘依[應用程式架構 §3](architecture.md#3-套件) 規劃 |
| `packages/domain/` | 資料模型、不變條件及純函式的編輯操作 |
| `packages/themes/` | 以資料定義的隨附回顧主題 |
| `packages/timeline/` | 時間軸編譯器及 `renderAt`，描述回顧的每一格畫面 |
| `packages/app/` | 編輯器狀態、可復原與重做的命令、自動儲存，以及由轉接器實作的連接埠 |
| `packages/renderer/` | 繪製回顧的每一格畫面；定義 `MapLayer` 連接埠 |
| `packages/map/` | 以 MapLibre GL JS 從裝置上的 PMTiles 檔繪製底圖，可續傳的 Overture Maps 區域下載，以及已下載地圖中的地點搜尋 |
| `packages/storage/` | 以 IndexedDB 儲存專案及地圖區域列表、以 OPFS 儲存媒體，具備當機安全的匯入、啟動時復原及[專案包](project-package.md) |
| `packages/i18n/` | 語系判定、訊息目錄（`locales/`）與訊息格式化 |
| `packages/ui/` | 以 React 實作的畫面與元件，包括地圖對話框、旅行列表與行程 |
| `tools/deps-check/` | CI 使用的套件界線檢查；允許的相依關係定義於 `boundaries.json` |
| `tools/i18n-check/` | CI 使用的訊息目錄檢查工具 |
| `tools/license-check/` | CI 使用的授權檢查工具 |
| `tools/variants/` | 由 OpenCC 字典產生地點搜尋用的異體字對照表 |
| `tools/ci/` | `verify:clean` 使用的容器定義 |
| `.githooks/` | 選用的 Git hooks |
| `licenses/` | 機器可讀的授權政策與相依清單 |
| `docs/` | 產品規格、政策、路線圖及架構決策紀錄；繁體中文版置於 `docs/zh-TW/` |

## 授權檢查

授權檢查以下列兩個檔案執行[相依套件授權政策](license-policy.md)：

- [`licenses/policy.json`](../../licenses/policy.json) 列出 `code` 元件允許的 SPDX 識別碼，以及 `asset` 元件額外允許的識別碼。其內容對應政策 §3，且僅能與政策一同修改。
- [`licenses/inventory.json`](../../licenses/inventory.json) 記錄每個元件的審查結果。

### 規則

| 相依類型 | 規則 |
|---|---|
| 正式相依（`dependencies`），含所有遞移相依 | 每個 `name@version` 皆須列於 `release`，`declared` 須與套件宣告的授權相同，且該授權須為其 `category` 所允許 |
| 開發相依（`devDependencies`），僅限直接相依 | 每個套件名稱皆須列於 `development`。由於開發工具不隨附散布，不限制其授權。 |
| 相依清單 | 已不再安裝的套件若仍留有項目，檢查即失敗，以確保相依清單與 lockfile 一致 |

### 清單項目格式

```json
{
  "release": {
    "earcut@3.2.4": { "declared": "ISC", "category": "code" },
    "legacy-pkg@1.0.0": {
      "declared": "MIT/X11",
      "resolved": "MIT",
      "category": "code",
      "note": "Declared value is not valid SPDX; LICENSE file reviewed and is the MIT License."
    }
  },
  "development": ["@biomejs/biome", "typescript"]
}
```

| 欄位 | 意義 |
|---|---|
| `declared` | 套件所宣告的授權字串原文。升級後若有變動，檢查將失敗，直到重新審查該項目為止。 |
| `resolved` | 選填。經審查確定的 SPDX 運算式，於 `declared` 不是有效的 SPDX 時使用。 |
| `category` | `code`，或用於字型、圖片及資料的 `asset`。 |
| `note` | 選填。審查備註，例如內嵌的第三方程式碼，或 `OR` 運算式所選用的授權選項。 |

### 新增或升級相依套件

1. 開立相依套件申請 Issue 並取得核准。
2. 以 `pnpm add` 安裝套件。
3. 執行 `pnpm run license:check`，列出所有需要審查的新 `name@version`。
4. 審查每個列出的套件（含其 LICENSE 檔案及任何內嵌的第三方程式碼），並為其加入項目。
5. 將 `package.json`、`pnpm-lock.yaml` 及 `licenses/inventory.json` 一同提交。

`licenses/inventory.json` 的差異即為審查紀錄；審閱者須對照套件實際的授權檔案進行核對。
