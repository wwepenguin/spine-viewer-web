# Spine Viewer · Vite + TypeScript

保留 PixiJS **6.3.2**、pixi-spine **3.1.2**、Spine 3.8 素材、Slot 側邊選取標示、動畫多軌、WebP 和性能面板。**Premultiplied alpha 預設關閉**。

## 開發

安裝 Node.js 22.12 以上版本（已用 Node 24 驗證），在此資料夾執行：

```sh
npm ci
npm run dev
```

開啟 http://127.0.0.1:8768/ 。Vite 提供 CSS 熱更新；TypeScript 模組修改會自動重新載入頁面。重新載入後可用 Open project ZIP 還原已存檔的素材與編排。

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
| `src/project.ts`           | ZIP 封裝、格式驗證與場景設定快照              |
| `src/project-restore.ts`   | 驗證新素材後替換舞台與音訊                    |
| `src/editor.ts`            | 專案操作與復原交易                            |
| `src/history.ts`           | 有上限的 Undo／Redo 狀態堆疊                  |
| `src/music-tools.ts`       | Marker、BPM 與 A–B 循環介面                   |
| `src/stage-tools.ts`       | 角色變形、顯示、鎖定與圖層介面                |
| `src/transform.ts`         | Slot 幾何的角色座標變換                       |
| `src/resource-pool.ts`     | 非同步資源共用與參考計數                      |
| `src/preferences.ts`       | 本機介面偏好及面板尺寸                        |
| `src/snapping.ts`          | 時間吸附                                      |
| `src/music.ts`             | 本機音樂解碼、音訊時鐘、波形與舞台時間換算    |
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

## 編排專案與操作歷程

- **Project → Save project ZIP** 將目前舞台使用的骨架、atlas、貼圖與音樂包成一份 ZIP，包含角色位置、縮放、旋轉、顯示／鎖定、圖層順序、skin／flip、各軌 sequence／Mix in／Loop／速度／權重／起播時間及音樂標記。重複使用的 File 只打包一次。
- **Open project ZIP** 先解碼音訊、驗證素材及建立角色，再替換舞台；失敗保留原舞台。讀回後一律暫停。ZIP 上限 512 MB、最多 128 個角色。匯入素材本身不是專案格式，請使用 Open assets／Open folder。
- **Undo／Redo** 或 **Ctrl/Cmd+Z、Ctrl/Cmd+Shift+Z、Ctrl+Y** 可回復編排變更，保留最多 40 個狀態。一次拖曳或一次輸入視為一次操作；文字輸入框保留瀏覽器的文字復原。播放／seek 不產生編輯歷程，復原後暫停預覽。操作歷程不寫入 ZIP。
- **Snap** 啟用影格、播放頭與 Marker 吸附；勾 **Beats** 加入節拍吸附。拖曳任一動畫區塊會整串移動該 track 的 sequence，保留 Mix in；**Alt** 暫時略過吸附。每軌起點為角色的局部秒數；有音樂時再加上角色 Start at。此版不提供單一 clip 的任意空隙／裁切。
- **Scene overview** 在同一刻度顯示所有角色與六軌色帶，點角色名稱或色帶回到該角色的軌道編輯。沒有音樂時每個角色保留獨立時鐘。

## 音樂標記、循環與舞台工具

- **Add marker (M)** 在播放頭加入標記；可改名稱與秒數、Go 定位、× 移除。BPM 與 Beat offset 手動設定，沒有自動節拍偵測。
- **Set A／Set B** 從播放頭設定範圍，或直接輸入秒數；**Loop A–B** 使用 AudioBufferSource 的 loopStart／loopEnd，畫面也依同一音訊時鐘回到 A。需 0 ≤ A < B ≤ 音樂長度。啟用時優先於整首 Loop music；逐格與暫停 seek 仍可檢視範圍外，Play 時回到有效循環範圍。
- **Move／Rotate／Scale**：直接拖曳角色；旋轉和縮放以骨架原點為中心，亦可輸入精確數值。**Visible** 控制顯示，**Lock transforms** 保護位置、縮放、旋轉、Flip 與圖層操作；不鎖動畫設定或移除。**Send backward／Bring forward** 每次移動一層。
- 同一組來源貼圖與 atlas 的多個實例共用 BaseTexture，各自的骨架／動畫仍獨立；不同匯入的 File 物件不做內容雜湊去重。Performance 的 Texture pages／估算記憶體依共用後的實際貼圖統計。
- **Preferences** 或可拖曳的分隔線可調 Sidebar width／Timeline height。折疊、尺寸、音量／Mute、Frame step FPS 和吸附偏好存入此瀏覽器 localStorage。素材不會自動存到 localStorage，請另外儲存專案 ZIP。

