# 公基金 V2 計畫 A：資料層（角色、模型、view、總表匯入）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓資料庫成為公基金唯一正式帳本：加上會計／參與者角色、補齊模型欄位、以 Postgres view 計算餘額與期間統計，並把總表 893 列一次匯入且逐列驗證與總表快照一致。

**Architecture:** schema 以 `supabase/fund/006–008_*.sql` 累加；餘額由 view `fund_tx_snapshots` 以列序累計，期間統計由 `fund_period_summary` 以結算列切期；匯入腳本 `scripts/import/*` 拆成 parse → normalize → classify → reconcile → write → verify 六個純函式模組，各自可單測，主程式只串接。舊 `/fund/*` 頁面只改讀取方式（分批取全量），不改功能。

**Tech Stack:** Postgres (Supabase)、PostgREST、Next.js 16、TypeScript、Node 22 `--experimental-strip-types` + `node:test`。

**Spec:** `docs/superpowers/specs/2026-11-05-fund-v2-design.md`（§5.1–5.4、§5.7）

計畫 B（V2 介面）與計畫 C（章程規則）在本計畫完成後另寫，它們依賴本計畫的 view 與欄位名。

## Global Constraints

- 所有新表／欄位放 `supabase/fund/00N_*.sql`，可重複執行（`if not exists`、`do $$`）；在 Supabase SQL Editor 依序執行，或 `psql "$DATABASE_URL" -f`。
- 金額欄位一律 `numeric(12,0)`；交易排序鍵固定為 `(occurred_on, seq, id)`。
- 匯入是一次性的：`--reset` 刪除所有 `fund_transactions`（cascade）與 `fund_payables`、`transaction_id is null` 的 `fund_loans`；保留 members／handlers／storages／accounts／advancers／tags／templates。
- 匯入驗證終點：總表列 885，匯入後小結必須 = 4,165；列 892–893 進 `fund_payables`。
- 放棄請款（`waived`）與未請款代墊（`off_ledger`）不得產生 `fund_lines`。
- 腳本用 `node --experimental-strip-types --env-file=.env.local`，匯入以 `SUPABASE_SERVICE_ROLE_KEY`。
- 測試指令：`npm test`（= `node --experimental-strip-types --test "lib/**/*.test.ts" "scripts/**/*.test.ts"`）。
- 每個 task 結尾 commit；commit 訊息結尾加 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`。

## Review Focus

1. 同一天多筆交易時 view 的順序與 `computeRunningBalances` 不同 → 餘額快照錯一列。Task 4 的 verify 腳本逐列比對全部交易。
2. 總表列序與日期序不一致（歸零區 `2025/7/0`、`+2025/8/9`）→ 匯入後鏈斷掉。Task 9 以 `occurred_on` 單調化處理，Task 10 驗證 `stated_on` 與 `occurred_on` 不同的列數 > 0 且快照仍全對。
3. 代墊支出既標 `#已請款` 又 Δ=0（列 544）→ 不能算進餘額也不能當未請款。Task 8 測試：Δ=0 一律 `off_ledger=true`、`unclaimed`，並 warn。
4. 參與者登入後能寫入 → 資料被改。Task 1 以匿名 JWT 與一般 authenticated JWT 各做一次 insert，期待 42501。
5. PostgREST 1000 列上限在舊頁面讓餘額算錯 → Task 5 `fetchAllTransactions` 測試用 1001+ 筆假資料分批。

---

### Task 0: 測試骨架與既有文件入庫

**Files:**
- Modify: `package.json`（scripts 加 `test`）
- Create: `lib/fund.test.ts`
- Add to git: `docs/superpowers/**`、`.agents/skills/**`、`.claude/skills/**`、`.claude/launch.json`、`巢穴參考資料/**`（排除 `.obsidian/workspace*.json` 已在 .gitignore）

- [ ] **Step 1: 在 `package.json` 加** `"test": "node --experimental-strip-types --test \"lib/**/*.test.ts\" \"scripts/**/*.test.ts\""`
- [ ] **Step 2: 寫 `lib/fund.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRunningBalances } from './fund.ts';
test('computeRunningBalances orders by occurred_on, seq, id', () => {
  const txs = [
    { id: 2, occurred_on: '2024-11-06', seq: 0, fund_lines: [{ account_id: 1, storage_id: 1, amount: 1500 }] },
    { id: 1, occurred_on: '2024-11-05', seq: 0, fund_lines: [{ account_id: 1, storage_id: 1, amount: 46 }] },
  ] as never[];
  const { ordered, snapshots } = computeRunningBalances(txs);
  assert.deepEqual(ordered.map((t) => t.id), [1, 2]);
  assert.equal(snapshots.get(2)!.total, 1546);
});
```

