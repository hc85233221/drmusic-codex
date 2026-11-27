# DrMusic

外掛 1.8.2 包含四個 Skill。鋼琴譜用 `drmusic-score` 轉錄雙手音符，使用 .drm 檔。吉他和弦歌詞譜用 `drmusic-guitar-score`，保留和弦與歌詞位置、調性及段落，使用 .drmg 檔。爵士鼓譜用 `drmusic-drum-score` 辨讀鼓件與節奏，使用 .drmd 檔。三種專用檔都由 DrMusic 簽發，匯入時須使用原帳號。執行本機橋接器需要 Node.js 20 以上。

## 安裝到 Codex

把下列文字貼到本機 Codex 對話。

> 請執行 codex plugin marketplace add hc85233221/drmusic-codex。若已加入則執行 codex plugin marketplace upgrade drmusic-local。接著執行 codex plugin add drmusic@drmusic-local，用 codex plugin list 確認已啟用新版 DrMusic。

## 安裝到 Claude Code

把下列文字貼到本機 Claude Code 對話。

> 請從 https://github.com/hc85233221/drmusic-codex 取得 plugins/drmusic/skills 目錄下的 drmusic-score、drmusic-guitar-score、drmusic-piano-study 和 drmusic-drum-score，將四個完整資料夾並列安裝到 Claude Code 個人 skills 目錄（預設 ~/.claude/skills/）。已有舊版時更新官方檔案，並依下方升級說明清理已撤下的檔案。遇到自訂變更先備份。確認 Node.js 20 以上，將 SCRIPT 替換為安裝後 drmusic-score/scripts/mcp-bridge.mjs 的完整絕對路徑，執行 claude mcp add --transport stdio --scope user drmusic -- node "SCRIPT"。已有相同設定時直接沿用。用 claude mcp get drmusic 檢查連線。

四個 Skill 共用一個 drmusic 連線。安裝或更新後開新對話，說「連接 DrMusic」。用同機瀏覽器登入正確帳號，開啟配對連結並按「連接這個帳號」。使用期間保持該分頁開啟。

### 從舊版升級 Claude Code

舊版曾隨附 `drmusic-piano-study/scripts/advice.mjs`。只在已確認屬於 DrMusic 的安裝目錄，核對此檔 SHA-256。若為官方 1.3.1 的 `7c96bd458da3f126225eb4ca432b7f63aed9c3d0db32bb71fd42a6247be56dca` 或 1.3.0 的 `056efcd59e465d79d0e9af161d48bd642da71d07a72b5268128acce464f7a8f4`，移除該檔。若內容有自訂，先將該檔備份到 Skills 目錄外，保留其他個人檔案。開新對話確認列出的工具包含 `drm_create_numbered_score`、`drm_add_piano_notation` 與 `drm_store_private_attachment`。

## 鋼琴轉雙手簡譜

在 Codex 輸入 `$drmusic:drmusic-piano-study`，或在 Claude Code 輸入 `/drmusic-piano-study`，並附上自己的鋼琴譜連結。

- 「把這首變成簡譜，增加一個譜」會用 `drm_create_numbered_score` 在私人曲庫新增可直接開啟的簡譜。
- 「只給我可列印的簡譜」會用 `drm_get_piano_score` 取得曲主專用下載連結。也可提供本機鋼琴 JSON，在本機產生 HTML。

打開簡譜可看右手聲部，也可選「完整雙手」後列印。簡譜按小節分行，譜首列出調號、拍號與速度。原稿有和弦和歌詞時，和弦對齊拍位，歌詞依段數對齊旋律。已有獨立簡譜時，可指定該份簡譜的連結，再請 AI 依原稿補詞或和弦。

鋼琴譜可保留弱起小節的實際長度、局部拍號和 77.5 BPM 等小數速度。另存簡譜時保留原稿明示的重音、延長記號、延音線、圓滑線、強弱、漸強／漸弱線、延音踏板及裝飾音；八度移記保留原本演奏音高。來源分別提供演奏音和書寫音時，播放使用演奏音，簡譜顯示書寫音。

## 使用爵士鼓譜

在 Codex 輸入 `$drmusic:drmusic-drum-score`，或在 Claude Code 輸入 `/drmusic-drum-score`。附上整頁鼓譜，有本曲專用圖例時可一併附上，指定「做成 .drmd 檔」或「匯入我的樂譜室」。收到已有的 .drmd 時，使用原簽發帳號匯入。只提供參考圖時，AI 會先說明頁序、可辨識的節奏和疑義。一般鼓譜使用 DrMusic 共用圖例，能區分兩面有編號的 Crash。重音可精確記到單一擊點。原稿採用特殊畫法時可依圖例或曲主指示對應，仍無法辨識的符號保留原形並靜音。

## 使用吉他譜

附上吉他譜並說「保留原調、和弦對位及段落，製作吉他檔並匯入我的樂譜室」。要匯入現成吉他檔可直接附上 .drmg。可同時附上對應的 YouTube 影片網址。AI 自行尋找影片時會核對曲名與演出者，沒有可靠來源仍可匯入，曲主可稍後補上。單獨要求製檔時，AI 可以先交付檔案，日後再匯入。

曲主可用 `drm_set_guitar_video` 傳入曲目 ID 與已確認的影片網址。

## 補回書寫音與保存原譜

要在原曲補回雙手書寫音，用 `drm_get_piano_score` 確認曲目及目前的 revision，再用 `drm_add_piano_notation` 傳入已核對的小節。每一批沿用原曲 ID，下一批使用上一次回傳的 revision。

要在自己的曲目保存原譜，用 `drm_store_private_attachment` 依原始順序逐檔傳送。將本機 PDF（每份上限 768 KiB）編為標準 base64，傳入 `pdfBase64`。已獲授權的舊庫移轉帳號可改用清單中的 `legacyFile` 檔名，每份上限 24 MiB。每次核對回條的 `verified.sha256` 與 `verified.size` 是否和原檔一致。
