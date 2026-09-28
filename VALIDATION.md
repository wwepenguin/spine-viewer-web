# 驗證記錄

2026-09-22，Windows / Node.js 24.14.1 / npm 11.11.0。

- TypeScript strict、noUnusedLocals、noUnusedParameters 檢查通過。
- 3 個 TypeScript 測試通過：atlas 相對路徑優先、重複與遺失貼圖、中文名稱與二進位副檔名。
- Prettier 格式檢查通過。
- Vite 8.3.0 正式打包成功，附 source map。JS 約 907 kB（gzip 約 243 kB），主要為指定的 Pixi 與多版本 Spine runtime；保留大 chunk 提示。
- npm dependency tree 中 @pixi/core 皆使用 6.3.2，@pixi-spine/base 皆使用 3.1.2，沒有混用 Pixi 核心。
- Vite 開發伺服器：JSON + WebP 範例、head Slot 高亮、多軌 shoot 定位 0.2 秒及 PMA 預設未勾選正常。
- Vite 正式預覽：本機 SKEL + atlas + WebP 載入 Spine 3.8.55，52 slots、11 animations；head Slot 高亮 122 個座標值。
- 性能面板顯示 FPS、CPU、Draw Calls、JS Heap 及貼圖估算；一般 walk 場景為 1 draw call/幀。
- 不存在的動畫輸入被拒絕，瀏覽器未出現 console error。

本次遷移保留既有介面與功能；未聲稱所有 Spine 版本／瀏覽器／constraint 組合皆通過驗證。此 ES module 版本需 HTTP 伺服器。

交付資料夾另以 npm ci 重新安裝成功，接著重新執行 test、build、format:check 均通過。


## 多軌時間軸（2026-09-22）

- 使用實際 Spine 3.8 AnimationState 的 6 項動畫測試，加上既有 3 項素材測試，共 9 項通過。
- 驗證兩軌同時更新不同骨骼、較高軌道覆蓋與權重、独立 Loop／速度、Additive 重建、清除單軌及共用時間軸前後定位。
- 瀏覽器實測 Track 0 walk + Track 1 shoot；共用時間 1 秒、Track 1 速度 0.5 時，動畫時間分別為 1 秒與 0.5 秒。
- 以滑鼠拖曳到 2.5 秒，兩軌時間分別為 2.5 與 1.25 秒；關閉 Track 1 Loop 顯示單次區塊，清除後 Track 0 時間保持 2.5 秒。
- 1280×720 介面確認六軌時間軸位於底部、播放指針與區塊對齊；英文 Performance 與 PMA 預設關閉保留。瀏覽器無 console error。


## 連續縮放／平移與英文介面（2026-09-22）

- 12 項測試通過，新增游標錨點縮放、連續平移、零點邊界、缩放上下限與指針重新定位。
- 瀏覽器以實際滾輪將 4 秒範圍縮至約 1.947 秒，游標下的 2.5 秒保持不變。
- 在軌道拖曳 400 px，視窗起點由約 1.526 秒移至 2.305 秒，播放時間維持 0；切換選取軌道後視窗起點保持不變。
- 拖曳刻度後 walk／shoot 都定位到 3.318 秒；Play／Pause 的 SVG path 隨狀態切換。
- 頁面 lang=en，內建文字無中文字元，素材名稱原樣保留；瀏覽器無 console error。


## 同軌序列與 Mix in（2026-09-22）

- 實際 Spine 3.8 runtime 驗證混合骨骼姿勢、前後 seek、連續播放與直接定位一致、0.5× 軌速下的 Mix in 秒數換算、超長 Mix in 限制與不合法輸入保護。
- 瀏覽器建立 walk → run → idle；run Mix in 0.3、idle Mix in 0.2，驗證排序、移除、獨立修改及雙軌播放。
- 在共用 0.4／0.7／1.3 秒分別處於 walk／run／idle；倒拖至 0.65 秒回到 run。另一軌 shoot 同時保留。
- 時間軸顯示三段動畫及兩個混合區間；英文編輯器、SVG 播放控制、單次區塊 Loop、縮放平移均保留。
- 未加入專案儲存或片段裁切功能；序列設定保存在當前頁面記憶體。

## 逐幀預覽（2026-09-22）

- 新增 SVG 前／後一幀按鈕，支援 < / >（Shift + Comma / Period）及直接 , / .。
- Frame step FPS 可選 24／30／60，預設 30；幀數與毫秒時間同步顯示。
- 21 項測試通過，包含 1,000 次前進／後退無浮點累積偏移、拖曳後幀邊界與起迄限制。
- 瀏覽器驗證 30 FPS：0 → 0.033333 → 0.066667 → 0.033333；切至 60 FPS 後下一幀為 0.05。
- 3× 全域速度下，walk 與 shoot 仍由 0.4 同步逐幀到 0.433333，並自動暫停；搜尋框內鍵入 > 未改變時間。無 console error。

## 側欄折疊（2026-09-22）

- 五個主區域可獨立折疊，SVG 箭頭與 aria-expanded 同步，收合內容離開鍵盤焦點順序。
- 瀏覽器驗證全部收合、Enter 展開 Slots、Space 展開 Animations；搜尋文字、walk 動畫與暫停時間保留。
- Clear 操作不會觸發折疊；無 console error。TypeScript 檢查與正式建置通過。

