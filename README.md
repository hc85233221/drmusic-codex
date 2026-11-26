# DrMusic

外掛 1.2.1 包含兩個 Skill。鋼琴譜用 `drmusic-score` 轉錄雙手音符，使用 .drm 檔。吉他和弦歌詞譜用 `drmusic-guitar-score`，保留和弦與歌詞位置、調性及段落，使用 .drmg 檔。兩種檔案都由 DrMusic 簽發，匯入時須使用原帳號。執行本機橋接器需要 Node.js 20 以上。

## 安裝到 Codex

把下列文字貼到本機 Codex 對話。

> 請執行 codex plugin marketplace add hc85233221/drmusic-codex。若已加入則執行 codex plugin marketplace upgrade drmusic-local。接著執行 codex plugin add drmusic@drmusic-local，用 codex plugin list 確認已啟用新版 DrMusic。

## 安裝到 Claude Code

把下列文字貼到本機 Claude Code 對話。

> 請從 https://github.com/hc85233221/drmusic-codex 取得 plugins/drmusic/skills 目錄下的 drmusic-score 和 drmusic-guitar-score，將兩個完整資料夾並列安裝到 Claude Code 個人 skills 目錄（預設 ~/.claude/skills/）。保留既有自訂檔案。確認 Node.js 20 以上，將 SCRIPT 替換為安裝後 drmusic-score/scripts/mcp-bridge.mjs 的完整絕對路徑，執行 claude mcp add --transport stdio --scope user drmusic -- node "SCRIPT"。已有相同設定時直接沿用。用 claude mcp get drmusic 檢查連線。

兩個 Skill 共用一個 drmusic 連線。安裝或更新後開新對話，說「連接 DrMusic」。用同機瀏覽器登入正確帳號，開啟配對連結並按「連接這個帳號」。使用期間保持該分頁開啟。

## 使用吉他譜

附上吉他譜並說「保留原調、和弦對位及段落，製作吉他檔並匯入我的樂譜室」。要匯入現成吉他檔可直接附上 .drmg。可同時附上對應的 YouTube 影片網址。AI 自行尋找影片時會核對曲名與演出者，沒有可靠來源仍可匯入，曲主可稍後補上。單獨要求製檔時，AI 可以先交付檔案，日後再匯入。

本機工具清單應包含 drm_connect、五個既有服務工具，以及 drm_package_guitar_score、drm_import_guitar_package、drm_publish_guitar_score 和 drm_set_guitar_video。曲主要透過 AI 更換既有曲目的影片，可用最後一項工具傳入曲目 ID 與已確認的網址。GitHub 套件更新後，本機和遠端服務都須支援對應工具才能完成匯入。
