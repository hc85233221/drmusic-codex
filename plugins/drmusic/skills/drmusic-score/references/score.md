# 鋼琴轉錄格式 v1

`score` 包含 title、bpm、timeSignature 與 measures。composer、key 可省略。bpm 為每分鐘四分音符數（30–240，可含小數，例如 77.5），timeSignature 是全曲預設拍號，如 [3,4] 或 [6,8]。若原譜另標局部拍號，以該小節的 timeSignature 記錄；下一小節省略時回到全曲預設。若同一局部拍號持續數節，每節都填寫。

每個 measure 有 notes 陣列。每個音符包含 MIDI 音高 midi（整數 0–127，中央 C 是 60）、hand（left 或 right）、從本小節起算的 start，以及 duration。時間皆以四分音符為 1 拍，八分音符為 0.5。和弦用數個相同 start 的音符，休止以時間空隙表示。空小節保留空陣列。跨小節連結線合成起音所在小節的一個長音，後段不重複發音。正常小節長度為有效拍號的分子 × 4 ÷ 分母。弱起或不規則小節以 measure.duration 記錄實際四分音符拍數，例如半拍弱起填 0.5，第一音仍從該小節實際起點計算。把各小節實際長度相加即可得到後續小節的起點。反覆與一、二房依演奏次序展開。

原件另有排版用音符時，可用每小節的 notationNotes 保存書寫譜，播放繼續使用 notes。書寫音同樣使用 midi、hand、start、duration，另可保留從 0 起算的整數 voice。書寫時值限定在小節內，跨小節按原譜分段。有書寫資料才填此欄；顯式空陣列表示此小節譜面全休止。

例如下列自創單小節用左右手同時起音，右手第二拍再彈 E。
```json
{"title":"一小節試音","bpm":84,"timeSignature":[2,4],"measures":[{"notes":[{"midi":48,"start":0,"duration":2,"hand":"left"},{"midi":60,"start":0,"duration":1,"hand":"right"},{"midi":64,"start":1,"duration":1,"hand":"right"}]}]}
```

每份譜使用一個基準速度。若原譜有多段變速，交代採用的練習速度，或依使用者選擇分段。最多 1,024 小節、16,000 個音符及 600 KiB 樂譜 JSON。requestId 可使用 UUID。drm_publish_score 與 drm_package_score 需要相同的使用者身分。照片、PDF 自身無法提供可播放的音符。
