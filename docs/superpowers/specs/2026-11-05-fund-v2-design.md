# 公基金 V2 設計：取代總表成為正式帳本，與原流水帳系統並存

日期：2026-11-05
狀態：待核准
相關：`巢穴參考資料/` vault 的《章程》、《流水帳 - 總表》CSV、《公基金全歷史金流與共同體生態分析》

## 1. 意圖與為什麼

巢穴共同體公基金目前的正式帳本是 Google Sheet「總表」，由會計每月手工結算並把快照文字貼到群組。`app/fund/*` 是照總表設計的記帳系統，但只有測試資料、沒有統計、模型缺了總表 hashtag 裡的幾種語意。

分析報告指出公基金已從儲蓄計畫變成共同體的生活基礎設施，而現在最缺的三項能力是：清楚區分各種資源、提前辨識必要支出、讓更多人理解經濟結構。這份設計要讓系統 **取代總表** 成為唯一正式帳本，並補齊這三項能力。

對象：主要是公基金會計負責人（登錄、結算、公布）；其次是所有計畫參與者（唯讀看帳與統計）。

## 2. 目標、非目標、反目標

**目標**
- 總表 24 個月歷史一次性匯入，逐列驗證餘額與總表快照一致，匯入後總表停用。
- 會計能在系統完成每月所有作業：登錄、代墊請款、小組彙整、結算（含凍存與公布文字）。
- 系統能自己算出報告裡的指標：分類支出、收入來源占比、帳面小結 vs 不凍結零用金曲線、月內最低不凍結零用金、應付未付、未償借款與代墊、帳外支援總額。
- 所有登入的參與者可唯讀看流水帳、每月一覽（全部公開）、統計；只有會計能寫。
- 章程規則可設定，預設等於現行實務；系統顯示與章程條文的落差而不強制。

**非目標**
- 小組負責人自己記帳（本版只留 `group_id` 擴充點，由會計用「小組彙整」表單登錄）。
- 完整的專案申請／全數決審核流程（本版只簡單留痕）。
- 複雜貸款攤還表、利息自動計算。
- 匯入腳本的反覆同步能力（一次性）。

**反目標（做到也算失敗）**
- 小結跟總表最後一列對不上卻照樣上線。
- 參與者能改到別人的資料。
- 把放棄請款的帳外支援算進餘額。
- 系統強迫會計照章程 20 日結算、凍存總餘款 30%，而實務已不是這樣。

## 3. 限制

- Next.js 16 App Router、Supabase（Postgres + PostgREST + RLS）、無 ORM；schema 以 `supabase/fund/00N_*.sql` 累加。
- PostgREST 單次最多回 1000 列。
- 登入是「名稱 + 密碼」經 `login-with-name` edge function；會計與參與者目前沒有角色區分。
- 總表資料特性：893 列、63 筆多金額儲存格、492 種 hashtag、日期列序 ≠ 日期序（歸零清算區）、4 列未請款代墊在帳上為零、凍存實務 = 不凍結零用金 × 30% × 2、2025/04 起結算皆在次月 1–7 日。

## 4. 考慮過的做法

**A. 餘額搞進資料庫（採用）**：以 Postgres view 計算每筆交易後的餘額快照與月度統計，頁面只讀結果並可分頁；參與者唯讀靠 RLS。代價是要寫 SQL view、重構頁面讀取。
**B. 維持瀏覽器算**：只加分批拉取繞過 1000 列。改動最小，但每頁拉全量、統計也在前端算、權限難做。
**C. 寫入時存快照**：trigger 把每筆交易後餘額存成欄位。讀最快，但改舊帳要重算後面所有列。

選 A：取代總表後讀的人變多、資料只會更多，正確性與權限放資料庫層最穩；C 的重算複雜度在「隨時可改舊帳」的使用習慣下不划算。

## 5. 已決定的設計