- [ ] **Step 3: Run** `npm test` → Expected: 1 pass
- [ ] **Step 4: Commit**（含文件、skill、vault）：`chore: add test harness, V2 design doc, skills and reference vault`

---

### Task 1: 角色與 RLS（`006_roles.sql`）

**Files:**
- Create: `supabase/fund/006_roles.sql`
- Create: `scripts/check-rls.ts`

**Interfaces:**
- Produces: table `fund_roles(user_id uuid pk references auth.users, role text check in ('accountant','member'), created_at)`; SQL function `fund_is_accountant() returns boolean` (security definer, stable, `select exists(select 1 from fund_roles where user_id = auth.uid() and role='accountant')`)；`fund_members.user_id uuid null references auth.users(id)`.

- [ ] **Step 1: 寫 `006_roles.sql`**：建 `fund_roles`、`fund_is_accountant()`、`fund_members.user_id`；用 `do $$` 迴圈對所有 `fund_%` 表 drop 既有 `*_authenticated_all` 政策，改建兩條：`<t>_read` for select to authenticated using (true)；`<t>_write` for insert/update/delete to authenticated using (fund_is_accountant()) with check (fund_is_accountant())。`fund_roles` 本身同樣規則。最後 seed：`insert into fund_roles select id,'accountant' from auth.users where raw_user_meta_data->>'name' in ('Steven','Eason') on conflict do nothing;` 並回填 `fund_members.user_id` by `nickname = raw_user_meta_data->>'name'`。
- [ ] **Step 2: 在 Supabase SQL Editor 執行** → Expected: 無錯誤；`select count(*) from fund_roles where role='accountant'` = 2（Eason 若尚未註冊則 1，記在 warn）。
- [ ] **Step 3: 寫 `scripts/check-rls.ts`**：用 anon key 以 `login-with-name` 登入一個非會計帳號（名稱由 `CHECK_USER`/`CHECK_PASSWORD` env 提供），嘗試 `insert into fund_handlers`，期待 error code `42501`；再 `select from fund_transactions limit 1`，期待無錯誤。印 `RLS OK`。
- [ ] **Step 4: Run** `CHECK_USER=... CHECK_PASSWORD=... node --experimental-strip-types --env-file=.env.local scripts/check-rls.ts` → Expected: `RLS OK`
- [ ] **Step 5: Commit** `feat(fund): accountant/member roles and read-only RLS for participants`

---

### Task 2: 模型補強（`007_model.sql`）

**Files:**
- Create: `supabase/fund/007_model.sql`
- Modify: `lib/fund.ts`（型別）

