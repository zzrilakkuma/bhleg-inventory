# 公基金 V2 計畫 C：章程規則與設定 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把章程規則接進 V2：會計可在 `/fund-v2/settings` 調整規則、成員在籍、緊急狀態與角色；「算」依這些規則提醒（未繳、小組彙整逾期、固定費用應付），並補上計畫 B 留下的三個缺口。

**Architecture:** 規則仍存 `fund_settings`（key/jsonb），新增一個型別化的解析層 `lib/fund-v2/settings.ts`，所有頁面改讀它而不再各自 `Number(settings.x ?? 預設)`。每個功能一個純函式模組（有單元測試）＋一個設定頁區塊元件。資料完整性的防線放在資料庫（trigger、unique index），UI 只負責把錯誤講清楚。

**Tech Stack:** Next.js 16 App Router（client components）、Tailwind 4、Supabase JS、Postgres（plpgsql trigger）、Node 22 `node:test`＋`--experimental-strip-types`。不加任何新依賴。

**Spec:** `docs/superpowers/specs/2026-11-05-fund-v2-design.md`（§2 目標與反目標、§5.1、§5.3 的 settings／members／emergencies／payables、§5.5「算」、§5.7 第 6 點）。計畫 B：`docs/superpowers/plans/2026-11-05-fund-v2-b-ui.md`。

## Global Constraints

- 分支 `fund-v2-c`（由 main 開出）。不 push、不切分支、不改 `app/fund/*`（舊系統保留不動）。
- 規則**只提醒不強制**（spec 反目標：不可強迫會計照章程 20 日結算或凍存總餘款 30%）。唯一會擋下操作的是資料完整性：最後一位會計、已有還款的借款、已被請款的代墊。
- 預設值逐字等於 `fund_settings` 現值：`donation_due_day=14`、`settlement_due_day=20`、`group_settle_due_day=14`、`exit_notice_days=5`、`monthly_cap=5000`、`standard_amount=1500`、`freeze_rate=0.3`、`freeze_base='main'`。
- 寫入只有會計（RLS 已如此）；設定頁用 `<RoleGate accountant>`；參與者看得到的新東西只有緊急狀態橫幅與每月一覽。
- 文案用繁體中文，沿用「支出／收入／轉帳」「帳／記／算」；不出現「付了錢／收到錢／搬錢」。視覺沿用 `app/fund-v2/ui.tsx` 的 `Card`、`Chip`、`Sheet`、`SectionLabel`、`Amount`；黑底、`#00FF41` 強調、負數 `#FF0055`。
- SQL 檔 `supabase/fund/011_charter.sql`，可重複執行，結尾 `select fund_apply_policies();`。套用與查詢**只能**用 Task 0 建的 `scripts/psql.cjs`（它不會把連線字串印出來）。絕不印出 `.env.local` 的任何值，也不要用會在錯誤時回顯指令列的寫法（例如 `execFileSync` 直接丟例外）。
- 模組測試不可在 import 時載入瀏覽器 client 或 `next/*`；`.ts` 相對匯入要帶副檔名。單檔測試：`node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test <file>`；全部：`npm test`。每個任務結束前 `npm test`、`npx tsc --noEmit` 都要乾淨。
- 今天日期一律用 `todayISO()`（`lib/fund.ts`，本地時區），不要用 `new Date().toISOString()`。
- 不可對線上資料庫留下測試資料。需要寫入的驗證用 `begin; … rollback;`，或在報告中列出還原 SQL 並執行。
- Commit 結尾：`Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`。

## Review Focus

1. **設定值輸入錯誤**：把凍存比例填成 `30`（想填 30%）、日期填 0 或 32、把截止日設成 31 而該月只有 30 天（視為月底）、金額留空或負數 → 不寫入，欄位旁顯示原因；`freeze_rate` 超過 0.5（兩筆凍存合計超過 100%）也拒絕。（Task 1）
2. **把自己或最後一位會計降級**：資料庫拒絕，畫面顯示「至少要保留一位會計」，角色清單不變。（Task 0、Task 5）
3. **月中加入、退出後的成員**：加入月份之前不算未繳；退出後的月份不算未繳；但退出前的奉納在每月一覽照樣顯示；`joined_at` 為空的舊成員照 `active` 判斷。（Task 2、Task 3）
4. **固定費用應付重複產生**：兩個分頁同時打開「算」、或同一天打開很多次，每個模板每月只會有一筆；本月已經記過該店家的支出就不再產生；沒有預設金額的模板不產生。（Task 0、Task 6）
5. **緊急狀態的日期**：結束日早於開始日、已有進行中的又再宣告一次 → 拒絕並說明；結束日為空代表進行中，橫幅對參與者也顯示。（Task 4）

---

## File Structure

| 檔案 | 責任 |
|---|---|
| `scripts/psql.cjs`（新） | 安全執行 SQL 檔或單句查詢，錯誤只印 stderr |
| `supabase/fund/011_charter.sql`（新） | `for_month`＋unique index、最後會計守門、刪除守門擴充、緊急狀態 check |
| `lib/fund-v2/settings.ts`（新） | 設定的型別、解析、驗證、章程落差 |
| `lib/fund-v2/membership.ts`（新） | 成員在某月是否在籍、每月一覽格子 |
| `lib/fund-v2/emergency.ts`（新） | 進行中的緊急狀態、宣告／結束的驗證 |
| `lib/fund-v2/roles.ts`（新） | 角色清單與變更的驗證 |
| `lib/fund-v2/autopay.ts`（新） | 本月應自動產生的應付 |
| `lib/fund-v2/todo.ts`（改） | 加入小組彙整逾期項目、未繳改用在籍判斷 |
| `app/fund-v2/settings/page.tsx`＋`sections/{Rules,Members,Emergency,Roles}.tsx`（新） | 設定頁，一個區塊一個檔 |
| `app/fund-v2/monthly/page.tsx`（新） | 每月奉納一覽（全員唯讀） |
| `app/fund-v2/EmergencyBanner.tsx`（新） | 版面最上方的橫幅 |
| `app/fund-v2/layout.tsx`、`settle/page.tsx`、`settle/run/page.tsx`、`record/*Form.tsx`、`ledger/RowDetail.tsx`、`stats/page.tsx`（改） | 接上述模組 |

---

### Task 0: 資料庫守門與安全的 psql 包裝

