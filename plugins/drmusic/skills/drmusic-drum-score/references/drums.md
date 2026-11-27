# 爵士鼓譜格式

鼓譜的 `kind` 是 `"drums"`，另有曲名 `title` 與依演奏順序排列的 `measures`。可附已知的 `artist`、`composer`、`bpm`、`timeSignature`。BPM 是四分音符每分鐘拍數，可用 10–400 內的小數。拍號寫成例如 `[6,8]`，其小節長度為 3 個四分音符。

每小節必有 `hits` 陣列。段落起點用 `section`。小節長度依序取該小節的 `duration`、該小節的 `timeSignature`、全曲拍號；局部拍號只對本小節生效。原譜缺拍號但可核對長度時，填入實際長度。每筆擊與休止的 `start` 自本小節 0 起算，`duration` 為正數書寫時值，兩者皆以四分音符為單位且事件須落在小節內。例如 6/8 的最後一個八分音符從 2.5 開始，時值為 0.5。

| 資料 | 寫法 |
| --- | --- |
| 打擊 | 每擊一筆 `{start,duration,instrument}`。同拍不同鼓件保留相同 start。聲部 `voice` 可填 1–8。 |
| 鼓件 | `kick` 大鼓、`snare` 小鼓、`rim` 鼓邊、`tomHigh`／`tomMid`／`tomLow`／`floorTom` 各通鼓、`cowbell` 牛鈴。 |
| 鈸與踏板 | `crash1`／`crash2` 對應已分號的兩面 Crash，同在上加一線；未分號用 `crash`。 `hiHatClosed`／`hiHatOpen`／`hiHatPedal`、`ride`／`rideBell`、`crash`、`splash`、`china`。 |
| 書寫位置 | `head` 可用 `normal`、`cross`、`circleCross`、`diamond`、`slash`、`star`。最下線 staffStep 為 0，每往上一間或一線加 1，可填 −16 至 24。鼓件不明用 `unknown`，可呈現在譜上，播放時靜音。 |
| 上方附標 | 叉頭上方另有空圈用 `{"head":"cross","markAbove":"openCircle"}`。圈住叉用 `{"head":"circleCross"}`，星形用 `{"head":"star"}`。依[共用圖例](drum-legend.json)辨認鼓件。圈住叉、星形等有明確來源對照時保留對應音色；無法辨認的符號用 unknown。 |
| 重音 | 在原稿「>」對應的擊點填 `accent: true`。同拍不同擊可以有各自力度，普通擊可省略此欄。 |
| 明示休止 | 小節的 `rests` 內記 `{start,duration,voice?}`。單純空隙保持無事件；有小節線與已知長度的空小節使用 `hits: []`。 |
| 原稿註記 | 全曲 `sourceNotes` 內記 `{status,text,page?,measure?,start?}`。status 用 `text` 表原文、`uncertain` 表疑義、`skipped` 表略過。頁與小節從 1 起算，start 需搭配 measure。註記會隨樂譜分享，只寫適合讀者看到的資訊。 |

以下自編的兩小節為 2/4。第一小節的第一拍同時擊大鼓和帶重音的閉鈸，第二拍全休止；第二小節為通鼓過門。

```json
{
  "kind": "drums",
  "title": "兩小節鼓點練習",
  "timeSignature": [2, 4],
  "measures": [
    {"section":"主節奏","hits":[
      {"start":0,"duration":1,"instrument":"kick","voice":2},
      {"start":0,"duration":1,"instrument":"hiHatClosed","head":"cross","staffStep":9,"accent":true,"voice":1}
    ],"rests":[{"start":1,"duration":1}]},
    {"section":"過門","hits":[
      {"start":0,"duration":0.5,"instrument":"tomHigh"},
      {"start":0.5,"duration":0.5,"instrument":"tomMid"},
      {"start":1,"duration":1,"instrument":"floorTom"}
    ]}
  ]
}
```

同一份譜上限 1,024 小節、16,000 個擊與休止合計、1,024 則來源註記與 600 KiB JSON。只見劃除或位置不明的稿段時，保留私人草稿；只有來源註記而無小節無法製成 .drmd。
