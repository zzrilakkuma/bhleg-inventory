-- 011：章程規則的資料守門。可重複執行。必須在 006、007、010 之後套用。
-- 規則只提醒不強制；這裡只擋資料完整性：最後一位會計、已有還款的借款、已被請款的代墊。

-- 每月應付：同一範本同一月份只能有一筆（NULL 彼此不相等，手動建立的應付不受影響）
alter table fund_payables add column if not exists for_month text null;
create unique index if not exists fund_payables_template_month_uq
  on fund_payables (template_id, for_month);

-- 緊急狀態：結束日不早於開始日；同時只能一筆進行中
alter table fund_emergencies drop constraint if exists fund_emergencies_range_chk;
alter table fund_emergencies add constraint fund_emergencies_range_chk
  check (ended_on is null or ended_on >= started_on);
create unique index if not exists fund_emergencies_one_open
  on fund_emergencies ((true)) where ended_on is null;

-- 至少保留一位會計
create or replace function fund_roles_keep_accountant() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if OLD.role = 'accountant'
     and not exists (select 1 from fund_roles where role = 'accountant' and user_id <> OLD.user_id)
     and (TG_OP = 'DELETE' or NEW.role <> 'accountant') then
    raise exception '至少要保留一位會計' using errcode = 'P0001';
  end if;
  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end $$;

drop trigger if exists fund_roles_keep_accountant on fund_roles;
create trigger fund_roles_keep_accountant
  before update or delete on fund_roles
  for each row execute function fund_roles_keep_accountant();

-- 刪除交易守門（保留 010 既有行為）
create or replace function fund_before_delete_transaction() returns trigger
language plpgsql set search_path = public as $$
begin
  if OLD.type = 'loan' and exists (
    select 1 from fund_repayments r join fund_loans l on l.id = r.loan_id
     where l.transaction_id = OLD.id
  ) then
    raise exception '這筆借款已有還款紀錄，請先刪除還款';
  end if;

  if OLD.type = 'expense' and exists (
    select 1 from fund_expenses
     where transaction_id = OLD.id and claim_status = 'claimed' and claimed_transaction_id <> OLD.id
  ) then
    raise exception '這筆代墊已請款，請先刪除請款交易';
  end if;

  if OLD.type = 'expense_claim' then
    update fund_expenses
       set claim_status = 'unclaimed', claimed_transaction_id = null, claimed_on = null
     where claimed_transaction_id = OLD.id and claim_status = 'claimed';
  end if;

  update fund_payables
     set status = 'open', paid_transaction_id = null
   where paid_transaction_id = OLD.id and status = 'paid';

  return OLD;
end $$;

drop trigger if exists fund_transactions_before_delete on fund_transactions;
create trigger fund_transactions_before_delete
  before delete on fund_transactions
  for each row execute function fund_before_delete_transaction();

select fund_apply_policies();