**Files:**
- Create: `scripts/psql.cjs`
- Create: `supabase/fund/011_charter.sql`

**Interfaces:**
- Produces（指令）：`node --env-file=.env.local scripts/psql.cjs -f <file.sql>`、`node --env-file=.env.local scripts/psql.cjs -c "<單一 SQL>"`。成功時輸出 psql 的 stdout（`-At` 格式）；失敗時只輸出 psql 的 stderr 並以非零結束。
- Produces（schema）：
  - `fund_payables.for_month text null`（`'YYYY-MM'`）；unique index `fund_payables_template_month_uq on (template_id, for_month)`（**不加 where**：upsert 的 `on conflict (template_id, for_month)` 無法推斷 partial index；NULL 彼此不相等，手動建立的應付不受影響）。
  - `fund_emergencies`：check `ended_on is null or ended_on >= started_on`；partial unique index `fund_emergencies_one_open on ((true)) where ended_on is null`（同時只能一筆進行中）。
  - trigger `fund_roles_keep_accountant`（before update or delete on `fund_roles`）：操作後若不再有任何 `role='accountant'` → `raise exception '至少要保留一位會計' using errcode = 'P0001'`。
  - `fund_before_delete_transaction()` 擴充（保留 010 既有行為）：
    - `OLD.type = 'loan'` 且該借款已有 `fund_repayments` → `raise exception '這筆借款已有還款紀錄，請先刪除還款'`。
    - `OLD.type = 'expense'` 且其 `fund_expenses.claim_status = 'claimed'` 且 `claimed_transaction_id <> OLD.id` → `raise exception '這筆代墊已請款，請先刪除請款交易'`。

- [ ] **Step 1: 寫 `scripts/psql.cjs`**

用 `child_process.spawnSync('psql', [process.env.SUPABASE_DB_URL, '-v', 'ON_ERROR_STOP=1', '-At', flag, value], { encoding: 'utf8' })`；`flag` 只接受 `-f` 或 `-c`。把 `r.stdout` 寫到 stdout；`r.status !== 0` 時把 `r.stderr` 寫到 stderr 後 `process.exit(1)`。缺 `SUPABASE_DB_URL` 時印 `SUPABASE_DB_URL not set` 並結束。任何路徑都不可印出 `process.argv` 以外的參數或 `r.args`／`r.error`。

- [ ] **Step 2: 確認包裝在錯誤時不洩漏**

Run: `node --env-file=.env.local scripts/psql.cjs -c "select no_such_column from fund_settings" ; echo "exit=$?"`
Expected: 一行 `ERROR:  column "no_such_column" does not exist`（加上 LINE 提示），`exit=1`，輸出中沒有 `postgresql://`。

- [ ] **Step 3: 寫 `011_charter.sql`**（照上面 Interfaces；`add column if not exists`、`create unique index if not exists`、`drop constraint if exists`＋`add constraint`、`create or replace function`、`drop trigger if exists`＋`create trigger`）

最後會計守門的函式要 `security definer set search_path = public`（一般 RLS 下它仍要能數到所有列），判斷式：`not exists (select 1 from fund_roles where role = 'accountant' and user_id <> OLD.user_id)` 且（是 delete，或 `NEW.role <> 'accountant'`）。

- [ ] **Step 4: 套用兩次，確認可重複執行**

Run: `node --env-file=.env.local scripts/psql.cjs -f supabase/fund/011_charter.sql && node --env-file=.env.local scripts/psql.cjs -f supabase/fund/011_charter.sql ; echo "exit=$?"`
Expected: `exit=0`。

- [ ] **Step 5: 以回滾交易驗證四個守門**

寫 `scratch` SQL 檔（放在 `$TMPDIR`，不進 repo），內容為 `begin; … rollback;`，各用 `do $$ begin … exception when others then raise notice 'BLOCKED: %', sqlerrm; end $$;` 包住，印出：
1. 把所有 accountant 改成 member → `BLOCKED: 至少要保留一位會計`
2. 刪除一筆已有還款的 loan 交易 → `BLOCKED: 這筆借款已有還款紀錄，請先刪除還款`
3. 新增一筆 dummy expense（`claimed`，`claimed_transaction_id` 指向另一筆 dummy claim）後刪除該 expense → `BLOCKED: 這筆代墊已請款，請先刪除請款交易`
4. 同一 `(template_id, for_month)` 插入兩筆 payable → `BLOCKED: duplicate key value…`；另插入兩筆 `template_id`、`for_month` 皆為 null 的 payable 必須成功（不印 BLOCKED）
5. 插入兩筆 `ended_on is null` 的 emergency → `BLOCKED: duplicate key value…`

Run: `node --env-file=.env.local scripts/psql.cjs -f "$TMPDIR/guards.sql" 2>&1`
Expected: 五行 `NOTICE:  BLOCKED: …`，訊息如上。之後 `-c "select count(*) from fund_emergencies"` 仍為 `0`。

- [ ] **Step 6: Commit**

```bash
git add scripts/psql.cjs supabase/fund/011_charter.sql
git commit -m "feat(fund-v2): charter schema guards and safe psql wrapper"
```

---

### Task 1: 型別化設定與「規則」區塊

**Files:**
- Create: `lib/fund-v2/settings.ts`, `lib/fund-v2/settings.test.ts`
- Create: `app/fund-v2/settings/page.tsx`, `app/fund-v2/settings/sections/Rules.tsx`
- Modify: `lib/fund-v2/settlement.ts`（`computeFreeze`、`buildSettlementWrite` 改吃 `FundSettings`；`lateDays` 用 `dayInMonth`）、`lib/fund-v2/settlement.test.ts`、`lib/fund-v2/todo.ts`、`lib/fund-v2/todo.test.ts`
- Modify: `app/fund-v2/settle/run/page.tsx`、`app/fund-v2/settle/page.tsx`、`app/fund-v2/record/IncomeForm.tsx`（改用 `parseSettings`）
- Modify: `app/fund-v2/layout.tsx:46`、`app/fund-v2/settle/page.tsx` 底部的「設定」連結 → `/fund-v2/settings`（「成員」→ `/fund-v2/settings#members`；「科目」維持 `/fund/manage`）