**Interfaces（後續 task 與計畫 B 依賴的確切名稱）:**
- `fund_transactions`: `+ income_source text null check in ('donation','salon','event','kitchen','reinject','loan','refund','interest','inkind','other')`, `+ stated_on date`, `+ date_note text`, `+ off_ledger boolean not null default false`, `+ group_id int null references fund_accounts(id)`, `+ decision_ref text`; `type` check 增加 `'expense_claim'`; `create unique index ... on fund_transactions(import_row) where source='import'`.
- `fund_expenses`: `+ claim_status text not null default 'none' check in ('none','unclaimed','claimed','waived')`, `+ claimed_transaction_id bigint references fund_transactions(id) on delete set null`, `+ claimed_on date`; 回填 `update fund_expenses set claim_status='claimed' where settled`.
- `fund_tags`: `+ report_group text null check in ('貸款與信用卡','交通與車輛','水電與通訊','中央蘭室配置')`; seed 新標籤（信用卡、燃料稅、牌照稅、營業稅、會計費、修繕 → item；OG、力行路40號 → space）；update 對應：貸款、信用卡、共同債務→貸款與信用卡；共用汽車、油料費、停車費、燃料稅、牌照稅→交通與車輛；電費、水費、電信費、瓦斯→水電與通訊；中央蘭室→中央蘭室配置。
- `fund_loans`: `transaction_id` drop not null; `+ lender_member_id int references fund_members(id)`, `+ interest numeric(12,0) not null default 0`, `+ due_on date`, `+ installment numeric(12,0)`, `+ installment_count int`, `+ status text not null default 'open' check in ('open','closed','written_off')`, `+ started_on date`.
- `fund_advancers`: `+ member_id int references fund_members(id)`.
- `fund_settlements`: `+ period_no int not null default 1`, `+ freeze_base numeric(12,0)`, `+ frozen_reserve numeric(12,0) not null default 0`, `+ frozen_future numeric(12,0) not null default 0`, `+ zero_reason text`, `+ late_days int`; `create unique index on (month, period_no)`.
- New `fund_payables(id bigserial pk, title text not null, amount numeric(12,0) not null, due_on date, account_id int references fund_accounts, template_id int references fund_templates, vendor text, note text, status text not null default 'open' check in ('open','paid','cancelled'), paid_transaction_id bigint references fund_transactions on delete set null, created_by uuid, created_at timestamptz default now())` + index `(status, due_on)`.
- New `fund_settings(key text pk, value jsonb not null, updated_at timestamptz default now())` seed: donation_due_day 14、settlement_due_day 20、group_settle_due_day 14、exit_notice_days 5、monthly_cap 5000、standard_amount 1500、freeze_rate 0.3、freeze_base "main".
- `fund_members`: `+ joined_at date`, `+ left_at date`, `+ exit_note text`.
- New `fund_emergencies(id serial pk, started_on date not null, ended_on date, note text, declared_by uuid)`.
- `fund_templates`: `+ recurring boolean not null default false`, `+ due_day int`; update 華南貸款、國泰貸款、中央蘭室專款、停車場月租、電信費、電費、水費 → `recurring=true`。
- 新表套用 Task 1 的 read／write 兩條政策（同一段 `do $$` 迴圈重跑即可）。

- [ ] **Step 1: 寫 `007_model.sql`**（內容如上，全部 `add column if not exists` / `create table if not exists`；修改 check 用 `alter table ... drop constraint if exists fund_transactions_type_check; add constraint ...`）。
- [ ] **Step 2: 在 SQL Editor 執行** → Expected: 無錯誤；`select report_group, count(*) from fund_tags group by 1` 四組皆 > 0；`select count(*) from fund_settings` = 8。
- [ ] **Step 3: 更新 `lib/fund.ts` 型別**：`FundTransactionType` 加 `'expense_claim'`（`TYPE_LABEL` '代墊請款'、`CATEGORY_OF` '支出'、`SUBTYPE_LABEL` '代墊請款'）；`FundTransaction` 加 `income_source: IncomeSource | null; stated_on: string | null; date_note: string | null; off_ledger: boolean; group_id: number | null; decision_ref: string | null`；export `type IncomeSource = 'donation'|'salon'|'event'|'kitchen'|'reinject'|'loan'|'refund'|'interest'|'inkind'|'other'` 與 `INCOME_SOURCE_LABEL`（奉納／沙龍營業／活動／廚房隨喜／專款回注／借款／退款／利息／帳外支援／其他）；`FundExpense` 加 `claim_status: ClaimStatus; claimed_transaction_id: number | null; claimed_on: string | null`；`FundLoan`、`FundSettlement`、`FundMember`、`FundTemplate` 依上表補欄位；新增 `FundPayable`、`FundSetting`、`FundEmergency` 介面。
- [ ] **Step 4: Run** `npx tsc --noEmit` → Expected: 無錯誤（舊頁面不讀新欄位，型別只增不改）。
- [ ] **Step 5: Commit** `feat(fund): model additions for V2 (income source, claim status, payables, settings)`

---

### Task 3: 餘額與期間統計 view（`008_views.sql`）

**Files:**
- Create: `supabase/fund/008_views.sql`