### 5.1 角色與權限
- `fund_members` 加 `user_id uuid` 對應 `auth.users`；新增 `fund_roles`（user_id, role in ('accountant','member')）。
- RLS：所有 `fund_*` 表 `select` 給 authenticated；`insert/update/delete` 只給 `accountant`。公開奉納表單仍走 API + service role + 通關密語。
- 每月一覽、流水帳、統計對參與者全部公開（含各成員奉納金額），依使用者決定。

### 5.2 餘額與統計在資料庫
- view `fund_running_balances`：以 `(occurred_on, seq, id)` 排序，對每筆交易輸出各科目、各存放位置、小結的累計值（window sum）。
- view `fund_monthly_summary`：每月末小結、不凍結零用金、月內最低不凍結零用金、收入依來源、支出依報表分類。
- 其他統計（未償借款、代墊、應付、帳外支援）各一個 view 或 RPC。
- 頁面改讀 view，流水帳分頁（預設近 3 個月＋載入更多）。前端 `computeRunningBalances` 保留給匯入驗證與結算預覽。

### 5.3 模型補強（`006_model.sql`）
- `fund_transactions`：`income_source`（donation, salon, event, kitchen, reinject, loan, refund, interest, inkind, other）、`stated_on`（總表原始日期）、`date_note`、`off_ledger`、`group_id`（擴充點，本版 null）、partial unique `(import_row) where source='import'`。
- `fund_expenses`：`claim_status`（none, unclaimed, claimed, waived）、`claimed_transaction_id`、`claimed_on`；`settled` 回填後棄用。
  - **代墊語意（使用者決定）**：代墊支出登錄時 `off_ledger=true, claim_status='unclaimed'`，不入餘額；在結算（或任何一次請款批次）時由會計勾選入帳，另開一筆「代墊請款」交易帶 lines 並轉 `claimed`（見 5.7 第 3 點）。放棄請款 → `waived`，永遠不入餘額，列入「帳外支援」。
- `fund_transactions.type` 新增 `expense_claim`（代墊請款）。
- `fund_tags.report_group`（貸款與信用卡／交通與車輛／水電與通訊／中央蘭室配置／null=其他）＋補標籤。
- `fund_loans`：`lender_member_id`、`interest`、`due_on`、`installment`、`installment_count`、`status`；`transaction_id` 改 nullable（帳前借款）。
- `fund_advancers.member_id`。
- `fund_settlements`：允許同月多筆（拿掉 month 唯一假設，加 `period_no`）；`freeze_base`、`frozen_reserve`、`frozen_future`、`zero_reason`（凍存 0 必填）、`late_days`。
- `fund_payables`：title, amount, due_on, account_id, template_id, vendor, note, status(open/paid/cancelled), paid_transaction_id。固定費用模板每月自動產生一筆（`fund_templates` 加 `recurring boolean, due_day int`），金額不定的手動建；付款時從待付帶入支出表單並回填。
- `fund_settings`(key, value jsonb)：donation_due_day=14、settlement_due_day=20、group_settle_due_day=14、exit_notice_days=5、monthly_cap=5000、standard_amount=1500、freeze_rate=0.3、freeze_base='main'。
- `fund_members`：`joined_at`、`left_at`、`exit_note`（匯入後回填 joined_at=首筆奉納日）。
- 簡單留痕：`fund_transactions.decision_ref text`（解凍／活動支出時填「第 N 次會議」）；`fund_emergencies`(started_on, ended_on, note)。不做申請審核流程。

### 5.4 匯入（`scripts/import-ledger.ts`，一次性）
- 執行前 `--reset` 刪除所有交易與子表（含【測試資料】與任何已登錄交易，使用者決定），保留成員、科目、存放、經手人、代墊者、標籤、模板。
- 六段：parse（RFC4180、BOM）→ normalize（日期、多金額 token、hashtag → 存放／代墊／內嵌轉帳、快照解析＋別名）→ classify（型別與 income_source）→ reconcile（以快照差為準，Δ→lines 解算器；不符即中止）→ write（`seq=import_row`、`occurred_on` 單調化、原日期存 `stated_on`、子表）→ verify（重讀全部跑 `computeRunningBalances` 逐列 diff）。
- 代墊 Δ=0 的 1 列（列 544）→ `off_ledger/unclaimed`；Δ≠0 的 107 列 → `claimed`；放棄請款／無須支付 6 列（471–473、707、798、799）→ `waived`（金額記被放棄的費用，不產生 lines）。
- 非成員奉納者不建成員，記 `income/event`。缺的科目／存放建立後停用。
- 驗收：末列小結 = 1,627（末兩列 892–893 進 `fund_payables`，列 885 為驗證終點）、24 筆結算、凍存 0 的 7 筆有 `zero_reason`、重跑不重複。

