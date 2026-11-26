# DrMusic for Codex

把鋼琴譜照片、PDF 或既有的 .drm 檔交給你的 AI，請它匯入自己的 DrMusic 樂譜室。AI 會將照片與 PDF 轉成可播放的音符。對於已簽發的 .drm 檔，AI 會用原簽發帳號匯入，並回傳樂譜連結。套件包括 `drmusic-score` skill 與本機 MCP 橋接器，執行環境為 Node.js 20 以上及支援 `codex plugin` 的 Codex CLI。

## 從 GitHub 安裝

複製這行指令並貼到 Codex 聊天。

> 請幫我安裝 DrMusic 外掛：先執行 codex plugin marketplace add hc85233221/drmusic-codex，再執行 codex plugin add drmusic@drmusic-local，並確認已安裝。

安裝後在新的 Codex 聊天說「連接 DrMusic」。開啟配對頁，確認要使用的 DrMusic 帳號，使用期間保持分頁開啟。接著可附上琴譜並說「幫我匯入這份樂譜」，或附上已有的 .drm 檔並說「把這個檔案加到我的曲庫」。

已安裝舊版時，可請 Codex 執行 `codex plugin marketplace upgrade drmusic-local`，再執行 `codex plugin add drmusic@drmusic-local`，並在新聊天使用。

## 維護儲存庫

將這個資料夾的內容放到自己的 GitHub 儲存庫根目錄，包括隱藏的 `.agents/`、`plugins/` 內的隱藏檔案與這份 README。使用 Git 上傳可保留所有隱藏檔。使用私人儲存庫時，安裝者的 Git 需要具備讀取權限。

`.agents/plugins/marketplace.json` 定義名為 `drmusic-local` 的 marketplace。`plugins/drmusic/` 包含外掛宣告、圖示、轉譜說明與 MCP 程式。
