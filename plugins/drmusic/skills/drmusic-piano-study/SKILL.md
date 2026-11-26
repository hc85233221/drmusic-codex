---
name: drmusic-piano-study
description: 將 DrMusic 雙手鋼琴譜轉為可列印的首調數字簡譜、推薦左右手指法，或依左手音列判讀段落和弦。可將指定類別的建議寫入原曲逐拍私人備忘錄。
---

# 鋼琴練習

依請求選擇簡譜、指法或左手和弦，可以只做其中一項。使用使用者指定的鋼琴譜與版本。原曲連結的 score 參數就是曲目 ID；只有曲名時先用 drm_list_scores 找到對應曲目。若有同名而不同調或不同編曲，先辨明版本。

使用者提供已轉錄的鋼琴 JSON 時，可直接在本機分析。只有照片或 PDF 時，先依同一外掛的 `drmusic-score` 指引轉錄雙手音符，釐清缺頁及無法辨讀的音。僅製作本機練習資料時無須重新匯入曲庫。

## 從原曲讀譜

1. 使用曲主帳號的 DrMusic 連線呼叫 `drm_get_piano_score({id})`。成功時解析 `content[0].text` 的 JSON，保留第一頁的 `revision` 和 `score` 中的調性、拍號與速度。
2. 每頁最多 256 個音符。只要 `next` 有值，就用相同 `id`、第一頁的 `revision` 和 `next` 給的 `startMeasure`、`noteOffset` 讀下一頁。第 i 個小節（i 從 0 起）放在總譜的 `measures[startMeasure-1+i]`。若首頁以外的頁面從同一小節中途續讀，核對已收音符數等於 `noteOffset` 再接上第一個小節的音符，保留原本的 `start`。
3. 讀到 `next: null` 後核對小節數與 `totalMeasures` 一致，把重組的 `score` 存成私人工作目錄中的 JSON。遇到譜面版本衝突時，丟棄舊分頁，從第一頁重讀。

## 雙手簡譜

曲庫內的譜可直接交付 `drm_get_piano_score` 第一頁傳回的 `numberedUrl`。曲主用已登入的 DrMusic 瀏覽器開啟即可下載並列印該版本的完整雙手簡譜。只需下載連結時，第一頁就足夠。原譜調性未明時，確認後將 `key` 加為網址參數，例如 `&key=Bb%20major`。

使用者提供本機 JSON、需要直接交付檔案，或網站因排版過大回傳 413 時，從本 Skill 資料夾執行下列命令。曲庫來源須先依上節合併完整的私人譜檔。

```sh
node scripts/numbered.mjs "/path/to/score.json" -o "/path/to/numbered.html"
```

大調以 1、小調以 6 為主音。若原譜缺調號，向使用者確認調性後才以例如 `--key "G minor"` 指定，並在交付時註明來源。保留原拍、小節、八度、臨時變音、休止、和音與左右手時值。核對首尾小節、音域及一段和音或延音後，交付檔案並說明使用的調性與記法。僅要求簡譜時，直接交付本機檔案。

## 指法與左手和弦

指法按左右手分列，1 至 5 依序是拇指到小指。將分析結果稱為「建議指法」；有原譜指定指法時，以原譜為準並標明來源。左手和弦需參照實際音群、分解型態、低音及前後走向；報告分段時指出小節範圍及段內換和弦處。左手只有單音、休止或證據不足時，保留分析的不確定性。有譜面印刷的和弦時，與左手推定結果分開標示。

本機分析可從本 Skill 目錄載入模組，把讀回的完整 `score` 傳給它。傳回的 `entries` 含小節與拍位；只顯示使用者指定的欄位。密集音群若附有 `details`，可依同拍及欄位查回完整逐音內容。

```js
import { analyzePianoStudy } from "./scripts/advice.mjs"
const { entries, details } = analyzePianoStudy(score)
const leftChords = entries.filter(e => e.leftChord)
  .map(({ measure, beat, leftChord }) => ({ measure, beat, leftChord }))
```

原譜明確標註的指法或和弦可在本機轉錄時保留為 `note.finger`（1–5）及 `measure.chords`（每個項目含 `start` 與 `symbol`）。目前網站的鋼琴音符資料只儲存音高、手別、起拍與時值。沒有原稿佐證時，將分析結果標成建議。

私人備忘錄使用原曲 ID。指法選 `["fingering"]`，左手和弦選 `["leftChord"]`，兩者都要才同時列入。只問建議時用 `preview: true`。要求寫入時用 `preview: false`。例如，只預覽第 5 至 8 小節的左手和弦：

```js
drm_annotate_piano_study({
  id, revision, kinds: ["leftChord"], startMeasure: 5, measureCount: 4, preview: true
})
```

每頁最多 8 小節。解析 `content[0].text`，依 `next.startMeasure` 續頁，固定同一 `id`、`revision`、`kinds` 及 `preview`。整曲做到 `next: null`；指定範圍則每頁把 `measureCount` 限於剩餘小節，到目標即停。預覽和實寫皆依這套方式續頁。備忘錄的 `measure`、`beat` 從 1 起，音符的 `start` 從 0 起，單位為四分音符。

按各頁 `counts` 及逐拍 `entries` 回報已寫入（applied）、內容相同（unchanged）及有問題的小節與拍位。tooLong 表示超過每拍 400 個 UTF-16 單位，保留原文字；conflict 表示有同時編輯，重讀核對後才重試。無建議的範圍可為空。完成後，可由曲主開啟原曲該拍的私人練習筆記核對。僅有本機檔而無已匯入的原曲時，在本機交付建議。
