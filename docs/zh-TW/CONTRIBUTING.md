# 參與貢獻 TripReplay

[English](../../CONTRIBUTING.md) | 繁體中文

> 本文件為英文版之翻譯；如有歧異，以英文版為準。

感謝您對 TripReplay 的關注。本專案目前處於設計階段，現階段最有價值的貢獻為審閱[產品規格](specification.md)、提供技術驗證結果，以及進行授權研究。

Issue 與 Pull Request 可使用英文或繁體中文撰寫。

## 開始之前

- 請閱讀[產品規格](specification.md)、[開發路線圖](roadmap.md)及[相依套件授權政策](license-policy.md)。
- 依[開發指南](development.md)設定開發環境。
- 小型修正以外的任何變更，請先開立 Issue，待做法取得共識後再投入時間。
- 重大的架構或政策變更須撰寫[架構決策紀錄](adr/README.md)。
- 所有參與者皆應遵守[行為準則](CODE_OF_CONDUCT.md)。

## 貢獻內容的授權

提交貢獻即表示您同意該貢獻以本專案的 [MIT 授權](../../LICENSE)釋出，並依 [Developer Certificate of Origin 1.1](https://developercertificate.org/)（開發者原創聲明）證明您有權以該授權提交。

請為每個 commit 加上簽署，以記錄此項聲明：

```sh
git commit -s
```

此指令會依您的 Git 身分加入一行 `Signed-off-by: Your Name <you@example.com>`。含有未簽署 commit 的 Pull Request 無法合併。

非您本人撰寫的程式碼、資料或資產，除非其授權為[相依套件授權政策](license-policy.md)所允許，且已於 Pull Request 中註明來源，否則請勿提交。

## 新增相依套件

每個新的相依套件（包括升級時引入的遞移相依）皆須為[相依套件授權政策](license-policy.md)所允許。

1. 開立 **Dependency request**（相依套件申請）Issue，載明套件名稱、版本、SPDX 授權運算式、用途及曾考慮的替代方案。
2. 審查該套件的遞移相依及所有內嵌的第三方程式碼。
3. 核准後，以專門的 Pull Request 加入該相依套件、lockfile 變更，以及 `licenses/inventory.json` 中的對應項目。

CI 授權檢查會拒絕未經審查的元件，以及禁止或未知的授權。詳見[開發指南](development.md#授權檢查)。

## 隱私要求

TripReplay 將所有私人資料保留在裝置上（[產品規格 §1.3](specification.md#13-私人資料保留在裝置上之定義)）。貢獻內容不得：

- 將媒體、中繼資料、專案內容或本機路徑傳送至任何遠端服務；
- 加入會自動傳送資料的分析、遙測或當機回報功能；
- 將完整本機路徑、EXIF 資料或行程內容寫入日誌。

任何新增的網路請求，皆須於 Pull Request 中說明其傳送的內容及原因。

## 文件與 UI 文字

- 英文為來源語言。變更面向使用者的文件或 UI 字串時，須同時更新英文與繁體中文。
- 若您無法提供翻譯，請於 Pull Request 中說明；該變更將標示為待翻譯，於翻譯完成前不會發行。
- 請遵循[在地化](localization.md)中的術語與排版慣例。
- 繁體中文文件置於 `docs/zh-TW/`，並與英文檔案結構相互對應。

## Pull Request

- 每個 Pull Request 僅聚焦於單一變更。
- 標題請以英文祈使語氣清楚描述變更，例如「Add timeline compiler for photo segments」。
- Commit 訊息請以英文撰寫：首行為 72 個字元以內的摘要，其後以內文說明變更內容與原因。
- 開啟 Pull Request 前請執行 `pnpm run verify`，並完成 Pull Request 範本中的檢查清單。
- 合併前須至少取得一位維護者核准。

## 回報問題與功能建議

請使用 Issue 範本。安全性或隱私弱點請**勿**開立公開 Issue，請依[安全政策](SECURITY.md)辦理。