**Interfaces:**
- Produces:
```ts
export interface FundSettings {
  donation_due_day: number; settlement_due_day: number; group_settle_due_day: number;
  exit_notice_days: number; monthly_cap: number; standard_amount: number;
  freeze_rate: number; freeze_base: 'main' | 'total';
}
export type SettingKey = keyof FundSettings;
export const DEFAULT_SETTINGS: FundSettings;            // Global Constraints 的八個值
export const CHARTER_SETTINGS: FundSettings;            // 同上，但 freeze_base: 'total'
export const SETTING_META: Record<SettingKey, { label: string; unit: string; hint: string }>;
export const parseSettings: (raw: Record<string, unknown>) => FundSettings;   // 缺或不合法的 key 用預設
export const validateSetting: (key: SettingKey, input: string) => { ok: true; value: number | 'main' | 'total' } | { ok: false; reason: string };
export const charterDiffs: (s: FundSettings) => { key: SettingKey; label: string; charter: string; current: string }[];
/** month='YYYY-MM'；回傳該月實際的日（超過該月天數取月底） */
export const dayInMonth: (month: string, day: number) => number;
export const saveSetting: (client: { from: (t: string) => any }, key: SettingKey, value: number | string) => Promise<void>; // upsert {key, value, updated_at}
```
- `SETTING_META` 的 label：`奉納截止日`、`結算日`、`小組結算截止日`、`退出提前告知天數`、`單月奉納上限`、`標準奉納金額`、`凍存比例`、`凍存基準`。
- `computeFreeze(mainAfterClaims: number, settings: FundSettings, total?: number)` 回傳型別不變。

- [ ] **Step 1: 寫失敗的測試**（`settings.test.ts`）

```ts
test('parseSettings 以預設補缺、忽略不合法值', () => {
  assert.deepEqual(parseSettings({}), DEFAULT_SETTINGS);
  const s = parseSettings({ freeze_rate: 'abc', monthly_cap: 8000, freeze_base: 'weird', settlement_due_day: '25' });
  assert.equal(s.freeze_rate, 0.3); assert.equal(s.monthly_cap, 8000);
  assert.equal(s.freeze_base, 'main'); assert.equal(s.settlement_due_day, 25);
});
test('validateSetting 日期 1–31', () => {
  assert.deepEqual(validateSetting('settlement_due_day', '20'), { ok: true, value: 20 });
  assert.deepEqual(validateSetting('donation_due_day', '31'), { ok: true, value: 31 });
  for (const bad of ['0', '32', '', '1.5', '-3', 'x']) assert.equal(validateSetting('donation_due_day', bad).ok, false);
});
test('dayInMonth：該月沒有那一天就取月底', () => {
  assert.equal(dayInMonth('2026-02', 31), 28);
  assert.equal(dayInMonth('2028-02', 30), 29);
  assert.equal(dayInMonth('2026-11', 31), 30);
  assert.equal(dayInMonth('2026-11', 14), 14);
});
test('validateSetting 凍存比例 0–0.5，擋住把 30 當 30%', () => {
  assert.deepEqual(validateSetting('freeze_rate', '0.3'), { ok: true, value: 0.3 });
  assert.deepEqual(validateSetting('freeze_rate', '0'), { ok: true, value: 0 });
  const r = validateSetting('freeze_rate', '30');
  assert.equal(r.ok, false); assert.match((r as { reason: string }).reason, /0\.3/);
  assert.equal(validateSetting('freeze_rate', '0.51').ok, false);
});
test('validateSetting 金額為正整數、天數為 0 以上整數、基準二選一', () => {
  assert.equal(validateSetting('monthly_cap', '0').ok, false);
  assert.equal(validateSetting('standard_amount', '1500.5').ok, false);
  assert.deepEqual(validateSetting('exit_notice_days', '0'), { ok: true, value: 0 });
  assert.deepEqual(validateSetting('freeze_base', 'total'), { ok: true, value: 'total' });
  assert.equal(validateSetting('freeze_base', 'x').ok, false);
});
test('charterDiffs：預設實務只有凍存基準與章程不同', () => {
  const d = charterDiffs(DEFAULT_SETTINGS);
  assert.deepEqual(d.map((x) => x.key), ['freeze_base']);
  assert.equal(charterDiffs(CHARTER_SETTINGS).length, 0);
  assert.deepEqual(charterDiffs({ ...DEFAULT_SETTINGS, settlement_due_day: 5 }).map((x) => x.key), ['settlement_due_day', 'freeze_base']);
});
```
日期可填 1–31（使用者決定）；遇到沒有那一天的月份一律視為月底，所有比較「今天是否過了截止日」的地方都要先過 `dayInMonth`。`validateSetting('freeze_rate','30')` 的 reason 固定為 `請填 0 到 0.5 之間的小數，例如 30% 填 0.3`。

- [ ] **Step 2: 跑測試確認失敗** — Run: `node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test lib/fund-v2/settings.test.ts` → FAIL（module not found）

- [ ] **Step 3: 實作 `settings.ts`**，`lateDays`（`settlement.ts`）、`unpaidMembers`（`todo.ts`）內部的截止日改用 `dayInMonth(month, dueDay)`，各補一條 2 月＋截止日 31 的測試。再把 `settlement.ts`、三個頁面改成 `const settings = parseSettings(refs.settings)`；移除頁面裡的 `Number(settings.x ?? …)` 與對 `FREEZE_RATE`／`MONTHLY_CAP`／`STANDARD_AMOUNT` 常數的後備引用。更新 `settlement.test.ts` 傳入 `{ ...DEFAULT_SETTINGS, … }`，並補一條 `freeze_base: 'total'` 時以 total 為基準的測試。

- [ ] **Step 4: 跑測試** — Run: `npm test` → 全數通過

- [ ] **Step 5: 設定頁骨架與「規則」區塊**

`page.tsx`：`<RoleGate accountant>`，標題「設定」，依序放四個區塊的錨點 `#rules`、`#members`、`#emergency`、`#roles`（後三個由後續任務加入元件；本任務只放 Rules）。`Rules.tsx`：每個 key 一列（label、目前值、單位、hint），點「改」進入單列編輯，「存」時先 `validateSetting`，不合法就在該列下方以 `role="alert"` 顯示 reason 且不寫入；成功後 toast「已更新」並重新讀取。區塊最上方若 `charterDiffs` 非空，顯示一張灰框說明卡：「以下與章程條文不同（只提醒，不影響記帳）」逐列列出 `label：章程 X／目前 Y`。`freeze_base` 用兩個 `Chip`（不凍結零用金／總餘款）。

