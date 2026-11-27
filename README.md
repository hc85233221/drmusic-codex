# DrMusic

外掛 1.5.0 包含三個 Skill。鋼琴譜用 `drmusic-score` 轉錄雙手音符，使用 .drm 檔。吉他和弦歌詞譜用 `drmusic-guitar-score`，保留和弦與歌詞位置、調性及段落，使用 .drmg 檔。兩種檔案都由 DrMusic 簽發，匯入時須使用原帳號。執行本機橋接器需要 Node.js 20 以上。

## 安裝到 Codex

把下列文字貼到本機 Codex 對話。

> 請執行 codex plugin marketplace add hc85233221/drmusic-codex。若已加入則執行 codex plugin marketplace upgrade drmusic-local。接著執行 codex plugin add drmusic@drmusic-local，用 codex plugin list 確認已啟用新版 DrMusic。

## 安裝到 Claude Code

把下列文字貼到本機 Claude Code 對話。

> 請從 https://github.com/hc85233221/drmusic-codex 取得 plugins/drmusic/skills 目錄下的 drmusic-score、drmusic-guitar-score 和 drmusic-piano-study，將三個完整資料夾並列安裝到 Claude Code 個人 skills 目錄（預設 ~/.claude/skills/）。已有舊版時更新官方檔案，並依下方升級說明清理已撤下的檔案。遇到自訂變更先備份。確認 Node.js 20 以上，將 SCRIPT 替換為安裝後 drmusic-score/scripts/mcp-bridge.mjs 的完整絕對路徑，執行 claude mcp add --transport stdio --scope user drmusic -- node "SCRIPT"。已有相同設定時直接沿用。用 claude mcp get drmusic 檢查連線。

三個 Skill 共用一個 drmusic 連線。安裝或更新後開新對話，說「連接 DrMusic」。用同機瀏覽器登入正確帳號，開啟配對連結並按「連接這個帳號」。使用期間保持該分頁開啟。

### 從舊版升級 Claude Code

舊版曾隨附 `drmusic-piano-study/scripts/advice.mjs`。只在已確認屬於 DrMusic 的安裝目錄，核對此檔 SHA-256。若為官方 1.3.1 的 `7c96bd458da3f126225eb4ca432b7f63aed9c3d0db32bb71fd42a6247be56dca` 或 1.3.0 的 `056efcd59e465d79d0e9af161d48bd642da71d07a72b5268128acce464f7a8f4`，移除該檔。若內容有自訂，先將該檔備份到 Skills 目錄外，保留其他個人檔案。開新對話確認列出的工具包含 `drm_create_numbered_score`。

## 鋼琴轉雙手簡譜

在 Codex 輸入 `$drmusic:drmusic-piano-study`，或在 Claude Code 輸入 `/drmusic-piano-study`，並附上自己的鋼琴譜連結。

- 「把這首變成簡譜，增加一個譜」會用 `drm_create_numbered_score` 在私人曲庫新增可直接開啟的簡譜。
- 「只給我可列印的簡譜」會用 `drm_get_piano_score` 取得曲主專用下載連結。也可提供本機鋼琴 JSON，在本機產生 HTML。

鋼琴譜可保留弱起小節的實際長度、局部拍號和 77.5 BPM 等小數速度。來源分別提供演奏音和書寫音時，播放使用演奏音，簡譜顯示書寫音。

## 使用吉他譜

附上吉他譜並說「保留原調、和弦對位及段落，製作吉他檔並匯入我的樂譜室」。要匯入現成吉他檔可直接附上 .drmg。可同時附上對應的 YouTube 影片網址。AI 自行尋找影片時會核對曲名與演出者，沒有可靠來源仍可匯入，曲主可稍後補上。單獨要求製檔時，AI 可以先交付檔案，日後再匯入。

除鋼琴練習工具外，本機工具清單還包含 drm_connect、五個既有服務工具，以及 drm_package_guitar_score、drm_import_guitar_package、drm_publish_guitar_score 和 drm_set_guitar_video。曲主要透過 AI 更換既有曲目的影片，可用最後一項工具傳入曲目 ID 與已確認的網址。GitHub 套件更新後，本機和遠端服務都須支援對應工具才能完成匯入。