## 使用與部署

按「開啟素材」一次選取 JSON／SKEL、atlas 與所有 PNG／WebP，或使用資料夾／拖放。Slot 可搜尋、選取並在動畫中跟隨標示。素材仍只在瀏覽器記憶體處理，不傳到伺服器。

性能面板包含 Draw Calls 平均／最高值、JS Heap 和 RGBA 貼圖記憶體估算；估算不等於完整 GPU 用量。CPU 計時不含 GPU 非同步執行。FPS 統計實際重畫次數；所有動畫暫停時只在編輯、逐格、鏡頭或尺寸變化後重畫。閒置更新降為 10 Hz，Draw Calls 可降至 0。

將 `dist/` 整個資料夾部署到靜態 HTTP 伺服器即可；`base: './'` 支援子路徑。本專案的開發頁與打包產物使用 ES modules，**請透過 HTTP 開啟，不使用雙擊 HTML**。先前交付的純 HTML 離線包仍可另外保留。

Vite build 附 source map 供除錯；若不想發布原始碼，將 `vite.config.ts` 的 `build.sourcemap` 設成 `false` 後重新打包。pixi-spine 含多個 runtime，正式 JS bundle 較大屬預期；不任意裁掉 runtime 以維持既有相容範圍。

左側 **Project／Assets／Stage／Music／Skin／Slots／Animations／View／Preferences** 可點標題或箭頭個別折疊；聚焦標題後也能用 Enter／Space 切換。折疊保留目前的搜尋內容、選取及播放設定，折疊狀態會保存在此瀏覽器；首次使用預設全部展開。

## 多骨架舞台（本機版）

- **Open folder** 或拖入整個資料夾會掃描子資料夾，將可載入的 JSON／SKEL 一起加入同一個舞台，自動水平排列並 Fit。資料夾需包含 atlas 及其引用的貼圖，所有檔案都只在瀏覽器內處理。
- atlas 優先配對同資料夾的同名檔；同資料夾只有一份 atlas 時也可自動配對。無法確定的配對會列出錯誤，可在 Assets 選擇 Skeleton／Atlas 後按 **Add selected asset to stage** 手動加入。每份 JSON／SKEL 都是獨立角色；同一骨架的兩種格式會各載入一份。
- 每次匯入會以成功載入的角色替換舞台；部分失敗會保留成功項目並列出失敗檔案。全部失敗時保留原舞台。Assets 下拉選單只選擇待加入的來源，不會替換已在舞台上的角色。
- **Stage** 清單或直接點擊舞台角色可選取骨架，薄綠框標示目前選取。Skin、Slots、Flip、Setup pose、多軌序列／Mix in、播放速度及逐幀操作都作用於所選角色；切換角色保留各自的播放時間、軌道與 Slot 選取。
- 使用 X／Y 設定選取角色的位置，**Arrange** 重新水平排列，**Remove selected** 移除角色；共用貼圖在最後一個角色釋放後才銷毀。拖曳角色使用 Move／Rotate／Scale 工具，Shift + 拖曳、中鍵或拖曳空白處平移舞台，滾輪縮放鏡頭。
- **Play all／Pause all** 同時控制舞台角色；未載入音樂時，各角色使用自己的動畫時鐘與循環長度。底部可切換 **Scene overview** 查看所有角色，或編輯所選角色的 Track 0–5；沒有音樂時總覽各列顯示角色自己的播放頭。
- Performance 的 Draw Calls、Bones／Slots、Attachments／Triangles、Texture pages 與 texture memory 都統計整個舞台；JS Heap 為整個頁面。選取角色的 debug overlays 也計入 Draw Calls。
- 使用 **Save project ZIP** 保存舞台與素材，重新整理後可開啟還原。本次變更只更新本機，未推送或部署 GitHub Pages。