**Interfaces:**
- view `fund_tx_ordered`: `fund_transactions.*` + `ord bigint`（`row_number() over (order by occurred_on, seq, id)`）。
- view `fund_tx_snapshots(transaction_id, ord, occurred_on, total numeric, main numeric, accounts jsonb, storages jsonb)`：`accounts` = `{"<account_id>": sum}` 對所有 `ord <= 本列 ord` 的 lines 聚合；`storages` 同理；`main` = `accounts[主科目 id]`；只含 `off_ledger=false` 的交易的 lines（off_ledger 本來就沒 lines）。
- view `fund_periods(settlement_transaction_id, month, period_no, start_ord, end_ord, settled_on)`：由 `fund_settlements` join `fund_tx_ordered`，`start_ord` = 上一筆結算的 `ord`+1（第一筆為 1），`end_ord` = 本筆 `ord`。
- view `fund_period_summary(month, period_no, settled_on, end_total, end_main, min_main, income_by_source jsonb, expense_by_group jsonb, salon_income numeric)`：`end_*` 取 `end_ord` 的快照；`min_main` = 期間內 `fund_tx_snapshots.main` 最小值；`income_by_source` 以 `fund_transactions.income_source` 聚合 `amount>0` 且 type in (donation,income,refund,loan)；`expense_by_group` 以 `fund_expenses.tags` 與 `fund_tags.report_group` 聚合 type in (expense,expense_claim,repayment) 的 `-amount`，取該筆 tags 中第一個 `report_group not null` 的標籤（依 `fund_tags.sort_order`），無則 '其他'；`salon_income` = income_source='salon' 合計。
- view `fund_outstanding_loans(loan_id, lender_name, lender_member_id, principal, repaid, remaining, status)`：`repaid` = sum(fund_repayments.amount)。
- view `fund_advances_owed(advancer_id, advancer_name, amount)`：`fund_expenses.claim_status='unclaimed'` 的 `-fund_transactions.amount` 合計 by advancer。
- view `fund_waived_total(total numeric)`：`claim_status='waived'` 的 `-amount` 合計。
- 所有 view `grant select to authenticated`；`security_invoker = on`。

- [ ] **Step 1: 寫 `008_views.sql`**（`create or replace view`；`fund_tx_snapshots` 用 lateral 子查詢：`select jsonb_object_agg(account_id, s) from (select account_id, sum(amount) s from fund_lines l join fund_tx_ordered t on t.id=l.transaction_id where t.ord <= o.ord group by 1) x`）。
- [ ] **Step 2: 在 SQL Editor 執行** → Expected: 無錯誤；以現有測試資料 `select transaction_id, total, main from fund_tx_snapshots order by ord desc limit 1` 回一列。
- [ ] **Step 3: Commit** `feat(fund): running balance and period summary views`

---

### Task 4: view 驗證腳本（與前端算法逐列比對）

**Files:**
- Create: `scripts/verify-views.ts`

**Interfaces:**
- Consumes: Task 3 views、`lib/fund.ts#computeRunningBalances`、Task 5 `fetchAllTransactions`（本 task 先用 service role 直接 `.range()` 迴圈，Task 5 完成後改用）。
- Produces: CLI 印 `VIEWS OK <n> transactions` 或第一個不符的 `transaction_id` 與兩邊的 `total/main/accounts/storages`。exit code 1 on mismatch。

- [ ] **Step 1: 寫 `scripts/verify-views.ts`**：讀全部 `fund_transactions(*, fund_lines(*))` 與 `fund_tx_snapshots`；對每個 transaction_id 比 `total`、`main`、`accounts`（jsonb 轉 Record<number,number>，忽略 0）、`storages`。
- [ ] **Step 2: Run**（現有測試資料）`node --experimental-strip-types --env-file=.env.local scripts/verify-views.ts` → Expected: `VIEWS OK`
- [ ] **Step 3: Commit** `test(fund): verify-views script`

---

### Task 5: 分批取全量，舊頁面改用

**Files:**
- Modify: `lib/fund-db.ts`（新增）
- Create: `lib/fund-db.test.ts`
- Modify: `app/fund/page.tsx:70`、`app/fund/new/page.tsx:64,191`、`app/fund/settle/page.tsx:44`、`app/fund/transfer/page.tsx:26`、`app/fund/monthly/page.tsx`（凡 `from('fund_transactions').select('*, fund_lines(*)')` 處）

**Interfaces:**
- Produces: `fetchAllTransactions(client: SupabaseClient, pageSize = 1000): Promise<FundTransaction[]>`（`.order('occurred_on').order('seq').order('id').range(from, to)` 迴圈直到回傳少於 pageSize）。

