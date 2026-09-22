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
