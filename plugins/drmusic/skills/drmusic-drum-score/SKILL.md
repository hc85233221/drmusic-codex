---
name: drmusic-drum-score
description: 將鼓譜照片或 PDF 轉成 DrMusic 爵士鼓譜，保留段落、同拍鼓鈸、符頭與休止。可製作帳號專用 .drmd，或將鼓譜匯入使用者自己的樂譜室。
---

# DrMusic 鼓譜

先辨明使用者要看懂原稿、製作專用檔，還是匯入曲庫。只給參考範例時，說明能讀出的記譜方式及待確認處即可。製作資料時依[鼓譜格式與自編示例](references/drums.md)。

## 朋友分享的樂譜

使用者要把朋友分享的譜匯入自己的曲庫時，以接收者的 DrMusic 連線呼叫 `drm_import_exchange({url})`，傳入完整的 AI 交換連結。收到 .drm 檔先看檔首；DRMX1. 是可跨帳號匯入的交換檔。觀看連結與原圖另有用途，詳見[分享連結與檔案辨識](../drmusic-score/references/exchange.md)。

## 從原稿讀節奏

1. 將每頁轉到標題、段落文字和頁碼正讀的方向，按原頁碼排序，對照跨頁的段落、小節線及反覆記號。檔名與傳送次序都可能和演奏順序不同。重複、缺頁或裁邊影響演奏順序時，指出相鄰的頁與小節。
2. 先記拍號、小節界線、段落、弱起及明示速度，再按譜表位置、符頭、符幹方向、連桿、附點與休止讀各聲部。小節內用四分音符為一拍，遇同步的鼓、鈸或踏板，在同一個起點各記一擊。區分「符頭畫叉」與「整段劃掉」；區分顯式休止、單一聲部的間隙、空白稿紙。
3. 依[DrMusic 共用鼓件圖例](references/drum-legend.json)的譜位、符頭及附標辨認音色。未附圖例的標準鼓譜可直接採用這份對照。原稿另有圖例、明確標籤或曲主指定時，依該來源覆寫，將例外及適用範圍記一次。讀得出鼓件的手繪譜仍填標準 instrument；原圖可辨的 head、staffStep、markAbove 可另存。符號確實無法對應時才填 unknown，留下可讀的形狀與位置、保持靜音。
4. 原稿的「>」在它所修飾的擊點填 `accent: true`。同拍其他聲部各自核對。重複節奏、力度或譜位已由結構記錄時，省去逐擊的解說。sourceNotes 只保留需要讀者知道的原稿文字、例外或疑義；同類集中並給能找到的頁、節、拍。
5. 已註明跳過的稿段只留下來源註記。可辨的完整空小節按實際長度保留；無法判斷長度的空白或划除處，不增加演奏時間。未標速度就省略 BPM。對照每段首尾與過門，逐聲部核對起點、時值、同拍擊數、明示休止和小節長度，再告知使用者哪些位置仍然靜音待確認。

## 製檔與匯入

使用已登入的 DrMusic 連線。本機橋接器先以 `drm_connect` 配對，讓曲主在同機瀏覽器確認目的帳號。

- 「只做成鼓譜檔」使用 `drm_package_drum_score({score,requestId})`。解析回傳內容，將完整 `package` 原樣寫成 UTF-8，用回傳的 `filename` 交付 .drmd。這一步就能完成製檔。
- 「把這個 .drmd 匯入」讀取指定檔案的完整封裝字串，去除首尾空白，以原簽發帳號呼叫 `drm_import_drum_package({package})`。若同時要求製檔及匯入，先保留要交付的檔案，再匯入同一封裝。
- 「把這張鼓譜加到我的樂譜室」可直接用 `drm_publish_drum_score({score,requestId})`。同一次操作重試時沿用相同參數與 requestId。成功後交付該曲 ID 及網址，可用 `drm_list_scores` 核對 `kind: "drums"`、小節數與可播放擊數。若回覆 `duplicate: true`，交付已存在的那一份。

## 校訂既有鼓譜

只補重音時，讀回曲主原曲的最新 revision 與 hits，核對同拍的鼓件與聲部，再用 `drm_correct_drum_score({id,revision,hitMarks:[{measure,hitIndex,accent:true}]})`。measure 從 1 起，hitIndex 是這一版小節 hits 中從 0 起的索引。此模式單獨送 hitMarks；若 revision 已變，重新讀譜定位。

曲主授權校訂整份鼓譜時，以原 ID 及服務讀回的最新 revision 呼叫 `drm_correct_drum_score({id,revision,measures,sourceNotes?})`。measures 須含完整核對後的所有小節；原註記要保留時可省略 sourceNotes。收到版本衝突或回覆中斷時，先讀回同一 ID 核對。確認擊點、重音、來源形狀與休止都正確後交付原曲連結。