## 音樂與動畫對拍（本機版）

1. 在 **Music → Import audio** 選擇本機 MP3／WAV，或其他瀏覽器可解碼的音訊格式。一次使用一首音樂；匯入後停在 0 秒，按 Play 才出聲。音訊不會上傳。
2. 紫色音樂軌顯示波形，可點擊／拖曳定位；波形、刻度及動畫區塊使用同一個縮放和平移範圍。**Fit** 顯示整首音樂（時間軸最大範圍 2 小時）。
3. 在 Stage 選擇角色後，於 Music 的 **Selected skeleton · Start at (s)** 設定動作開始時間，例如 2 秒。開始前保持第一幀；動畫區塊也會移到對應時間。各角色仍可編輯多軌、序列與 Mix in。
4. 有音樂時，底部播放／暫停、Play all／Pause all、Restart、拖曳與逐幀都作用於整個舞台。以 AudioContext 的音訊時鐘定位每個角色，避免用累積繪圖時間播放音樂。
5. **<／>** 或前後一幀按鈕會先暫停，讓音樂時間與角色一起移動，不播放片段聲音；再次 Play 從該位置開始出聲。
6. **Volume／Mute** 控制音量。**Loop music** 重複整首音樂，未勾選時在結尾停止；Spine 軌道的 Loop 仍控制該角色動畫循環。Start at 每次音樂循環重新計算。
7. 有音樂時，Speed 控制音樂與所有角色的共同速率；此版 Web Audio 變速也會改變音高，不提供保音高時間伸縮。角色各 Track 的速度仍獨立。
8. 音樂模式下編輯動畫或 Mix in 保留音樂時間；**Remove audio** 釋放音訊並讓所有角色暫停在當前姿勢，再回到各角色獨立播放模式。匯入失敗會保留目前音樂。

每首音樂會解碼為 AudioBuffer 並計算波形摘要；波形不代表自動 BPM／節拍偵測。可用手動 BPM、Marker 與 A–B 循環對拍，專案 ZIP 會保存音訊與設定；尚無音樂裁切、多首混音或帶音訊的影片匯出。

## 多軌時間軸

畫面下方提供 Track 0–5。Track 0 選 `walk`、Track 1 選 `shoot`，可同時預覽行走與射擊。各軌都有動畫選單、Loop 與清除按鈕；點 T0–T5 選擇編輯軌道，再到側欄「Selected track settings」調整速度、權重及 Additive。切換選取軌道不會停止其他軌道；清除一軌也會保留其他軌的時間。

- 每軌預設從 0 秒起播，可用 **Track start (s)** 或拖曳區塊調整整串 sequence 的起點；更換動畫會從頭預覽整個組合。
- 共用時間軸以最長的有效動畫長度（Track start + 動畫秒數 ÷ 軌道速度）為一輪；有播放中的軌道開啟 Loop 時，抵達結尾會回到 0，所有軌道一起重新播放。全部關閉 Loop 時停在結尾。零長度動畫與速度 0 的軌道不會延長一輪。
- 拖曳刻度或播放指針會暫停，並同步定位所有軌道。各軌動畫時間等於（共用時間 − Track start）× 該軌速度，起播前該軌不套用動畫；全域播放速度則影響共用時鐘前進速度。
- 每個序列段落只顯示一次；開啟 Loop 時在最後一段顯示 ↻ Loop 標記，不會向後排列重複區塊。未開 Loop 的軌道會維持最後姿勢；0 秒動畫或速度 0 顯示為持續的姿勢區塊。
- 滾輪以游標位置為中心連續縮放（可見範圍 0.1–7200 秒），也可按 −／+ 縮放；Fit 顯示各軌的一輪動畫。
- 在軌道空白處拖曳可自由平移；Shift + 拖曳、中鍵拖曳、Shift + 滾輪或觸控板水平捲動也可平移。平移與縮放不改變播放時間、暫停狀態或動畫內容。
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