## 多骨架舞台（2026-09-26，本機）

- 24 項測試通過；新增巢狀資料夾同名 atlas 精確配對、唯一同資料夾 atlas 回退及模糊配對拒絕。
- 瀏覽器透過 Open folder 匯入測試資料夾：hero-a/spineboy.json、hero-b/spineboy.skel 與 broken/missing.json。前兩者同時顯示，第三者列為跳過，貼圖按各自子資料夾配對。
- 將第一個骨架設定 run／0.4 秒、第二個設定 idle／0.6 秒；第二個逐幀至 0.633333 秒時第一個仍維持 0.4 秒。Play all 讓兩個時鐘都推進，Pause all 停止兩者。
- 實測點舞台選取、Stage 清單切換、X 位置修改不影響 Y 精度，以及第二個角色的 head Slot 外框／標示正確跟隨。
- 移除其中一個角色不影響另一個，移除最後一個得到空舞台；Add selected asset to stage 可再加入新實例。
- 全部失敗的資料夾匯入不清除原舞台。兩個 Spineboy 的性能統計為 128 bones／104 slots、2 texture pages，Draw Calls 包含整個舞台。
- TypeScript 檢查與正式建置通過，瀏覽器無 console error。保留固定 PixiJS 6.3.2／pixi-spine 3.1.2、英文 UI 與 PMA 預設關閉。未推送、未部署線上版本。

## 本機音樂與對拍（2026-09-28）

- 31 項測試通過；涵蓋音訊時鐘、暫停／seek／速率、Loop 與自然結尾、非同步 resume／decode 取消、替換失敗保留舊音樂、音量靜音、多聲道波峰，以及不同角色 Start at 映射。
- 使用實際 Spine 3.8 runtime 驗證 Audio-clock sample 經過 Mix in、循環與倒拖，骨骼姿勢與直接定位一致。
- 瀏覽器載入 12 秒 WAV 測試節拍與兩個 Spineboy。第二個角色 Start at=2 時，音樂第 1 秒保持第一幀；波形拖曳至 2.016 秒，第二個角色時間為 0.016 秒。
- > 快捷鍵把 2.016 定位至 2.033333 秒並保持暫停；按 Play 後 AudioContext 時鐘推進。Loop music 跨過 12 秒後繼續循環；關閉 Loop 時音樂停在 12 秒且顯示 Play。
- 匯入損壞 WAV 顯示錯誤並保留原音樂；Remove audio 後角色保留當前姿勢、全部暫停，回復獨立播放。瀏覽器 console 無錯誤。
- TypeScript strict 型別檢查、正式建置、格式檢查通過。音樂波形與六軌在 1280×720 同時可見。
- 本次只更新本機與 ZIP，未推送或部署 GitHub Pages。瀏覽器音訊測試使用靜音控制；沒有宣稱跨裝置的實體音箱延遲或保音高變速已驗證。


## 編排工具與效能優化（2026-09-28，本機）

- 43 項自動測試通過，包含 ZIP 素材去重及音樂／Marker／A–B／鎖定狀態 round-trip、壞檔／缺少檔案／非法時間拒絕、Undo 分支及失敗恢復、延遲軌道的實際 Spine 混合姿势、時間吸附、資源引用計數與偏好驗證。
- 瀏覽器透過 Save project ZIP 匯出兩個 Spineboy、walk → run → idle（Mix in 0.2）、Track start 1.25、Scale 1.2、Rotation 20°、12 秒音訊及 Marker。移除角色與音樂後開啟 ZIP，兩個角色與上述設定完整還原且保持暫停；ZIP 實際包含一組去重的骨架／atlas／貼圖及一份音訊。
- 匯入含不存在動畫的專案，显示明確錯誤，原舞台兩個角色、音樂、3 段序列與 1.25 秒起點均保留。
- 在時間軸實際拖曳序列，起點從 1.25 到 2.516667 秒，保持三段與 Mix in；一次 Undo 回到 1.25。舞台拖曳角色 X 約 551 → 992，Undo 回到原位置。位置輸入的 Redo 亦已實測。
- Scale／Rotation 輸入、Lock transforms 禁用位置控制、音樂 Marker 與 A–B 區間標示、Scene overview 兩列色帶及點選切回角色軌道均已驗證。
- 重複加入同一份角色，WebMCP rendering.texturePages 與性能面板皆維持 1；移除其中一個後另一個角色仍正常顯示。
- 前景頁面暫停後 render 計數長時間固定在 386、Draw Calls 0.0 / 0、0.0 FPS，下一影格使計數變成 387。持續播放會恢复繪圖。性能面板明確區分繪圖 FPS 與更新間隔。
- 重新開啟頁面仍保留 60 FPS、Assets 折疊與 Sidebar width 320px。1280×720 截圖確認新增工具、音樂軌、6 條動畫軌可使用；面板可調大小。
- 固定 PixiJS 6.3.2／pixi-spine 3.1.2、英文 UI、首次使用 PMA 關閉；功能各自有本機 commit。未推送或部署。
- 限制：BPM 手動設定，拖動畫塊移動整條 sequence，尚無任意單段裁切／空隙、音樂混音或影片匯出。Undo 保留最多 40 個狀態且不寫入 ZIP。不同 File 物件不依內容雜湊去重。
