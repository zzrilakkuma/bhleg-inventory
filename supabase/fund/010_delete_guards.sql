-- 010：刪除交易時的資料守門。可重複執行。必須在 007 之後套用。
-- fund_expenses.claimed_transaction_id 與 fund_payables.paid_transaction_id 為 on delete set null，
-- 直接刪除請款／付款交易會留下「已請款但無請款交易」的代墊、「已付但無交易」的應付。
-- 此 trigger 在刪除前把它們還原為待請款／未付。

create or replace function fund_before_delete_transaction() returns trigger
language plpgsql set search_path = public as $$
begin
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