- [ ] **Step 6: 瀏覽器驗證**（控制者以會計帳號執行；implementer 無法登入，改在報告中列出待驗清單）

`/fund-v2/settings`：八列值等於 Global Constraints；把凍存比例改成 `30` → 紅字 reason、資料庫值不變；把結算日改成 25 再改回 20，`/fund-v2/settle/run` 標題列的「章程 N 日」跟著變。`?as=member` 開啟設定頁會被導回 `/fund-v2`。

- [ ] **Step 7: Commit** — `feat(fund-v2): typed settings and rules section`

---

### Task 2: 成員在籍（加入／退出）與未繳名單

**Files:**
- Create: `lib/fund-v2/membership.ts`, `lib/fund-v2/membership.test.ts`
- Create: `app/fund-v2/settings/sections/Members.tsx`
- Modify: `lib/fund-v2/todo.ts`（`unpaidMembers`）、`lib/fund-v2/todo.test.ts`、`app/fund-v2/settle/page.tsx`、`app/fund-v2/settings/page.tsx`

**Interfaces:**
- Consumes: `FundMember`（`lib/fund.ts`，含 `active`、`joined_at`、`left_at`）、`FundSettings`（Task 1）。
- Produces:
```ts
/** month = 'YYYY-MM'。left_at 有值時只看日期區間；left_at 為空時還要 active。 */
export const inMonth: (m: Pick<FundMember, 'active' | 'joined_at' | 'left_at'>, month: string) => boolean;
export const membersInMonth: <M extends Pick<FundMember, 'active' | 'joined_at' | 'left_at'>>(members: M[], month: string) => M[];
export const validateMembership: (joined: string, left: string) => { ok: true } | { ok: false; reason: string };
export const buildExitPatch: (leftOn: string, note: string) => { left_at: string; exit_note: string | null; active: false };
export const buildRejoinPatch: (joinedOn: string) => { joined_at: string; left_at: null; exit_note: null; active: true };
export const exitNoticeWarning: (leftOn: string, today: string, noticeDays: number) => string | null;
```
- `unpaidMembers(members, donationsThisMonth, today, dueDay)` 簽名不變，但內部改用 `membersInMonth(members, month)`（呼叫端不再先 `.filter((m) => m.active)`）。

- [ ] **Step 1: 寫失敗的測試**

```ts
const M = (o: Partial<FundMember>) => ({ active: true, joined_at: null, left_at: null, ...o });
test('inMonth：沒有日期的舊成員看 active', () => {
  assert.equal(inMonth(M({}), '2026-11'), true);
  assert.equal(inMonth(M({ active: false }), '2026-11'), false);
});
test('inMonth：加入當月起算、退出當月仍算', () => {
  const m = M({ joined_at: '2026-03-18', left_at: '2026-08-02', active: false });
  assert.equal(inMonth(m, '2026-02'), false);
  assert.equal(inMonth(m, '2026-03'), true);
  assert.equal(inMonth(m, '2026-08'), true);
  assert.equal(inMonth(m, '2026-09'), false);
});
test('validateMembership', () => {
  assert.equal(validateMembership('2026-03-01', '').ok, true);
  assert.equal(validateMembership('2026-03-01', '2026-02-28').ok, false);
  assert.equal(validateMembership('', '2026-02-28').ok, true);
});
test('exitNoticeWarning：少於告知天數才提醒', () => {
  assert.equal(exitNoticeWarning('2026-11-20', '2026-11-05', 5), null);
  assert.match(exitNoticeWarning('2026-11-08', '2026-11-05', 5)!, /5 天/);
});
test('unpaidMembers 不列出尚未加入與已退出者', () => {
  const ms = [
    { id: 1, nickname: 'A', ...M({}) }, { id: 2, nickname: 'B', ...M({ joined_at: '2026-12-01' }) },
    { id: 3, nickname: 'C', ...M({ left_at: '2026-10-31', active: false }) },
  ] as FundMember[];
  const out = unpaidMembers(ms, [], new Date(2026, 10, 20), 14);
  assert.deepEqual(out.map((x) => x.nickname), ['A']);
});
```

- [ ] **Step 2: 跑測試確認失敗**（membership.test.ts 與 todo.test.ts）
- [ ] **Step 3: 實作**
- [ ] **Step 4: `npm test` 通過**
- [ ] **Step 5: 「成員」區塊**

`Members.tsx`：列出所有成員（在籍在上、已退出在下以灰字），每列顯示暱稱、加入日、退出日。點列開 `Sheet`：加入日（date）、「退出」按鈕 → 退出日（預設今天）＋退出說明，下方即時顯示 `exitNoticeWarning`（黃字，只提醒）；已退出者顯示「重新加入」→ 加入日（預設今天）。寫入 `fund_members`（`update … eq('id', id)`）。區塊頂端若有在籍但 `joined_at` 為空的成員，顯示「N 位成員尚未填加入日」。

- [ ] **Step 6: 瀏覽器驗證**（控制者）：3 位無加入日的成員出現在提示中；把某成員設為今天退出再「重新加入」並把加入日還原成原值（還原 SQL 寫進報告）。
- [ ] **Step 7: Commit** — `feat(fund-v2): membership dates and unpaid list by membership`

---

### Task 3: 每月奉納一覽（全員唯讀）

**Files:**
- Create: `app/fund-v2/monthly/page.tsx`
- Modify: `lib/fund-v2/membership.ts`、`lib/fund-v2/membership.test.ts`、`lib/fund-v2/api.ts`（`getDonationsForMonths`）、`app/fund-v2/stats/page.tsx`（加入口連結「每月奉納一覽」）、`app/fund-v2/settle/TodoCard.tsx`（未繳項目連到此頁）

