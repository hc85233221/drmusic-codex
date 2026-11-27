---
name: drmusic-piano-study
description: 把 DrMusic 雙手鋼琴譜轉成首調數字簡譜。可在自己的樂譜室另存一份私人簡譜，或只預覽、下載及列印 HTML。
---

# 鋼琴轉雙手簡譜

使用指定的鋼琴譜。原曲連結的 `score` 參數是曲目 ID；只有曲名時以 `drm_list_scores` 找到來源鋼琴譜。同名且編曲不同時，先辨明版本。只有譜照或 PDF 時，先依 `drmusic-score` 轉錄雙手音符。

## 在曲庫增加一個譜

使用者說「把這首變成簡譜，增加一個譜」、「另存到我的樂譜室」時，使用曲主的連線呼叫 `drm_create_numbered_score({id})`，傳入來源鋼琴譜 ID。使用者另指定名稱時再傳 `title`。若原譜的調性未明，先向使用者確認，再以選填的 `key` 傳入，例如 `"Bb major"`。解析成功回覆的 `content[0].text`，核對 `kind: "numbered"` 後交付 `url` 與簡譜自己的 `id`。相同來源版本、名稱和調性的重試會取得同一份簡譜；`duplicate: true` 時告知使用者已找到既有簡譜。若連線尚未提供此工具，說明曲庫尚未完成新增。

## 只預覽或交付檔案

曲庫內的譜可直接交付 `drm_get_piano_score` 第一頁傳回的 `numberedUrl`。曲主用已登入的 DrMusic 瀏覽器開啟即可下載並列印該版本的完整雙手簡譜。只需下載連結時，第一頁就足夠。原譜調性未明時，確認後將 `key` 加為網址參數，例如 `&key=Bb%20major`。

使用者提供本機 JSON、需要直接交付檔案，或網站因排版過大回傳 413 時，從本 Skill 資料夾執行下列命令。曲庫來源須先依下節合併完整的私人譜檔。

```sh
node scripts/numbered.mjs "/path/to/score.json" -o "/path/to/numbered.html"
```

大調以 1、小調以 6 為主音。若原譜缺調號，向使用者確認調性後才以例如 `--key "G minor"` 指定，並在交付時註明來源。保留每小節的實際長度與局部拍號，依書寫音排版；未提供書寫層時依演奏音排版。核對八度、臨時變音、休止、和音與左右手時值。核對首尾小節、音域及一段和音或延音後，交付檔案並說明使用的調性與記法。

## 從原曲讀譜

1. 使用曲主帳號的 DrMusic 連線呼叫 `drm_get_piano_score({id})`。成功時解析 `content[0].text` 的 JSON，保留第一頁的 `revision` 和 `score` 中的調性、拍號與速度。
2. 每頁最多 256 個演奏音和 256 個書寫音。只要 `next` 有值，就用相同 `id`、第一頁的 `revision` 和完整的 `next` 讀下一頁。將第 i 個小節（i 從 0 起）放回 `measures[startMeasure-1+i]`。若第一個小節跨頁，分別依 `noteOffset` 接上 `notes`、依 `notationOffset` 接上 `notationNotes`，缺省偏移為 0。續接前核對各層已收音符數與偏移相符，保留原始 `start`。缺少書寫層與明示空陣列的意義不同，應依原樣合併。
3. 讀到 `next: null` 後核對小節數與 `totalMeasures` 一致，把重組的 `score` 存成私人工作目錄中的 JSON。遇到譜面版本衝突時，丟棄舊分頁，從第一頁重讀。