- [ ] **Step 1: 寫 `lib/fund-db.test.ts`**：以假 client（`from().select().order().range()` 鏈，依 range 回切片）餵 1,203 筆，斷言回傳長度 1203 且呼叫 `range` 2 次。
- [ ] **Step 2: Run** `npm test` → Expected: FAIL `fetchAllTransactions is not a function`
- [ ] **Step 3: 實作** `fetchAllTransactions` 於 `lib/fund-db.ts`（接受 client 參數，方便腳本用 service role）。
- [ ] **Step 4: Run** `npm test` → Expected: PASS
- [ ] **Step 5: 五個舊頁面改呼叫 `fetchAllTransactions(supabase)`**；`scripts/verify-views.ts` 也改用。
- [ ] **Step 6: Run** `npx tsc --noEmit` 與 `preview_start dev` 開 `/fund` → Expected: 畫面與改前相同。
- [ ] **Step 7: Commit** `fix(fund): fetch all transactions in pages (PostgREST 1000-row cap)`

---

### Task 6: 匯入模組 ① CSV 解析與列正規化

**Files:**
- Create: `scripts/import/csv.ts`、`scripts/import/csv.test.ts`
- Create: `scripts/import/normalize.ts`、`scripts/import/normalize.test.ts`
- Create: `scripts/import/aliases.ts`

**Interfaces:**
- `parseCsv(text: string): string[][]`（RFC4180：引號內換行與 `""`；去 BOM；回傳含表頭）。
- `type RawRow = { row: number; kind: string; date: string; title: string; voucher: string; amountCell: string; note: string; snapshotCell: string; comment: string }`；`toRawRows(rows: string[][]): RawRow[]`（跳表頭，`row` = 實體列號 2 起）。
- `parseDate(cell: string, prev: string): { occurred: string; stated: string | null; note: string | null; warn?: string }`：`YYYY/M/D` → ISO；缺日 → `YYYY-MM-01` + warn；無法解析 → `prev` + warn；括號文字 → `note`。
- `parseAmounts(cell: string, sign: 1 | -1): { amount: number; label: string | null }[]`：以 `\n` 切，token 正則 `^([+-]?)\s*([\d,]+|·|～[\d,]+)\s*(?:（(.+?)）)?$`；`·`→0；`～5000`→5000；無號依 `sign`；孤立 `+` 併下一行。
- `parseSnapshot(cell: string): Record<string, number> | null`：`^(.+?)：(-?[\d,]+)` 逐行；套 `ACCOUNT_ALIASES`；忽略 `剩餘`、分隔線；空 cell → null。
- `parseTags(note: string): { tags: string[]; storage: '郵局'|'現金'|'現金（廚房）'|null; advancer: '中央蘭室'|'信用卡'|null; claimed: boolean; waived: boolean; transfers: { from: string; to: string; amount: number }[]; member: string | null; handler: string | null; last5: string | null; months: string[] }`（規則見 spec §5.4；`#已請款|#應請款已請款`→claimed；`放棄請款|不請款|#無須支付`→waived；`#「A」(轉入|匯入)「B」N元`→transfers）。
- `aliases.ts`: `ACCOUNT_ALIASES`（會計專款／特殊專款→特殊專款、Kody手術專款／Kody專款→特殊專款（Kody）、共享廚房常備專用款→小組專款（廚房）、蘭室樂團 小組專款／蘭樂→小組專款（蘭樂）、Maker 小組專款→小組專款（Maker）、印表機碳粉匣專用→臨時專款（印）、緊急備用金→緊急應變備用金、前瞻預算→共存前瞻預算、沙龍專款→小組專款（沙龍）、現金袋→現金、`特殊專款（非人））`→特殊專款（非人））、`MEMBER_ALIASES`（Asher↔艾希爾、Colson&懸↔懸&Colson、巢穴夫夫→柏萊赫夫夫、Yuyu→YUYU）、`NON_MEMBER_DONORS`（佳凌、匿名、Jessie、Lucy姊、Betty）。

