-- 007：V2 模型補強。可重複執行。必須在 001–006 之後套用。

-- ---------- fund_transactions ----------
alter table fund_transactions add column if not exists income_source text null;
alter table fund_transactions add column if not exists stated_on date;
alter table fund_transactions add column if not exists date_note text;
alter table fund_transactions add column if not exists off_ledger boolean not null default false;
alter table fund_transactions add column if not exists group_id int null references fund_accounts(id);
alter table fund_transactions add column if not exists decision_ref text;

do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'fund_transactions'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%donation%' and pg_get_constraintdef(oid) ilike '%reset%'
  loop
    execute format('alter table fund_transactions drop constraint %I', c);
  end loop;
  alter table fund_transactions drop constraint if exists fund_transactions_type_check;
  alter table fund_transactions add constraint fund_transactions_type_check check (type in (
    'donation','income','expense','loan','repayment','refund','transfer','settlement',
    'opening','group_summary','reset','expense_claim'));

  alter table fund_transactions drop constraint if exists fund_transactions_income_source_check;
  alter table fund_transactions add constraint fund_transactions_income_source_check check (
    income_source is null or income_source in
    ('donation','salon','event','kitchen','reinject','loan','refund','interest','inkind','other'));
end $$;

create unique index if not exists fund_transactions_import_row_uq
  on fund_transactions(import_row) where source = 'import';

-- ---------- fund_expenses ----------
alter table fund_expenses add column if not exists claim_status text not null default 'none';
alter table fund_expenses add column if not exists claimed_transaction_id bigint references fund_transactions(id) on delete set null;
alter table fund_expenses add column if not exists claimed_on date;
alter table fund_expenses drop constraint if exists fund_expenses_claim_status_check;
alter table fund_expenses add constraint fund_expenses_claim_status_check
  check (claim_status in ('none','unclaimed','claimed','waived'));
update fund_expenses set claim_status = 'claimed' where settled and claim_status = 'none';

-- ---------- fund_tags ----------
alter table fund_tags add column if not exists report_group text null;
alter table fund_tags drop constraint if exists fund_tags_report_group_check;
alter table fund_tags add constraint fund_tags_report_group_check
  check (report_group is null or report_group in ('貸款與信用卡','交通與車輛','水電與通訊','中央蘭室配置'));

insert into fund_tags (name, "group", sort_order) values
  ('信用卡','item',18),('燃料稅','item',19),('牌照稅','item',20),('營業稅','item',21),
  ('會計費','item',22),('修繕','item',23),
  ('OG','space',7),('力行路40號','space',8)
on conflict (name) do nothing;

update fund_tags set report_group = '貸款與信用卡' where name in ('貸款','信用卡','共同債務');
update fund_tags set report_group = '交通與車輛' where name in ('共用汽車','油料費','停車費','燃料稅','牌照稅');
update fund_tags set report_group = '水電與通訊' where name in ('電費','水費','電信費','瓦斯');
update fund_tags set report_group = '中央蘭室配置' where name in ('中央蘭室');

-- ---------- fund_loans ----------
alter table fund_loans alter column transaction_id drop not null;
alter table fund_loans add column if not exists lender_member_id int references fund_members(id);
alter table fund_loans add column if not exists interest numeric(12,0) not null default 0;
alter table fund_loans add column if not exists due_on date;
alter table fund_loans add column if not exists installment numeric(12,0);
alter table fund_loans add column if not exists installment_count int;
alter table fund_loans add column if not exists status text not null default 'open';
alter table fund_loans add column if not exists started_on date;
alter table fund_loans drop constraint if exists fund_loans_status_check;
alter table fund_loans add constraint fund_loans_status_check check (status in ('open','closed','written_off'));

-- ---------- fund_advancers ----------
alter table fund_advancers add column if not exists member_id int references fund_members(id);

-- ---------- fund_settlements ----------
alter table fund_settlements add column if not exists period_no int not null default 1;
alter table fund_settlements add column if not exists freeze_base numeric(12,0);
alter table fund_settlements add column if not exists frozen_reserve numeric(12,0) not null default 0;
alter table fund_settlements add column if not exists frozen_future numeric(12,0) not null default 0;
alter table fund_settlements add column if not exists zero_reason text;
alter table fund_settlements add column if not exists late_days int;
create unique index if not exists fund_settlements_month_period_uq on fund_settlements(month, period_no);

-- ---------- fund_members ----------
alter table fund_members add column if not exists joined_at date;
alter table fund_members add column if not exists left_at date;
alter table fund_members add column if not exists exit_note text;

-- ---------- fund_templates ----------
alter table fund_templates add column if not exists recurring boolean not null default false;
alter table fund_templates add column if not exists due_day int;
update fund_templates set recurring = true
where name in ('華南貸款','國泰貸款','中央蘭室專款','停車場月租','電信費','電費','水費');

-- ---------- 新表 ----------
create table if not exists fund_payables (
  id                  bigserial primary key,
  title               text not null,
  amount              numeric(12,0) not null,
  due_on              date,
  account_id          int references fund_accounts(id),
  template_id         int references fund_templates(id),
  vendor              text,
  note                text,
  status              text not null default 'open' check (status in ('open','paid','cancelled')),
  paid_transaction_id bigint references fund_transactions(id) on delete set null,
  created_by          uuid,
  created_at          timestamptz not null default now()
);
create index if not exists fund_payables_status_due_idx on fund_payables(status, due_on);

create table if not exists fund_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
insert into fund_settings (key, value) values
  ('donation_due_day', '14'), ('settlement_due_day', '20'), ('group_settle_due_day', '14'),
  ('exit_notice_days', '5'), ('monthly_cap', '5000'), ('standard_amount', '1500'),
  ('freeze_rate', '0.3'), ('freeze_base', '"main"')
on conflict (key) do nothing;

create table if not exists fund_emergencies (
  id          serial primary key,
  started_on  date not null,
  ended_on    date,
  note        text,
  declared_by uuid
);

-- ---------- 套用 RLS ----------
alter function fund_apply_policies() set search_path = public;
revoke execute on function fund_apply_policies() from public, anon, authenticated;
select fund_apply_policies();
