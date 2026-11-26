# DrMusic 吉他和弦譜 v1

以此結構傳入吉他工具的 score 欄位。下方是自編的定位範例。

```ts
type GuitarScore = {
  kind: 'guitar'
  title: string
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
      chords: { at: number, symbol: string, duration?: number }[]
      annotations?: { at: number, text: string }[]
    }[]
  }[]
}
```

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

## 工具與讀回

| 入口 | 輸入 | 成功回傳 |
| --- | --- | --- |
| `drm_package_guitar_score` | `{score:GuitarScore,requestId?:string}` | `{filename,package}`；將完整 DRMG1 字串原樣存成 UTF-8 的 .drmg 檔。製檔不新增曲庫資料。 |
| `drm_import_guitar_package` | `{package:string}` | `{id,url,duplicate}`；只接受同帳號簽發的 .drmg。 |
| `drm_publish_guitar_score` | `{score:GuitarScore,requestId?:string}` | `{id,url,duplicate}`；儲存並回傳 `/?score=<id>` 絕對網址。 |

讀取工具結果的 content[0].text。若 isError 為 true，向使用者說明原因。核對成功結果的網址與 ID。請保留原譜的全文位置，包括連續空白。