- [ ] **Step 1: 寫 `csv.test.ts`**：BOM＋引號內換行的 3 列樣本 → 長度 3、第 2 列第 7 欄含 `\n`。
- [ ] **Step 2: Run** `npm test` → FAIL
- [ ] **Step 3: 實作 `csv.ts`**（狀態機，無依賴）
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: 寫 `normalize.test.ts`**，用總表真實字串當案例：
  - `parseAmounts('1000\n+11000（會計專款）', 1)` → `[{1000,null},{11000,'會計專款'}]`
  - `parseAmounts('-11000\n-12（手續費）', -1)` → `[{-11000,null},{-12,'手續費'}]`
  - `parseAmounts('～5000', 1)` → `[{5000,null}]`
  - `parseDate('2025/04/4\n（延後結算）', '2025-03-31')` → `{occurred:'2025-04-04', stated:'2025-04-04', note:'延後結算'}`
  - `parseDate('2026/11/', '2026-11-03')` → occurred `2026-11-01`, warn
  - `parseSnapshot('不凍結零用金：1546\n緊急應變備用金：0\n————————\n郵局：46\n現金：1500\n小結：1546')` → `{不凍結零用金:1546, 緊急應變備用金:0, 郵局:46, 現金:1500, 小結:1546}`
  - `parseTags('#巢穴共同體成員奉納\n#林承翰 #現金 #存放現金袋')` → storage '現金', member '林承翰'
  - `parseTags('#中央蘭室代墊 #已請款')` → advancer '中央蘭室', claimed true
  - `parseTags('#「郵局」轉入「現金袋」5000元')` → transfers `[{from:'郵局',to:'現金',amount:5000}]`
- [ ] **Step 6: Run** → FAIL；**Step 7: 實作 `normalize.ts` 與 `aliases.ts`**；**Step 8: Run** → PASS
- [ ] **Step 9: Commit** `feat(import): csv parser and row normalization`

---

### Task 7: 匯入模組 ② 分類

**Files:**
- Create: `scripts/import/classify.ts`、`scripts/import/classify.test.ts`

**Interfaces:**
- `classifyRow(r: RawRow, tags: ReturnType<typeof parseTags>): { type: FundTransactionType; incomeSource: IncomeSource | null; isMonthMarker: boolean }`：
  - `kind=''` 且 `amountCell` 符合 `月份` → `isMonthMarker`。
  - 收入：`tags.member && note 含 #巢穴共同體成員奉納` → donation/donation；`#沙龍營業|#營業收入` → income/salon；title 含 `借款|借貸|紓困` → loan/loan；`回注|回流` → refund/reinject；`#利息` → income/interest；`隨喜` → income/kitchen；`自由の奉納|巢流祭|聚餐|分攤` 或 donor ∈ NON_MEMBER_DONORS → income/event；其餘 income/other。
  - 支出：title 符合 `償還.+?(所提供|借)` → repayment；其餘 expense。
  - `結算`→settlement；`初始金額`／含 `二階實踐`→opening；`歸零清算`→reset；`小組彙整`→group_summary；`轉帳`→transfer。

- [ ] **Step 1: 寫 `classify.test.ts`**（10 個案例，含「償還巢穴眾Eason所提供…」→repayment、「共享廚房金流1月結算彙整」→group_summary、kind `二階實踐\n初始金額`→opening）
- [ ] **Step 2: Run** → FAIL；**Step 3: 實作**；**Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat(import): row classification`

---

### Task 8: 匯入模組 ③ 快照差對帳（Δ→lines 解算器）

**Files:**
- Create: `scripts/import/reconcile.ts`、`scripts/import/reconcile.test.ts`

**Interfaces:**
- `type Refs = { accounts: { id: number; name: string; kind: string; default_storage_id: number | null }[]; storages: { id: number; name: string }[]; mainId: number }`
- `type Line = { account_id: number; storage_id: number; amount: number; label: string | null }`
- `snapshotDelta(prev: Record<string,number> | null, cur: Record<string,number>, refs: Refs): { accounts: Record<number, number>; storages: Record<number, number> }`（科目名與存放名由 refs 的 name 對應；`小結` 不算）。
- `solveLines(delta, refs, hint: { storage: string | null; label?: string | null }): Line[]`：先把每個非 main 科目的 Δ 配到其 `default_storage_id`（若該存放的 Δ 不足則配到 Δ 最大的存放）；剩餘各存放 Δ 全配 main。回傳合計必須等於 delta。
- `buildLines(parsed: { amounts: {amount:number; label:string|null}[]; tags: ...; type }, delta, refs): { lines: Line[]; usedSolver: boolean }`：先依 amounts＋tags 組 lines（label 走 ACCOUNT_ALIASES 定科目，否則 main；storage 由 tags.storage 或科目預設），加上 `tags.transfers` 的成對 lines；與 delta 比對，相等則用之，否則 `usedSolver=true` 改用 `solveLines`。
- `checkLines(lines, delta): { ok: boolean; diff: ... }`。
- 代墊規則：`tags.advancer && delta 全為 0` → 回傳 `lines: []` 與 `offLedger: true`；`tags.waived` → `lines: []`、`waived: true`。

- [ ] **Step 1: 寫 `reconcile.test.ts`**（refs 用 002 seed 名稱、假 id）：
  - 奉納 1500 存現金：delta `{main:+1500}`,`{現金:+1500}` → 一條 line main/現金 1500，`usedSolver=false`。
  - Barney `1000 / +11000（會計專款）` 匯入郵局：兩條 line（main/郵局 1000、特殊專款/郵局 11000）。
  - 結算凍存：delta `{main:-1734, 緊急:+867, 前瞻:+867}`, storages 全 0 → solver 產生三條（郵局），合計 0。
  - 代墊 Δ=0 → `offLedger: true, lines: []`。
  - 解算結果與 delta 不符時 `checkLines.ok=false`。
- [ ] **Step 2: Run** → FAIL；**Step 3: 實作**；**Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat(import): snapshot-delta reconciliation`

