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