### 5.5 公基金 V2 的 UI（使用者決定：原「公基金 流水帳」`/fund/*` 保留不動，V2 另開新路徑與首頁入口）

使用者對現有 UI 的四個不滿：頁面太多分散、登錄欄位太多、結算頁看不懂、視覺資訊太多。手機與電腦並重。草圖經瀏覽器比較後選定（檔案在 `.superpowers/brainstorm/*/content/`）：

**結構：三分頁「帳／記／算」**（手機底部 tab bar，電腦左側三項）。新路徑 `/fund-v2`（帳）、`/fund-v2/record`（記）、`/fund-v2/settle`（算）、`/fund-v2/stats`（統計）；首頁 `app/page.tsx` 在「公基金 流水帳」旁新增一個「公基金 V2」入口，兩套並存。舊 `/fund/*` 不改，待 V2 跑完一次完整月結算後再決定是否移除舊入口。參與者（member 角色）只看得到「帳」與「算」裡的統計。

**帳（B1 純帳本）**
- 上：餘額卡。不凍結零用金最大，小結與凍存（緊急＋前瞻合計）次之；各專款、郵局／現金收在「展開」。右上角期別選單，預設最近一期。
- 下：流水帳，按日期分組，每列只放 日期、一句話、金額、當時零用金餘額。點開才顯示完整快照、hashtag、憑證、編輯／刪除（會計）。篩選 chip：全部／收入／支出／結算／轉帳，電腦版加搜尋。往前翻用「載入更早」。
- 不放「要做的事」卡片（使用者選 B1 而非 B2）。

**記（R1，三條路命名用「支出／收入／轉帳」，使用者決定）**
- 上方固定三段切換：支出／收入／轉帳。每條路最多三個必填，其餘收在「更多」；「記下」前顯示對零用金的影響。
- 支出：第一排「常用」只列本月尚未登錄的固定費用模板（併入 R2 的想法），點一下帶入店家、標籤、金額；必填 金額、付給誰、錢從哪裡出（郵局／現金袋／先墊付）。選「先墊付」才展開「誰墊的」（中央蘭室／信用卡／其他成員），並註明結算時再請款入帳。標籤由店家或模板自動猜。
- 收入：先選是什麼錢（奉納／沙龍營業／活動／回注／借款／其他 → `income_source`），再填誰、金額、怎麼收（匯款末五碼／現金＋經手人）。「指定專款」展開後可分配到小組專款，其餘自動進零用金。更多：哪幾個月、代繳、留言。
- 轉帳：從／到各一排帶餘額的 chip（存放位置與科目一起列），金額，下方即時顯示搬完後數字。從 reserve 科目搬出時多問一行「依據（第幾次會議）」→ `decision_ref`。
- 「放棄請款」「小組彙整」放在支出的「更多」裡。