---

### Task 9: 匯入主程式（dry-run）

**Files:**
- Create: `scripts/import-ledger.ts`
- Create: `scripts/import/plan.ts`（把 RawRow 序列變成待寫入的 `PlannedTx[]`，純函式）、`scripts/import/plan.test.ts`

**Interfaces:**
- `type PlannedTx = { importRow: number; type; occurredOn: string; statedOn: string | null; dateNote: string | null; seq: number; title: string; voucher: string | null; note: string | null; comment: string | null; amount: number; incomeSource; offLedger: boolean; lines: Line[]; sub?: { table: 'fund_donations'|'fund_expenses'|'fund_loans'|'fund_repayments'|'fund_settlements'; row: Record<string, unknown> }（group_summary、transfer、reset、opening 無子表）; warns: string[] }`
- `planImport(rows: RawRow[], refs: Refs & { members; handlers; advancers; tags }): { txs: PlannedTx[]; payables: {title; amount; due_on; vendor}[]; preLoans: {lender; principal; started_on}[]; missingRefs: {kind:'account'|'storage'; name}[]; mismatches: {row; expected; built}[]; warns: string[] }`：
  - 逐列：月份標記跳過；`parseDate`（prev 為上一有效列）；**`occurredOn` = max(parsed, 上一列 occurredOn)**，原值存 `statedOn`；`seq = importRow`。
  - 快照鏈：空快照列累積 delta 到下一有效快照再一次比對；列 406–424 的 `剩餘` 視為空快照。
  - 結算列：先從備註解析還款 `#不凍結零用金(\d+)元用以償還（?(\d+)元手續費）?\s*(.+?)所提供` → 獨立 `repayment` PlannedTx。**seq 規則（全計畫一致）**：一般列 `seq = importRow*10`；結算列附帶的還款 `importRow*10`、結算本體 `importRow*10+1`；歸零清算 reset 放 `424*10+5`；結算 lines 由 solver 產生；`fund_settlements` row：`month` 由 `***N月結算***` 推（12 月落在次年 1 月時年份減一）、`period_no` 同月第幾次、`freeze_base` = 結算前 main、`frozen_reserve/future` = 兩 reserve 的 Δ、`zero_reason` = 備註含 `因餘款不足` ? '因餘款不足' : (凍存 0 ? '匯入：原因未註明' : null)、`system_post/cash` = 快照郵局／現金、`late_days` = 結算日 − 該月 20 日（負數記 0）。
  - 歸零清算：列 405 `reset` 的 lines = 處理完 406–424 後所有科目／存放餘額取負，seq 放在 424 之後；列 425 `opening` 建二階起始 lines。
  - 代墊：Δ=0 → `offLedger`, expenses.claim_status 'unclaimed'（列 544 另 warn）；Δ≠0 → 'claimed'，`claimed_transaction_id` 留待寫入後回填為自身 id；waived → 'waived'。
  - 末兩列 892–893（無快照、日期 `2026/11/`）→ `payables`（due_on：備註含 `11/24` 則 2026-11-24）。
  - 還款：依 lender 名稱配 `preLoans`（首次出現即建，principal 累加還款額，最後加上最後一次結算備註 `剩餘N元` 的 N）。
  - 子表：donations（member 由 tags.member 走 MEMBER_ALIASES 找 nickname；找不到且 ∈ NON_MEMBER_DONORS → 改 income/event 無 sub；其他找不到 → `missingRefs`）、expenses（vendor=`【(.+?)】`、description=其餘、voucher_no、tags ∩ fund_tags.name（含去 `巢穴共同體` 前綴）、advancer_id、claim_status）、loans、repayments、settlements。