**Interfaces:**
- Consumes: `inMonth`（Task 2）、`recentMonths(n)`（`lib/fund.ts`）。
- Produces:
```ts
export interface DonationRow { member_id: number | null; months: string[]; amount: number; paid_on: string }  // paid_on = 交易的 stated_on ?? occurred_on
export const getDonationsForMonths: (client: SupabaseClient, months: string[]) => Promise<DonationRow[]>;
// fund_donations 內嵌 fund_transactions(amount, occurred_on, stated_on)，以 .overlaps('months', months) 篩選

export type Cell = { state: 'paid'; amount: number } | { state: 'covered' } | { state: 'unpaid' } | { state: 'na' };
export const donationGrid: (members: FundMember[], months: string[], rows: DonationRow[], today: string, dueDay: number)
  => { member: FundMember; cells: Cell[] }[];
```
- **不平均分攤（使用者決定，與總表一致：總表把整筆金額記在收款那一列，標題寫「12月+1月+2月 奉納金」）**。一筆奉納的整筆金額只記在一格：收款月（`paid_on.slice(0,7)`）若在涵蓋月份內就記在收款月，否則記在涵蓋月份的第一個月；其餘涵蓋月份為 `covered`（已含，無金額）。同成員同月多筆金額相加；同一格既有金額又被別筆涵蓋時為 `paid`。`months` 為空的舊資料視為只涵蓋收款月。合計列只加 `paid` 的金額，因此各月合計＝該月認列的實收。
- `na`：該月不在籍。`unpaid`：在籍、無奉納，且（該月早於本月，或為本月且今天日期 > dueDay）；本月尚未過截止日、或未來月份且無奉納 → 也回 `{ state: 'na' }`。
- 列出的成員＝在任一所選月份在籍者；排序沿用 `sort_order`。

- [ ] **Step 1: 寫失敗的測試**

```ts
test('donationGrid：整筆記在收款月、在籍外為 na、截止日前不算未繳', () => {
  const ms = [
    { id: 1, nickname: 'A', sort_order: 1, active: true, joined_at: null, left_at: null },
    { id: 2, nickname: 'B', sort_order: 2, active: true, joined_at: '2026-11-01', left_at: null },
  ] as FundMember[];
  const rows = [{ member_id: 1, months: ['2026-10', '2026-11'], amount: 3000, paid_on: '2026-11-03' }];
  const g = donationGrid(ms, ['2026-10', '2026-11'], rows, '2026-11-05', 14);
  assert.deepEqual(g[0].cells, [{ state: 'covered' }, { state: 'paid', amount: 3000 }]);   // 整筆記在收款月
  assert.deepEqual(g[1].cells, [{ state: 'na' }, { state: 'na' }]);           // 10 月未加入；11 月未過 14 日
  const late = donationGrid(ms, ['2026-11'], rows.slice(0, 0), '2026-11-20', 14);
  assert.deepEqual(late.map((r) => r.cells[0].state), ['unpaid', 'unpaid']);
});
test('donationGrid：收款月不在涵蓋月份內 → 記在第一個涵蓋月；同格多筆相加', () => {
  const ms = [{ id: 1, nickname: 'A', sort_order: 1, active: true, joined_at: null, left_at: null }] as FundMember[];
  const rows = [
    { member_id: 1, months: ['2025-12', '2026-01', '2026-02'], amount: 4500, paid_on: '2026-03-02' },
    { member_id: 1, months: ['2025-12'], amount: 500, paid_on: '2025-12-20' },
  ];
  const g = donationGrid(ms, ['2025-12', '2026-01', '2026-02', '2026-03'], rows, '2026-03-20', 14);
  assert.deepEqual(g[0].cells, [{ state: 'paid', amount: 5000 }, { state: 'covered' }, { state: 'covered' }, { state: 'unpaid' }]);
});
```

- [ ] **Step 2–4: 失敗 → 實作 → `npm test` 通過**
- [ ] **Step 5: 頁面**

`/fund-v2/monthly`：不設 RoleGate（全員可看，spec §5.1）。上方 `Chip` 選 6／12 個月；表格第一欄暱稱固定（`sticky left-0`），每月一欄；`paid` 顯示金額（`tabular-nums`，白字），`covered` 顯示綠色 `✓`＋`aria-label="已含在另一筆奉納"`，`unpaid` 顯示紅點＋`aria-label="未繳"`，`na` 顯示 `·`。表格下方一行灰字圖例：「✓ 已含在另一筆奉納（一次繳多個月時，金額記在收款那個月）」。表格外層 `overflow-x-auto`，375px 可橫向捲動。底部一列各月合計。

- [ ] **Step 6: 瀏覽器驗證**（控制者）：挑總表第 431、542 列那位成員：2026/1 顯示 4,500、2025/12 與 2026/2 為 ✓；2026/3 顯示 4,500、4 與 5 月為 ✓（舊 `/fund/monthly` 是平均分攤，數字本來就不同，不用對照）；另挑 1 位單月奉納的成員對照舊頁金額一致；`?as=member` 可看；375px 不破版。
- [ ] **Step 7: Commit** — `feat(fund-v2): monthly donation grid`

---

### Task 4: 緊急狀態

**Files:**
- Create: `lib/fund-v2/emergency.ts`, `lib/fund-v2/emergency.test.ts`, `app/fund-v2/EmergencyBanner.tsx`, `app/fund-v2/settings/sections/Emergency.tsx`
- Modify: `app/fund-v2/layout.tsx`（`<main>` 內、預覽條之下放 `<EmergencyBanner />`）、`app/fund-v2/settings/page.tsx`、`app/fund-v2/record/TransferForm.tsx`

**Interfaces:**
- Produces:
```ts
export interface Emergency { id: number; started_on: string; ended_on: string | null; note: string | null }
export const getEmergencies: (client: SupabaseClient) => Promise<Emergency[]>;      // started_on desc
export const openEmergency: (list: Emergency[]) => Emergency | null;                  // ended_on 為空者
export const validateDeclare: (list: Emergency[], startedOn: string, note: string) => { ok: true } | { ok: false; reason: string };
export const validateEnd: (e: Emergency, endedOn: string) => { ok: true } | { ok: false; reason: string };
export const bannerText: (e: Emergency) => string;   // `緊急狀態中（自 2026/11/5 起）：${note}`
export const emergencyDecisionRef: (e: Emergency) => string; // `緊急狀態 2026/11/5`
```
- 拒絕原因固定文字：已有進行中 →「已有進行中的緊急狀態，請先結束」；說明空白 →「請填寫動機與措施」；結束日早於開始日 →「結束日不能早於開始日」。

- [ ] **Step 1: 寫失敗的測試**

