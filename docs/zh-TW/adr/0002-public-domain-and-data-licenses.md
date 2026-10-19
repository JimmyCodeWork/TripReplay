# 0002. 允許 SQLite 與 CDLA-Permissive-2.0

[English](../../adr/0002-public-domain-and-data-licenses.md) | 繁體中文

> 本文件為英文版之翻譯；如有歧異，以英文版為準。

| | |
|---|---|
| 狀態 | 已接受 |
| 日期 | 2026-10-19 |

## 背景

[ADR 0001](0001-dependency-license-scope.md) 留下兩個待決事項：

- **SQLite** 依其自有條款釋出至公共領域（SPDX `blessing`）。它是安裝版預定採用的儲存引擎（[產品規格 §5](../specification.md#5-系統架構)），且多數綁定（如 `sql.js`、`rusqlite`）皆內嵌其原始碼。
- **CDLA-Permissive-2.0** 適用於資料，例如以 `webpki-roots` 散布的 Mozilla 根憑證套件，它是 Tauri 網路堆疊的遞移相依。

兩者皆不帶有 Copyleft 義務。

## 決策

將[相依套件授權政策](../license-policy.md)修訂為 0.4 版：

- 將 `blessing` 加入允許的程式碼授權。
- 將 `CDLA-Permissive-2.0` 加入允許的資產授權，並將主要由資料構成的元件（如憑證套件）歸類為資產。

`blessing` 與 `CC0-1.0` 以外的一般公共領域聲明，仍不在白名單內，須另行修訂政策。

## 曾考慮的方案

- **排除 SQLite**，安裝版僅使用 IndexedDB 或自行開發的儲存機制。不採用：捨棄成熟的交易式引擎，卻無任何授權上的益處。
- **以平台憑證存放區取代 `webpki-roots`**。政策上無此必要，但仍可基於技術考量採用。

## 影響

- SQLite 綁定與 Tauri 可准入，但仍須逐版本審查。
- 綁定所內嵌的 SQLite 原始碼，須記錄於該綁定在相依清單中的備註。
- 隨附此類資料時，`THIRD-PARTY-NOTICES` 須包含 CDLA-Permissive-2.0 全文。