- `scripts/import-ledger.ts`：參數 `--csv`（預設 `巢穴參考資料/巢穴共同體 公基金計畫 流水帳 - 總表.csv`）、`--dry-run`、`--reset`、`--until=ROW`、`--allow-fix`；dry-run 印：列數、各 type 計數、income_source 計數、`mismatches`（第一個即停，除非 `--allow-fix`）、`missingRefs`、`warns`、`payables`、`preLoans`。

- [ ] **Step 1: 寫 `plan.test.ts`**：用總表前 20 列（含初始、11 月奉納、Barney 多金額、會計費支出）的真實字串當 fixture → `txs.length=19`（跳 1 個月份標記）、無 mismatches、第 1 筆 type opening total 46、Barney 筆 2 條 lines。
- [ ] **Step 2: Run** → FAIL；**Step 3: 實作 `plan.ts`**；**Step 4: Run** → PASS
- [ ] **Step 5: 實作 `scripts/import-ledger.ts`**（讀 refs 用 service role；dry-run 不寫）。
- [ ] **Step 6: Run** `node --experimental-strip-types --env-file=.env.local scripts/import-ledger.ts --dry-run` → Expected: `mismatches: 0`、`missingRefs: 0`（有則把缺的科目／存放加進 002 或 aliases 再跑）、settlement 24、payables 2、preLoans 含 Eason。調整 aliases／規則直到 0 mismatch；每次調整都加對應單測。
- [ ] **Step 7: Commit** `feat(import): ledger import planner and dry-run CLI`

---

### Task 10: 寫入、回填與驗證

**Files:**
- Modify: `scripts/import-ledger.ts`（write 模式）
- Create: `scripts/import/write.ts`

**Interfaces:**
- `resetLedger(client)`：刪 `fund_transactions`、`fund_payables`、`fund_loans where transaction_id is null`。
- `writePlan(client, plan): Promise<{ inserted: number }>`：順序 preLoans → txs（每筆 tx→lines→sub；`source='import'`、`import_row`）→ 回填 `fund_expenses.claimed_transaction_id = 自身` where claim_status='claimed' and source import → payables → `fund_members.joined_at = min(occurred_on) of donations` where joined_at is null。
- 已存在 `source='import'` 且未給 `--reset` → 印提示並 exit 2。

- [ ] **Step 1: 實作 `write.ts` 與 CLI write 模式**。
- [ ] **Step 2: Run** `... scripts/import-ledger.ts --reset` → Expected: `inserted 8xx`，結尾自動執行 verify：重讀全部 → `computeRunningBalances` 逐列對快照 → `IMPORT OK`。
- [ ] **Step 3: Run** `scripts/verify-views.ts` → `VIEWS OK`
- [ ] **Step 4: SQL 驗收**（SQL Editor）：
  - `select total from fund_tx_snapshots order by ord desc limit 1` = 1627
  - `select count(*) from fund_settlements` = 24；`select count(*) from fund_settlements where frozen_reserve=0 and zero_reason is null` = 0
  - `select count(*) from fund_transactions where type='donation'` = 402；`income_source='salon'` = 17
  - `select count(*) from fund_payables where status='open'` = 2，sum = 23168
  - `select count(*) from fund_transactions where stated_on <> occurred_on` > 0
  - `select * from fund_outstanding_loans` 列出 Eason、嚴昕、Ruby，remaining 與最後結算備註一致（人工核對，印出）
- [ ] **Step 5: 再跑一次不加 `--reset`** → Expected: exit 2、資料筆數不變。
- [ ] **Step 6: 開舊 `/fund`**（preview）→ 最上方小結 4,165，流水帳可捲到 2024/11。
- [ ] **Step 7: Commit** `feat(import): write mode, backfills and post-import verification`

---

## 計畫完成後

- 把 dry-run／verify 輸出貼回對話，請會計核對 `fund_outstanding_loans` 與 `fund_members.joined_at`。
- 接著寫計畫 B（公基金 V2 介面：`/fund-v2` 帳／記／算／統計）與計畫 C（章程規則），兩者以本計畫的 view 名稱與欄位為介面。