```ts
const E = (o: Partial<Emergency>): Emergency => ({ id: 1, started_on: '2026-11-05', ended_on: null, note: '停電', ...o });
test('openEmergency', () => {
  assert.equal(openEmergency([E({ ended_on: '2026-11-10' })]), null);
  assert.equal(openEmergency([E({ id: 2 }), E({ id: 1, ended_on: '2026-01-01' })])!.id, 2);
});
test('validateDeclare', () => {
  assert.deepEqual(validateDeclare([E({})], '2026-12-01', 'x'), { ok: false, reason: '已有進行中的緊急狀態，請先結束' });
  assert.deepEqual(validateDeclare([], '2026-12-01', '  '), { ok: false, reason: '請填寫動機與措施' });
  assert.equal(validateDeclare([E({ ended_on: '2026-11-10' })], '2026-12-01', 'x').ok, true);
});
test('validateEnd', () => {
  assert.deepEqual(validateEnd(E({}), '2026-11-04'), { ok: false, reason: '結束日不能早於開始日' });
  assert.equal(validateEnd(E({}), '2026-11-05').ok, true);
});
test('bannerText / emergencyDecisionRef', () => {
  assert.equal(bannerText(E({})), '緊急狀態中（自 2026/11/5 起）：停電');
  assert.equal(emergencyDecisionRef(E({})), '緊急狀態 2026/11/5');
});
```

- [ ] **Step 2–4: 失敗 → 實作 → `npm test` 通過**
- [ ] **Step 5: UI**

`EmergencyBanner`：自行讀 `getEmergencies`，有進行中才渲染一條 `role="status"` 的紅框橫幅（文字 `bannerText`）；讀取失敗時不渲染、不拋錯。`Emergency.tsx`：無進行中 →「宣告緊急狀態」（開始日預設今天、說明必填）；有進行中 → 顯示內容與「結束緊急狀態」（結束日預設今天）；下方列出歷史。`declared_by` 寫入目前使用者 id。資料庫 unique 衝突（另一分頁已宣告）時顯示「已有進行中的緊急狀態，請先結束」。`TransferForm`：從 reserve 科目轉出且有進行中緊急狀態、而「依據」欄位為空時，預填 `emergencyDecisionRef(e)`（使用者可改）。

- [ ] **Step 6: 瀏覽器驗證**（控制者）：宣告 → 帳／算／統計頁都看到橫幅，`?as=member` 也看到；轉帳從緊急應變備用金出時依據已預填（不送出）；結束 → 橫幅消失。驗證後以 `delete from fund_emergencies` 還原並確認 count 為 0。
- [ ] **Step 7: Commit** — `feat(fund-v2): emergency state and banner`

---

### Task 5: 角色管理

**Files:**
- Create: `lib/fund-v2/roles.ts`, `lib/fund-v2/roles.test.ts`, `app/fund-v2/settings/sections/Roles.tsx`
- Modify: `app/fund-v2/settings/page.tsx`

**Interfaces:**
- Consumes: Task 0 的 `fund_roles_keep_accountant` trigger（錯誤訊息含「至少要保留一位會計」）。
- Produces:
```ts
export interface RoleRow { member_id: number; nickname: string; user_id: string | null; role: 'accountant' | 'member' }
export const roleRows: (members: Pick<FundMember, 'id' | 'nickname' | 'user_id' | 'active'>[], roles: { user_id: string; role: string }[]) => RoleRow[];
export const canChange: (row: RoleRow, to: 'accountant' | 'member', rows: RoleRow[], selfUserId: string)
  => { ok: true } | { ok: false; reason: string };
export const setRole: (client: { from: (t: string) => any }, userId: string, to: 'accountant' | 'member') => Promise<void>;
// to='accountant' → upsert {user_id, role}；to='member' → delete eq('user_id', userId)
export const roleErrorText: (e: unknown) => string;   // 含「至少要保留一位會計」時原樣回傳該句，其餘回 String(message)
```
- `roleRows` 只列 `active` 成員；`user_id` 為空者 `role='member'`。
- `canChange` 拒絕原因：無帳號 →「這位成員還沒有登入帳號」；降級自己 →「不能移除自己的會計權限，請由另一位會計操作」；降級後沒有會計 →「至少要保留一位會計」。

- [ ] **Step 1: 寫失敗的測試**

```ts
const rows: RoleRow[] = [
  { member_id: 1, nickname: 'S', user_id: 'u1', role: 'accountant' },
  { member_id: 2, nickname: 'E', user_id: 'u2', role: 'accountant' },
  { member_id: 3, nickname: 'X', user_id: null, role: 'member' },
  { member_id: 4, nickname: 'Y', user_id: 'u4', role: 'member' },
];
test('canChange', () => {
  assert.deepEqual(canChange(rows[2], 'accountant', rows, 'u1'), { ok: false, reason: '這位成員還沒有登入帳號' });
  assert.deepEqual(canChange(rows[0], 'member', rows, 'u1'), { ok: false, reason: '不能移除自己的會計權限，請由另一位會計操作' });
  assert.equal(canChange(rows[1], 'member', rows, 'u1').ok, true);
  assert.deepEqual(canChange(rows[1], 'member', [rows[1], rows[3]], 'u9'), { ok: false, reason: '至少要保留一位會計' });
  assert.equal(canChange(rows[3], 'accountant', rows, 'u1').ok, true);
});
test('roleRows 合併成員與角色、略過停用成員', () => {
  const out = roleRows(
    [{ id: 1, nickname: 'S', user_id: 'u1', active: true }, { id: 2, nickname: 'Z', user_id: 'u2', active: false }, { id: 3, nickname: 'X', user_id: null, active: true }],
    [{ user_id: 'u1', role: 'accountant' }]);
  assert.deepEqual(out.map((r) => [r.nickname, r.role]), [['S', 'accountant'], ['X', 'member']]);
});
test('roleErrorText', () => {
  assert.equal(roleErrorText({ message: 'P0001: 至少要保留一位會計' }), '至少要保留一位會計');
});
```

- [ ] **Step 2–4: 失敗 → 實作 → `npm test` 通過**
- [ ] **Step 5: 「角色」區塊**：每列暱稱＋目前角色＋切換鈕（「設為會計」／「改為參與者」）；`canChange` 不通過時按鈕 disabled 並以小字顯示 reason；寫入失敗用 `roleErrorText` 顯示於 `role="alert"`。
- [ ] **Step 6: 瀏覽器驗證**（控制者）：自己的列不能降級；無帳號成員按鈕 disabled。不實際變更角色。
- [ ] **Step 7: Commit** — `feat(fund-v2): role management`

---

### Task 6: 「算」的規則提醒與計畫 B 缺口

