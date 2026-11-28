# DrMusic 吉他和弦譜 v1

以此結構傳入吉他工具的 score 欄位。下方是自編的定位範例。

```ts
type GuitarScore = {
  kind: 'guitar'
  title: string
  youtubeUrl?: string
  artist?: string
  composer?: string
  lyricist?: string
  arranger?: string
  originalKey?: string
  chartKey?: string
  bpm?: number
  timeSignature?: [number, number]
  capo?: number
  annotations?: string[]
  sections: {
    label?: string
    annotations?: string[]
    lines: {
      type: 'lyric' | 'instrumental' | 'annotation'
      text: string
      chords: { at: number, symbol: string, duration?: number, keyChange?: string }[]
      annotations?: { at: number, text: string }[]
    }[]
  }[]
}
```

- `youtubeUrl` 是選填的 YouTube 單支影片網址，位於 score 頂層，可使用含影片 ID 的 watch 網址或 youtu.be 短網址。播放清單、頻道與搜尋結果頁無法指定單支影片。沒有可靠網址時省略，既有 .drmg 可原樣匯入。
- `originalKey` 記原唱的原調，`chartKey` 記譜面和弦的按法調。保留原譜拼字，例如 `B♭`、`G#m`、`Bb/D`；只有來源明示才填入。速度為 10–400 BPM 的整數，Capo 為 0–24 格的整數。拍號分子為 1–32，分母可用 1、2、4、8、16 或 32。缺資料就省略欄位，Capo 0 代表已知不夾。
- `at` 為該列原文從零起算的 **Unicode code point 邊界**，含空格，範圍為 0 至 `Array.from(text).length`，尾端可放和弦。各陣列按位置非遞減排列，同位置保留輸入順序。文字不修剪、不正規化。純和弦列可用空字串、依序放在 0，或以空格和小節線記錄版面間距。索引不是拍點。
- `duration` 僅在譜面標明時填，單位為四分音符拍，正有限數。沒有旋律的譜不含 MIDI 音符、左右手或小節音符陣列。
- 紙本原有的重複、刷法等記號，可放在整首或段落的 `annotations`，行內註記以 `{at,text}` 定位，也可用獨立 `annotation` 列保留原行。段落與行依輸入順序顯示。空行允許，整份譜至少含一個和弦。
- 曲名與署名最多 180 個 Unicode code points，調性與和弦各 60。全曲最多 128 段、2,048 行、16,000 個和弦；每行文字最多 2,048 個 code points。每組註記最多 64 個，每則最多 512 個 code points。單份正規 JSON 上限 600 KiB。

```json
{
  "kind": "guitar",
  "title": "和弦定位練習",
  "originalKey": "B♭",
  "chartKey": "G",
  "bpm": 84,
  "sections": [{
    "label": "A",
    "annotations": ["第二次輕刷"],
    "lines": [
      {"type":"instrumental","text":"|   |","chords":[{"at":1,"symbol":"G"},{"at":4,"symbol":"D/F#"}]},
      {"type":"lyric","text":"輕輕  唱","chords":[{"at":0,"symbol":"G"},{"at":4,"symbol":"Em7"}],"annotations":[{"at":5,"text":"×2"}]}
    ]
  }]
}
```

## 框內級數與換調

將原稿和弦原樣存成 `chords[].symbol`；可用字母、羅馬數字或方框阿拉伯數字。旋律、休止與其他文字留在原行的 text 或 annotations。讀取全曲 `chartKey`，缺省時僅在沒有非零 Capo 且 originalKey 是單一明確的調時借用。局部換調在**第一個已採用新調的和弦**填 `keyChange`，延續至下一處換調，跨行跨段均沿用。轉調提示位於歌詞或休止時可加行內註記定位。建議男調、女調另入 annotations。

自編例：初始 C 大調，框內依次是 `1`、`5/7`、`1`，從第二框開始改用 D 大調。對應普通和弦為 C、A/C#、D；前兩框之間若有旋律 3、2、1，只按原稿保存於旋律文字。第二框示意為 `{"at":4,"symbol":"5/7","keyChange":"D"}`。即使兩框的 at 相同，也按陣列順序套用換調。只有來源能確認的時值才填 duration。

大調沿大音階定位，小調沿自然小音階定位。阿拉伯數字裸級數代表以該音為根音的大三和弦，小三和弦用 m；羅馬級數保留大小寫。兩個相連的數字可能是根音與延伸音，如 `57sus`；斜線後的低音也要依同一調的音階計算。以下各列為獨立自編例。

| 框內 | 生效調 | 普通和弦 | 讀法 |
| --- | --- | --- | --- |
| 5m/7b | F | Cm/Eb | 第五級的小三和弦，低音是第七級 E 再降半音 |
| 6bM7 | G | Ebmaj7 | 第六級 E 降半音，保留大七和弦 |
| 57sus | D | A7sus4 | 第五級的屬七掛四 |
| 4#Ø | E | A#m7b5 | 第四級 A 再升半音，保留半減七 |
| 3# | D | F## | 第三級 F# 再升半音；保留升三級的拼法 |

在 Skill 目錄執行 `node scripts/read-chords.mjs "/path/to/score.json"`，列出每個已轉錄和弦所在段、行、字位、生效調、原符號、字母和弦與級數。工具使用和網站相同的轉換程式，只讀取 chords 陣列。遇到 null，可按輸出的座標回看符號或確認按法調；譜面的 symbol 繼續保留原文。

曲主要校訂已存在的吉他譜時，用 `drm_get_guitar_score({id})` 讀取正確曲目及其目前的 revision，呼叫 `drm_correct_guitar_score({id,revision,sections,chartKey?,originalKey?,annotations?})`，sections 帶完整核對後的段落。讀回同一 ID 比對和弦數、順序、調性與歌詞對位。遇到 409 須重新讀回版本。

## 工具與讀回

| 入口 | 輸入 | 成功回傳 |
| --- | --- | --- |
| `drm_package_guitar_score` | `{score:GuitarScore,requestId?:string}` | `{filename,package}`；將完整 DRMG1 字串原樣存成 UTF-8 的 .drmg 檔。製檔不新增曲庫資料。 |
| `drm_import_guitar_package` | `{package:string}` | `{id,url,duplicate}`；只接受同帳號簽發的 .drmg。 |
| `drm_publish_guitar_score` | `{score:GuitarScore,requestId?:string}` | `{id,url,duplicate}`；儲存並回傳 `/?score=<id>` 絕對網址。 |

讀取工具結果的 content[0].text。若 isError 為 true，向使用者說明原因。核對成功結果的網址與 ID。請保留原譜的全文位置，包括連續空白。
