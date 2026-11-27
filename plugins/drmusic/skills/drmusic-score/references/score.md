# 鋼琴轉錄格式 v1

`score` 包含 title、bpm、timeSignature 與 measures。composer、key 可省略。bpm 為每分鐘四分音符數（30–240，可含小數，例如 77.5），timeSignature 是全曲預設拍號，如 [3,4] 或 [6,8]。若原譜另標局部拍號，以該小節的 timeSignature 記錄；下一小節省略時回到全曲預設。若同一局部拍號持續數節，每節都填寫。

每個 measure 有 notes 陣列。每個音符包含 MIDI 音高 midi（整數 0–127，中央 C 是 60）、hand（left 或 right）、從本小節起算的 start，以及 duration。時間皆以四分音符為 1 拍，八分音符為 0.5。和弦用數個相同 start 的音符，休止以時間空隙表示。空小節保留空陣列。跨小節連結線合成起音所在小節的一個長音，後段不重複發音。正常小節長度為有效拍號的分子 × 4 ÷ 分母。弱起或不規則小節以 measure.duration 記錄實際四分音符拍數，例如半拍弱起填 0.5，第一音仍從該小節實際起點計算。把各小節實際長度相加即可得到後續小節的起點。反覆與一、二房依演奏次序展開。

原件另有排版用音符時，可用每小節的 notationNotes 保存書寫譜，播放繼續使用 notes。書寫音同樣使用 midi、hand、start、duration，另可保留從 0 起算的整數 voice。書寫時值限定在小節內，跨小節按原譜分段。有書寫資料才填此欄；顯式空陣列表示此小節譜面全休止。

每小節可用 `notationMarks` 保存原稿記號。起點含從 0 起算的 `start`、`hand`，可附書寫層的 `voice` 或單音的 `midi`。重音、強重音、斷奏、保持音、延長記號的 type 依序為 accent、marcato、staccato、tenuto、fermata。休止也可標 fermata。上下位置可讀時才填 `placement: "above" | "below"`。

同音延音線用 tie，圓滑線用 slur。起點存在包含它的小節，終點 `end` 包含從 1 起算的絕對小節號、該小節內起拍與手別，可跨行、跨節或跨譜表。tie 要指定兩端相同的 MIDI；slur 保留兩端的實際音高。以下原創例從第 1 小節最後一拍連至第 2 小節第一拍，存於第 1 小節：

```json
{"type":"tie","start":3,"hand":"right","midi":62,"end":{"measure":2,"start":0,"hand":"right","midi":62}}
```

依原圖明示的線條或可靠的原始書寫資料記錄。播放時值、重複音高本身不足以確定原稿有線；跨頁或跨行仍是一個記號。演奏 notes、排版 notationNotes 與原稿 notationMarks 各自保留。

其他可核對的原稿記號共用同一錨點：

| 原稿 | notationMarks 寫法 |
| --- | --- |
| 單拍漸強漸弱 | 原稿同一音上的小形「<>」（espressivo）用 `type: "espressivo"`，定位該音的起拍，省略 end；跨拍漸強或漸弱不可縮成此記號。 |
| 強弱 | `type: "dynamic"`，value 保留 pp、p、mp、mf、f、ff 或 sfp。 |
| 上下波音、琶音線 | 依原件的 ornament 種類保留 `mordent` 或 `mordentInverted`；明示琶音線用 `arpeggio`。 |
| 倚音 | `type: "grace"`，附 `graceNotes: [{pitches:[62],value:"16"}]`；pitches 是同時發聲的 MIDI，value 可用 "8" 或 "16"。依原稿次序記在主音錨點，不占用額外拍位。 |
| 八度標示 | `type: "octaveShift"`，octaves 用 1、2（8va、15ma）或 −1、−2（8vb、15mb）。單音省略 end；跨事件標示依實際起訖指定同手的 end，含末音。保留原 MIDI；顯示時才換算為 MIDI − 12 × octaves。 |

若原稿印有和弦或歌詞，可在小節加入 `chords: [{start,symbol}]`、`lyrics: [{start,text,verse?}]`。起點以本小節的四分音符拍數計算，須小於小節的實際長度。保留原稿的和弦拼法、歌詞文字及同拍順序。分段歌詞以從 1 起算的 verse 對齊，省略即第一段。只填能從來源核對的內容。

例如下列自創單小節用左右手同時起音，右手第二拍再彈 E。
```json
{"title":"一小節試音","bpm":84,"timeSignature":[2,4],"measures":[{"notes":[{"midi":48,"start":0,"duration":2,"hand":"left"},{"midi":60,"start":0,"duration":1,"hand":"right"},{"midi":64,"start":1,"duration":1,"hand":"right"}]}]}
```

每份譜使用一個基準速度。若原譜有多段變速，交代採用的練習速度，或依使用者選擇分段。最多 1,024 小節、16,000 個音符及 600 KiB 樂譜 JSON。requestId 可使用 UUID。drm_publish_score 與 drm_package_score 需要相同的使用者身分。照片、PDF 自身無法提供可播放的音符。
