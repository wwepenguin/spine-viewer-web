# Spine Viewer · Vite + TypeScript

保留 PixiJS **6.3.2**、pixi-spine **3.1.2**、Spine 3.8 素材、Slot 側邊選取標示、動畫多軌、WebP 和性能面板。**Premultiplied alpha 預設關閉**。

## 開發

安裝 Node.js 22.12 以上版本（已用 Node 24 驗證），在此資料夾執行：

```sh
npm ci
npm run dev
```

開啟 http://127.0.0.1:8768/ 。Vite 提供 CSS 熱更新；TypeScript 模組修改會自動重新載入頁面。重新載入後需重新選取本機素材。

```sh
npm run typecheck   # TypeScript strict 型別檢查
npm test           # 素材解析與實際 Spine 多軌測試
npm run format     # Prettier 格式化
npm run format:check
npm run build      # 先做型別檢查，再產生 dist/
npm run preview    # 在 http://127.0.0.1:8769/ 預覽正式產物
```

Vite 僅轉譯 TypeScript，因此 build 指令包含獨立的 tsc 檢查，參見 [Vite 文件](https://vite.dev/guide/features.html#typescript)。`package-lock.json` 應提交版本控制，團隊與 CI 使用 `npm ci`。

## 程式結構

| 檔案                       | 修改位置                                      |
| -------------------------- | --------------------------------------------- |
| `index.html`               | 面板與控制項的 HTML                           |
| `src/main.ts`              | 介面事件、清單、播放控制及初始化              |
| `src/animation-tracks.ts`  | 多軌設定、混合、同步定位及姿勢重建            |
| `src/frame-step.ts`        | 逐幀定位與幀邊界計算                          |
| `src/timeline-viewport.ts` | 純函式狀態：時間軸連續縮放、平移與指針定位    |
| `src/sequence-editor.ts`   | 同軌序列編輯、排序與 Mix in 控制              |
| `src/track-panel.ts`       | 下方時間軸、動畫區塊、拖曳與鍵盤定位          |
| `src/viewer.ts`            | Pixi 場景、動畫、Slot 幾何與標示              |
| `src/catalog.ts`           | 純函式：檔案分類、atlas 配對、貼圖路徑        |
| `src/assets.ts`            | File API、圖片解碼、骨架 parser、範例載入     |
| `src/performance.ts`       | FPS、CPU、實際 WebGL Draw Calls、Mem          |
| `src/runtime.ts`           | 舊版 pixi-spine 跨 runtime 型別相容層         |
| `src/types.ts`             | 共用資料模型與公開介面                        |
| `src/dom.ts`               | HTML ID 對應的元素型別；增加控制項時同步更新  |
| `src/webmcp.ts`            | 選用的 WebMCP 工具，不影響一般瀏覽器          |
| `src/styles.css`           | 樣式、響應式介面                              |
| `public/sample/`           | 官方 Spineboy 3.8 範例，含 JSON / SKEL / WebP |
| `tests/`                   | 使用 Node test runner 的 TypeScript 測試      |

程式使用 ES module import/export，沒有全域 PIXI、SpineIO 或 script 載入順序依賴。`strict: true`，沒有 `@ts-nocheck`；舊套件未完整宣告的成員集中於 `runtime.ts`，以具體介面描述，第三方 `.d.ts` 使用 `skipLibCheck`。

`package.json` 的 overrides 刻意鎖住 @pixi/_ 6.3.2 及 @pixi-spine/_ 3.1.2。舊 Spine peer dependency 範圍較寬，未鎖定可能裝到另一套 Pixi 核心，導致 renderer 與 Spine 使用不同類別。升級套件時請一起檢查這些設定。

## 使用與部署

按「開啟素材」一次選取 JSON／SKEL、atlas 與所有 PNG／WebP，或使用資料夾／拖放。Slot 可搜尋、選取並在動畫中跟隨標示。素材仍只在瀏覽器記憶體處理，不傳到伺服器。

性能面板包含 Draw Calls 平均／最高值、JS Heap 和 RGBA 貼圖記憶體估算；估算不等於完整 GPU 用量。CPU 計時不含 GPU 非同步執行。動畫暫停時 renderer 仍持續繪圖。

將 `dist/` 整個資料夾部署到靜態 HTTP 伺服器即可；`base: './'` 支援子路徑。本專案的開發頁與打包產物使用 ES modules，**請透過 HTTP 開啟，不使用雙擊 HTML**。先前交付的純 HTML 離線包仍可另外保留。

Vite build 附 source map 供除錯；若不想發布原始碼，將 `vite.config.ts` 的 `build.sourcemap` 設成 `false` 後重新打包。pixi-spine 含多個 runtime，正式 JS bundle 較大屬預期；不任意裁掉 runtime 以維持既有相容範圍。

## 多軌時間軸

畫面下方提供 Track 0–5。Track 0 選 `walk`、Track 1 選 `shoot`，可同時預覽行走與射擊。各軌都有動畫選單、Loop 與清除按鈕；點 T0–T5 選擇編輯軌道，再到側欄「Selected track settings」調整速度、權重及 Additive。切換選取軌道不會停止其他軌道；清除一軌也會保留其他軌的時間。

- 所有動畫區塊以 0 秒為共同起點；更換動畫會從頭預覽整個組合。
- 共用時間軸以最長的有效動畫長度（動畫秒數 ÷ 軌道速度）為一輪；有播放中的軌道開啟 Loop 時，抵達結尾會回到 0，所有軌道一起重新播放。全部關閉 Loop 時停在結尾。零長度動畫與速度 0 的軌道不會延長一輪。
- 拖曳刻度或播放指針會暫停，並同步定位所有軌道。各軌動畫時間等於共用時間 × 該軌速度；全域播放速度則影響共用時鐘前進速度。
- 每個序列段落只顯示一次；開啟 Loop 時在最後一段顯示 ↻ Loop 標記，不會向後排列重複區塊。未開 Loop 的軌道會維持最後姿勢；0 秒動畫或速度 0 顯示為持續的姿勢區塊。
- 滾輪以游標位置為中心連續縮放（可見範圍 0.1–300 秒），也可按 −／+ 縮放；Fit 顯示各軌的一輪動畫。
- 在軌道區拖曳可自由平移；Shift + 拖曳、中鍵拖曳、Shift + 滾輪或觸控板水平捲動也可平移。平移與縮放不改變播放時間、暫停狀態或動畫內容。
- 手動平移或縮放會關閉 Follow，選軌和播放時不會將視窗拉回；按 Follow 恢復跟隨播放指針。
- 所有介面、提示、錯誤與無障礙標籤均為英文。Play／Pause 使用 SVG 圖示。
- 聚焦刻度後，左右鍵逐幀移動（依 Frame step FPS 設定），Shift + 左右鍵移動 1 秒，Home 回到 0 秒，End 到目前視窗結尾。
- 較高軌道會覆蓋相同的關鍵幀屬性，未設關鍵幀的部位繼續使用低軌動畫。

### 逐幀預覽

- Play 兩側的 **Previous frame / Next frame** 使用 SVG 圖示，會先暫停再同步定位所有軌道。
- 鍵盤 **< / >**（Shift + 逗號／句號）分別後退／前進一幀，也支援直接按 **, / .**。按住可連續步進。
- **Frame step FPS** 可選 24／30／60，預設 30。F 顯示目前幀數，時間顯示至毫秒。此設定只影響逐幀定位，不限制畫面渲染 FPS。
- 逐幀以共用時間軸為基準，對齊幀邊界；全域播放速度不影響步距，各軌仍依軌道速度計算姿勢。邊界停在 0 或序列結尾，不循環跳轉。
- 輸入框、下拉選單、可編輯文字及序列編輯器內不觸發全域逐幀快捷鍵。

### 同軌動畫序列與 Mix in

1. 按軌道旁的 **+**（Edit sequence），或雙擊該軌動畫區塊。
2. 用 **Add animation → Add clip** 依序加入 `walk → run → idle`。
3. 設定每段 **Mix in (s)**，例如 run=0.2、idle=0.2；第一段為 0。可用 ↑／↓ 排序、× 移除。
4. 關閉編輯器，按 **Fit** 看完整序列，再按 Play 預覽。金色斜紋區域代表 Mix in，滑鼠停留可查看秒數。

Mix in 會與前一段尾端重疊，序列長度為所有動畫長度減去混合區間。Mix in 以動畫秒數設定，會隨軌道速度一起縮放；過長數值會限制於兩段可用長度，避免三段同時混合。每軌最多 64 段，可使用重複的動畫名稱與零秒姿勢動畫。

更改序列會讓所有軌道回到 0，並保留原本播放／暫停狀態。序列中間的動畫不會單獨 Loop；較短序列結束後保持最後姿勢，整個預覽到最長序列結尾時依 Loop 設定一起重播。單段軌道仍可持續循環。拖曳定位、前後跳轉會重建對應時間的混合姿勢。

軌道動畫下拉選單／側欄動畫列表會將該軌替換成單段動畫；追加動畫請使用序列編輯器。尚未提供拖移片段起點、裁切動畫或保存序列專案檔。

## 第三方授權

PixiJS：MIT；pixi-spine：Spine Runtimes License。全文及 Spineboy 範例授權保留於 `public/licenses/`，打包時複製到 `dist/licenses/`。範例來自 [Esoteric Software spine-runtimes 3.8](https://github.com/EsotericSoftware/spine-runtimes/tree/3.8/examples/spineboy)。相容性主要驗證 Spine 3.8.55，其他版本依固定 runtime 能力。

## GitHub Pages 自動部署

GitHub Actions 工作流程位於 `.github/workflows/pages.yml`。每次推送 `main`，先執行 `npm ci`、格式檢查、測試及 TypeScript 檢查，再將 Vite `dist/` 部署到 Pages。也可以在 Actions 頁面手動執行。

儲存庫 Settings → Pages → Source 使用 **GitHub Actions**。部署時以 `PAGES_BASE_PATH` 自動設定儲存庫子路徑；本機開發仍使用 `./`。不需要把 `dist/` 或 `node_modules/` 提交 Git，也不需要在程式碼中放 GitHub Token。
