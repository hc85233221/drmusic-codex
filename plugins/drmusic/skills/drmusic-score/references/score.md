# 鋼琴轉錄格式 v1

`score` 包含 title、bpm、timeSignature 與 measures。composer、key 可省略。bpm 為每分鐘四分音符數（整數 30–240），timeSignature 是一組拍號，如 [3,4] 或 [6,8]。每小節的長度是分子 × 4 ÷ 分母個四分音符拍。

每個 measure 有 notes 陣列。每個音符包含 MIDI 音高 midi（整數 0–127，中央 C 是 60）、hand（left 或 right）、從本小節起算的 start，以及 duration。時間皆以四分音符為 1 拍，八分音符為 0.5。和弦用數個相同 start 的音符，休止以時間空隙表示。空小節保留空陣列。跨小節連結線合成起音所在小節的一個長音，後段不重複發音。弱起小節以開頭休止對齊。反覆與一、二房依演奏次序展開。

例如下列自創單小節用左右手同時起音，右手第二拍再彈 E。
```json
{"title":"一小節試音","bpm":84,"timeSignature":[2,4],"measures":[{"notes":[{"midi":48,"start":0,"duration":2,"hand":"left"},{"midi":60,"start":0,"duration":1,"hand":"right"},{"midi":64,"start":1,"duration":1,"hand":"right"}]}]}
```

V1 一份譜使用單一拍號與速度。遇到變拍或變速，說明影響並請使用者選擇分段或簡化。最多 1,024 小節、16,000 個音符及 600 KiB 樂譜 JSON。requestId 可使用 UUID。drm_publish_score 與 drm_package_score 需要相同的使用者身分。照片、PDF 自身無法提供可播放的音符。