**Files:**
- Create: `lib/fund-v2/autopay.ts`, `lib/fund-v2/autopay.test.ts`
- Modify: `lib/fund-v2/todo.ts`、`lib/fund-v2/todo.test.ts`、`lib/fund-v2/ledger.ts`、`lib/fund-v2/ledger.test.ts`
- Modify: `app/fund-v2/settle/page.tsx`、`app/fund-v2/settle/TodoCard.tsx`、`app/fund-v2/record/{ExpenseForm,IncomeForm,TransferForm}.tsx`、`app/fund-v2/ledger/RowDetail.tsx`

**Interfaces:**
- Consumes: `FundSettings`（Task 1）、`FundTemplate`（`recurring`、`due_day`、`default_amount`、`vendor`、`name`、`active`）、Task 0 的 `for_month` unique index 與刪除守門訊息、`FundPeriod`（`api.ts`）。
- Produces:
```ts
// autopay.ts
export interface NewPayable { title: string; amount: number; due_on: string | null; template_id: number; vendor: string | null; for_month: string; status: 'open' }
/** due_day 為空 → null；其餘用 Task 1 的 `dayInMonth` */
export const dueDate: (month: string, dueDay: number | null) => string | null;
export const missingPayables: (
  templates: FundTemplate[], month: string,
  existing: { template_id: number | null; for_month: string | null }[],
  expensedVendors: Set<string>,
) => NewPayable[];
export const ensureMonthlyPayables: (client: { from: (t: string) => any }, rows: NewPayable[]) => Promise<number>;
// upsert(rows, { onConflict: 'template_id,for_month', ignoreDuplicates: true })；rows 為空時不呼叫；回傳送出的列數

// todo.ts（新增）
export type TodoItem<P> = … | { kind: 'group_due'; names: string[] };
export const groupsMissingSummary: (
  groups: { id: number; name: string; active: boolean; kind: string }[],
  summaries: { group_id: number | null; title: string }[], today: string, dueDay: number,
) => string[];   // 今天日期 <= dueDay 回 []；只看 active 且 kind='group' 的科目；回傳上個月沒有彙整的科目名

// ledger.ts（新增）
export const backdateWarning: (date: string, lastSettledOn: string | null) => string | null;
// date < lastSettledOn → `這個日期早於上次結算（${lastSettledOn.replace(/-0?/g,'/')}），已公布的數字會跟著變動`
export const deleteErrorText: (e: unknown) => string;
// message 含「請先刪除還款」或「請先刪除請款交易」→ 回該句中文；其餘 `刪除失敗：${message}`
```
- `missingPayables` 條件：`active && recurring && default_amount > 0`、`existing` 沒有同 `(template_id, month)`、`vendor` 不在 `expensedVendors`。title＝`${month 的月份}月 ${template.name}`（例：`11月 華南貸款`）。
- `groupsMissingSummary` 的「彙整屬於哪個月」：`group_summary` 交易標題格式為 `${科目名} ${N}月 彙整`（`buildGroupSummaryWrite`），以標題中的 `N月` 比對上個月的月份數字。呼叫端查詢 `fund_transactions` 中 `type='group_summary'` 且 `occurred_on` 在近 60 天內的列。

- [ ] **Step 1: 寫失敗的測試**

```ts
// autopay.test.ts
const T = (o: Partial<FundTemplate>) => ({ id: 1, name: '華南貸款', vendor: '華南 貸款', default_amount: 17434, recurring: true, active: true, due_day: null, ...o }) as FundTemplate;
test('dueDate', () => {
  assert.equal(dueDate('2026-11', null), null);
  assert.equal(dueDate('2026-11', 5), '2026-11-05');
  assert.equal(dueDate('2026-02', 31), '2026-02-28');
});
test('missingPayables：只產生有預設金額、尚未建立、本月未支出的模板', () => {
  const ts = [T({}), T({ id: 2, name: '電費', vendor: '台灣電力公司', default_amount: null }), T({ id: 3, name: '國泰貸款', vendor: '國泰 貸款', default_amount: 5453 }),
              T({ id: 4, name: '停車場月租', vendor: 'USPACE', default_amount: 3800 }), T({ id: 5, name: '舊', default_amount: 100, active: false })];
  const out = missingPayables(ts, '2026-11', [{ template_id: 3, for_month: '2026-11' }, { template_id: 1, for_month: '2026-10' }], new Set(['USPACE']));
  assert.deepEqual(out, [{ title: '11月 華南貸款', amount: 17434, due_on: null, template_id: 1, vendor: '華南 貸款', for_month: '2026-11', status: 'open' }]);
});
test('ensureMonthlyPayables：空清單不打 API；有清單用 ignoreDuplicates', async () => {
  const calls: any[] = [];
  const client = { from: (t: string) => ({ upsert: (rows: any, opt: any) => { calls.push([t, rows.length, opt]); return Promise.resolve({ error: null }); } }) };
  assert.equal(await ensureMonthlyPayables(client, []), 0);
  assert.equal(calls.length, 0);
  assert.equal(await ensureMonthlyPayables(client, missingPayables([T({})], '2026-11', [], new Set())), 1);
  assert.deepEqual(calls[0], ['fund_payables', 1, { onConflict: 'template_id,for_month', ignoreDuplicates: true }]);
});

// todo.test.ts
test('groupsMissingSummary：過了截止日才列出上個月沒彙整的小組', () => {
  const gs = [{ id: 7, name: '小組專款（廚房）', active: true, kind: 'group' }, { id: 8, name: '小組專款（OG）', active: true, kind: 'group' },
              { id: 9, name: '停用', active: false, kind: 'group' }, { id: 1, name: '不凍結零用金', active: true, kind: 'main' }];
  const sums = [{ group_id: 7, title: '小組專款（廚房） 10月 彙整' }, { group_id: 8, title: '小組專款（OG） 9月 彙整' }];
  assert.deepEqual(groupsMissingSummary(gs, sums, '2026-11-10', 14), []);
  assert.deepEqual(groupsMissingSummary(gs, sums, '2026-11-15', 14), ['小組專款（OG）']);
});

// ledger.test.ts
test('backdateWarning', () => {
  assert.equal(backdateWarning('2026-11-05', '2026-11-03'), null);
  assert.equal(backdateWarning('2026-11-03', '2026-11-03'), null);
  assert.equal(backdateWarning('2026-10-28', '2026-11-03'), '這個日期早於上次結算（2026/11/3），已公布的數字會跟著變動');
  assert.equal(backdateWarning('2026-10-28', null), null);
});
test('deleteErrorText', () => {
  assert.equal(deleteErrorText({ message: '這筆借款已有還款紀錄，請先刪除還款' }), '這筆借款已有還款紀錄，請先刪除還款');
  assert.equal(deleteErrorText({ message: 'boom' }), '刪除失敗：boom');
});
```