**算（S1：首頁 ＋ 四步精靈）**
- 首頁：最上面「要做的事」卡（到期應付、待請款代墊、14 日後未繳名單，沒事時不顯示）；「開始 N 月結算」按鈕與上次結算日；統計縮圖（近 10 期小結）點進統計頁；底部設定／成員／科目入口。
- 精靈四步，每步一畫面只做一件事：1 請款（勾選這次入帳的未請款代墊與還款，下方即時顯示入帳後零用金與小結）→ 2 凍存（預設設定值，可改「這次不凍存」必填原因；顯示章程「總餘款 30%」與本次的差額，只顯示不擋）→ 3 核對實際餘額（郵局、現金袋，差額記矯正回歸）→ 4 公布（產生群組文字一鍵複製，完成結算）。標題列顯示「結算日 M/D（章程 20 日，延後 K 天）」。同一期可再結一次。
- 統計頁（`/fund-v2/stats`）：結算期間為橫軸的小結與零用金雙線＋月內最低點、支出五類、收入來源 %、沙龍營收、未償借款與代墊、應付未付、帳外支援。inline SVG，不加圖表依賴；實作前讀 `dataviz` skill。
- 應付清單與「標記已付」放在「要做的事」展開後；設定、緊急狀態、成員角色在首頁底部入口。

**視覺**：沿用黑底與 `#00FF41` 強調色，但去掉等寬字體全頁套用、文字發光、每列快照全顯示；金額用 tabular-nums，負數紅、收入綠、其餘白，灰字為次要。

### 5.6 順序
步驟 0 skill 已裝 → 前置（view 基礎、RLS 角色）→ P2 schema → P0 匯入 → V2「帳」→「記」→「算」（含統計與應付）→ P3 章程規則接進「算」與設定頁。每段獨立可驗；舊 `/fund/*` 全程保留，兩套讀同一個資料庫。

### 5.7 Builder check 後補上的決定

1. **總表末兩列（892–893）**：9 月電費 −22,239 與 10 月電信費 −929 是尚未繳納的帳單（日期只有「2026/11/」、無快照）。匯成 `fund_payables`（open，due_on 依備註 11/24），不建交易。reconcile/verify 的終點是列 885，匯入後小結 = 1,627，上線第一天的應付未付 = 23,168。
2. **歸零清算（列 405–425）**：列 405 建 `reset` 交易，其 lines 為處理完列 406–424 後所有科目／存放餘額的負值，`seq` 排在 424 之後；列 425 `opening` 建二階起始 lines（郵局 9,800、現金 831 等）。列 406–424 的「剩餘：N元」是現金備忘，不是快照，跳過驗證，累積到列 425 一次驗為全零再加 opening。`reset`／`opening`／`settlement` 屬「結算」類，統計的收入／支出分類一律排除。
3. **代墊入帳日期（我的決定）**：請款時另開一筆 `type='expense_claim'`（顯示為「代墊請款」）交易，日期＝請款日，lines 在這筆上；原支出交易保持 `off_ledger=true`，`claimed_transaction_id` 指向請款交易。不回溯改已公布月份。匯入的 107 列當場扣款者 `claimed_transaction_id` 指向自身、lines 在自身。現有「代墊（待清償）」存放位置與 `advance_settle` 表單退場，由新流程取代。
4. **統計的「月」＝結算期間（使用者決定）**：上一次結算列（含）之後到這一次結算列（含）為一期，以 `fund_settlements.month`＋`period_no` 命名；view 以 `(occurred_on, seq, id)` 的順序切期，不用日曆月。`stated_on` 只做顯示。
5. **帳前借款（使用者決定：照總表反推）**：對每個出借人，本金＝總表已還本金合計＋最後一次結算備註「剩餘 N 元」；起始日標為 2024-11-05 之前（`occurred_on` 設 2024-11-01，`transaction_id=null`，note 註明反推）。匯入後列出清單供會計校對。
6. **帳號與角色（使用者決定）**：參與者沿用現有登入（物資系統同一套帳號，`profiles`）；`fund_roles` 以 seed SQL 先寫入 Steven 與 Eason 為 `accountant`，之後由會計在管理頁增減。物資流表的 RLS 不在本設計範圍。

## 6. 留給 builder 的
- view 的實作細節（window function vs materialized）、索引。
- 匯入腳本的別名表完整內容（從 CSV 實際 hashtag 補齊）。
- 圖表視覺細節、流水帳分頁的互動。
- 自動產生待付的觸發時機（每月 1 日 cron vs 開啟頁面時補產生）。
