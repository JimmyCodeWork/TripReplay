# 架構決策紀錄

[English](../../adr/README.md) | 繁體中文

> 本文件為英文版之翻譯；如有歧異，以英文版為準。

本目錄記錄重大的架構與政策決策。每份紀錄說明背景、決策及其影響；紀錄一經接受即不再改寫，如需變更，則以新紀錄取代。

| ADR | 標題 | 狀態 |
|---|---|---|
| [0001](0001-dependency-license-scope.md) | 相依套件授權範圍 | 已接受 |
| [0002](0002-public-domain-and-data-licenses.md) | 允許 SQLite 與 CDLA-Permissive-2.0 | 已接受 |
| [0003](0003-language-and-toolchain.md) | 主要程式語言與工具鏈 | 已接受 |

## 撰寫紀錄

1. 將 [`template.md`](../../adr/template.md) 複製為 `NNNN-short-title.md`，並使用下一個編號。
2. 於 `docs/zh-TW/adr/` 下以相同檔名加入繁體中文翻譯。
3. 以狀態 `Proposed`（提議中）開啟 Pull Request；合併後狀態改為 `Accepted`（已接受）。