- [ ] **Step 2–4: 失敗 → 實作 → `npm test` 通過**

- [ ] **Step 5: 接到畫面**

1. `settle/page.tsx`（僅會計）：資料載入後，查本月 `fund_payables`（`for_month = curMonth`）與本月支出的 vendor，算 `missingPayables` → `ensureMonthlyPayables`；送出列數 > 0 時重新讀應付。失敗只 `console.warn`，不擋頁面。
2. `settle/page.tsx`：`todoItems` 加入 `group_due`（文字「上個月尚未彙整：A、B」，連到 `/fund-v2/record`）；只要已有任何一期，就在「開始 N 月結算」下方多一個次要連結「再結一次 M 月」（M＝最新一期的月份）→ `/fund-v2/settle/run?month=<latest.month>`（spec §5.5：同一期可再結一次）。
3. 三個記帳表單：日期欄下方顯示 `backdateWarning(date, latestPeriod?.settled_on ?? null)`（黃字，不擋送出）。`record/page.tsx` 多讀一次 `getPeriods` 取第一筆，往下傳 `lastSettledOn`。
4. `RowDetail.tsx`：刪除失敗時 toast `deleteErrorText(e)`。
5. `ExpenseForm.tsx`：點「常用」模板 chip 時，若本月有該模板的 open payable（`template_id` 相符、`for_month = curMonth`），改為 `router.replace('/fund-v2/record?payable=<id>')` 走既有的應付預填流程（不新增第二條標記已付的路徑）。

- [ ] **Step 6: 瀏覽器驗證**（控制者）

`/fund-v2/settle` 開兩次 → `fund_payables` 中 `for_month='2026-11'` 的列數等於「有預設金額且本月未支出的固定模板數」，第二次不增加（報告貼兩次 count）。記帳表單把日期改到上次結算日之前 → 出現黃字且仍可送出（不送出）。在帳本刪除一筆已有還款的借款 → toast 顯示守門文字、資料不變。自動產生的應付保留（它們是真的本月應付）；若會計不要，報告中附上 `delete from fund_payables where for_month='2026-11' and status='open' and template_id is not null` 供選用，不要自行執行。

- [ ] **Step 7: Commit** — `feat(fund-v2): monthly payables, group reminder, backdate warning, delete messages`

---

### Task 7: 權限實測與收尾

**Files:**
- Modify: `scripts/check-rls.ts`
- Create: `docs/fund-v2-accountant-checklist.md`
- Modify: `app/fund-v2/settings/page.tsx`（錨點導覽）、`README` 不動

**Interfaces:**
- Consumes: 全部前述任務。

- [ ] **Step 1: 擴充 `check-rls.ts`**

維持現有流程（`CHECK_USER`／`CHECK_PASSWORD`，缺則 `RLS SKIPPED`）。登入後對下列每一張表各試一次寫入並要求被拒（`error.code === '42501'`，或 update/delete 影響 0 列）：`fund_settings`（update `monthly_cap`）、`fund_roles`（insert 自己為 accountant）、`fund_members`（update 任一列 `left_at`）、`fund_emergencies`（insert）、`fund_payables`（insert）、`fund_transactions`（delete 任一列）。再確認可讀：`fund_settings`、`fund_emergencies`、`fund_donations`、`fund_tx_snapshots`。任何一項不符即印 `RLS FAIL: <表> <動作>` 並以 1 結束；全過印 `RLS OK (10 checks)`。腳本不可印出帳號或密碼。

- [ ] **Step 2: 執行**

Run: `node --experimental-strip-types --env-file=.env.local scripts/check-rls.ts`
Expected：沒有 `CHECK_USER` 時 `RLS SKIPPED (no CHECK_USER)`。implementer 不要自行建立或猜測帳號；在報告中註明「需會計提供一個參與者帳號後由控制者執行」。之後跑 `-c "select role, count(*) from fund_roles group by 1"` 確認角色表未被改動。

- [ ] **Step 3: 會計核對清單** `docs/fund-v2-accountant-checklist.md`

一頁、條列、每項一個核取方塊，內容固定為：
1. 總表第 325 列的奉納者歸屬需確認。
2. 「付款人」欄出現但不是成員的名字，確認是否要建成員。
3. 3 位在籍成員沒有加入日 → 到「設定 › 成員」補上。
4. 帳前借款（反推）本金與出借人確認；已還清者狀態確認。
5. 2 筆未付帳單（總表末兩列）確認金額與到期日。
6. 「特殊專款（廚房）」科目是否沿用。
7. 固定費用模板的到期日（`due_day`）目前都是空的 → 需要的話在舊管理頁填上。
8. 提供一個參與者帳號以執行權限實測。
9. 建議更換資料庫密碼（曾在開發對話中出現）。
不要寫入任何人名以外的個資或金額。

- [ ] **Step 4: 全套驗證**

Run: `npm test && npx tsc --noEmit && npx next build`
Expected: 全數通過；build 無錯誤（Google Fonts 下載失敗屬網路問題，重試一次）。

- [ ] **Step 5: 瀏覽器總驗**（控制者）：375px 與 1400px 各走一遍 設定四區塊／每月一覽／算首頁；`?as=member` 下 記 與 設定 進不去、橫幅與每月一覽看得到；console 無錯誤。

- [ ] **Step 6: Commit** — `chore(fund-v2): rls check coverage and accountant checklist`

---

## 計畫完成後

- 還原所有驗證時的寫入（成員日期、緊急狀態），確認 `fund_emergencies` 為 0 列、`fund_roles` 為 2 位會計、最新小結仍為 1,627。
- 交給會計：`docs/fund-v2-accountant-checklist.md`。
- 不在本計畫：完整的專案申請／全數決流程、貸款利息與攤還、小組負責人自行記帳、移除舊 `/fund/*`（spec 非目標或待 V2 跑完一次完整月結算後再決定）。
