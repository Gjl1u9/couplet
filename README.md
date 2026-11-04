# dual-subtitles

YouTube 雙語字幕 Chrome 擴充功能。

目前階段：免費層的雙語字幕。

## 開發

需要 Node 22 以上，版本見 `.nvmrc`。

```bash
npm install
npm run dev
```

提交前跑一次完整檢查，內容和 CI 相同：

```bash
npm run check
```

## 錄製 YouTube 事件

`tools/recorder-extension` 是開發用的擴充功能，不需要建置。它只記錄事件時序、影片 ID 和 DOM 變動數量，不記錄帳號資料、簽名或 token。

1. 到 `chrome://extensions` 開啟開發人員模式，選「載入未封裝項目」，選這個資料夾。
2. 用未登入的 profile 正常看影片。
3. 點擴充功能圖示，選「匯出 JSON」。

請用人工操作的瀏覽器錄製。由 Playwright 等自動化工具啟動的瀏覽器，影片會在約 50 秒後報錯，字幕也是空的。
