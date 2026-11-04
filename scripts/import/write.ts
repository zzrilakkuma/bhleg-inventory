// Writes a Plan into Supabase (service role) and verifies the result against the CSV checkpoints.
import type { SupabaseClient } from '@supabase/supabase-js'
import { computeRunningBalances, type FundTransaction } from '../../lib/fund.ts'
import type { Plan, PlannedTx } from './plan.ts'
import type { Refs } from './reconcile.ts'

const BATCH = 100
const POST = '郵局'

type Row = Record<string, unknown>

const check = <T>(label: string, res: { data: T | null; error: { message: string } | null }): T => {
  if (res.error) throw new Error(`${label}: ${res.error.message}`)
  return res.data as T
}

/** Deletes every ledger row (transactions cascade to lines and sub-tables), payables, pre-ledger loans; clears joined_at. */
export async function resetLedger(client: SupabaseClient) {
  check('delete fund_payables', await client.from('fund_payables').delete().gte('id', 0))
  check('delete fund_transactions', await client.from('fund_transactions').delete().gte('id', 0))
  check('delete pre-ledger fund_loans', await client.from('fund_loans').delete().is('transaction_id', null))
  check('reset fund_members.joined_at', await client.from('fund_members').update({ joined_at: null }).gte('id', 0))
}

/** Applies an id remap (temporary negative id → real id) to refs and every planned line. */
export function remapPlan(plan: Plan, accountIds: Map<number, number>, storageIds: Map<number, number>): Plan {
  const a = (id: number) => (id < 0 ? accountIds.get(id) ?? fail(`unmapped account id ${id}`) : id)
  const s = (id: number) => (id < 0 ? storageIds.get(id) ?? fail(`unmapped storage id ${id}`) : id)
  const refs: Refs = {
    mainId: a(plan.refs.mainId),
    accounts: plan.refs.accounts.map((x) => ({ ...x, id: a(x.id), default_storage_id: x.default_storage_id === null ? null : s(x.default_storage_id) })),
    storages: plan.refs.storages.map((x) => ({ ...x, id: s(x.id) })),
  }
  const txs = plan.txs.map((t) => ({ ...t, lines: t.lines.map((l) => ({ ...l, account_id: a(l.account_id), storage_id: s(l.storage_id) })) }))
  return { ...plan, refs, txs }
}

function fail(msg: string): never {
  throw new Error(msg)
}

/** Resolves a repayment's loan_ref to a fund_loans id; throws when it cannot. */
export function resolveLoanRef(row: Row, loansByImportRow: Map<number, number>, preLoansByLender: Map<string, number>): Row {
  const { loan_ref: ref, ...rest } = row as Row & { loan_ref?: { import_row?: number; pre_loan?: string } }
  if (!ref) {
    if (rest.loan_id == null) throw new Error('repayment without loan_ref or loan_id')
    return rest
  }
  const id = ref.import_row !== undefined ? loansByImportRow.get(ref.import_row) : ref.pre_loan !== undefined ? preLoansByLender.get(ref.pre_loan) : undefined
  if (id === undefined) throw new Error(`unresolved loan_ref ${JSON.stringify(ref)}`)
  return { ...rest, loan_id: id }
}

/** Creates missing accounts/storages (inactive historical rows) and returns the plan with real ids. */
async function createMissingRefs(client: SupabaseClient, plan: Plan): Promise<Plan> {
  const storageIds = new Map<number, number>()
  const accountIds = new Map<number, number>()
  for (const st of plan.refs.storages.filter((x) => x.id < 0)) {
    const data = check(`insert fund_storages ${st.name}`, await client.from('fund_storages').insert({ name: st.name, active: false }).select('id').single()) as Row
    storageIds.set(st.id, data.id as number)
  }
  const postId = plan.refs.storages.find((x) => x.name === POST)?.id
  for (const ac of plan.refs.accounts.filter((x) => x.id < 0)) {
    const ds = ac.default_storage_id ?? postId ?? null
    const row = { name: ac.name, kind: ac.kind, default_storage_id: ds !== null && ds < 0 ? storageIds.get(ds)! : ds, active: false }
    const data = check(`insert fund_accounts ${ac.name}`, await client.from('fund_accounts').insert(row).select('id').single()) as Row
    accountIds.set(ac.id, data.id as number)
  }
  return remapPlan(plan, accountIds, storageIds)
}

const txRow = (t: PlannedTx): Row => ({
  type: t.type,
  occurred_on: t.occurredOn,
  stated_on: t.statedOn,
  date_note: t.dateNote,
  seq: t.seq,
  title: t.title,
  voucher: t.voucher,
  note: t.note,
  comment: t.comment,
  amount: t.amount,
  income_source: t.incomeSource,
  off_ledger: t.offLedger,
  source: 'import',
  import_row: t.importRow,
})

/** Writes the plan; returns the plan with real ids (for verification) and the number of transactions inserted. */
export async function writePlan(client: SupabaseClient, input: Plan): Promise<{ inserted: number; plan: Plan }> {
  const plan = await createMissingRefs(client, input)

  // Pre-ledger loans (no transaction).
  const preLoans = new Map<string, number>()
  if (plan.preLoans.length) {
    const rows = plan.preLoans.map((p) => ({ transaction_id: null, lender_name: p.lender, lender_member_id: p.lender_member_id, principal: p.principal, started_on: p.started_on, status: 'open' }))
    const data = check('insert pre-ledger fund_loans', await client.from('fund_loans').insert(rows).select('id, lender_name')) as Row[]
    for (const d of data) preLoans.set(d.lender_name as string, d.id as number)
  }

  const txIds = new Map<number, number>() // import_row → transaction id
  const loans = new Map<number, number>() // loan tx import_row → fund_loans id
  for (let i = 0; i < plan.txs.length; i += BATCH) {
    const batch = plan.txs.slice(i, i + BATCH)
    const data = check('insert fund_transactions', await client.from('fund_transactions').insert(batch.map(txRow)).select('id, import_row')) as Row[]
    for (const d of data) txIds.set(d.import_row as number, d.id as number)
    const idOf = (t: PlannedTx) => txIds.get(t.importRow) ?? fail(`no id returned for import_row ${t.importRow}`)

    const lines = batch.flatMap((t) => t.lines.filter((l) => l.amount !== 0).map((l) => ({ ...l, transaction_id: idOf(t) })))
    if (lines.length) check('insert fund_lines', await client.from('fund_lines').insert(lines))

    // Loans first: a repayment in this batch may reference a loan in this batch.
    const loanTxs = batch.filter((t) => t.sub?.table === 'fund_loans')
    if (loanTxs.length) {
      const got = check('insert fund_loans', await client.from('fund_loans').insert(loanTxs.map((t) => ({ ...t.sub!.row, transaction_id: idOf(t) }))).select('id, transaction_id')) as Row[]
      for (const t of loanTxs) loans.set(t.importRow, got.find((g) => g.transaction_id === idOf(t))!.id as number)
    }
    const byTable = new Map<string, Row[]>()
    for (const t of batch) {
      if (!t.sub || t.sub.table === 'fund_loans') continue
      let row: Row = { ...t.sub.row, transaction_id: idOf(t) }
      if (t.sub.table === 'fund_repayments') row = resolveLoanRef(row, loans, preLoans)
      // Imported claimed expenses were claimed by the same transaction.
      if (t.sub.table === 'fund_expenses' && row.claim_status === 'claimed') Object.assign(row, { claimed_transaction_id: idOf(t), claimed_on: t.occurredOn })
      byTable.set(t.sub.table, [...(byTable.get(t.sub.table) ?? []), row])
    }
    for (const [table, rows] of byTable) check(`insert ${table}`, await client.from(table).insert(rows))
  }

  if (plan.payables.length) {
    check('insert fund_payables', await client.from('fund_payables').insert(plan.payables.map((p) => ({ ...p, status: 'open' }))))
  }

  for (const [memberId, joined] of joinedAt(plan)) {
    check(`update fund_members ${memberId}`, await client.from('fund_members').update({ joined_at: joined }).eq('id', memberId).is('joined_at', null))
  }
  return { inserted: txIds.size, plan }
}

/** member id → earliest occurred_on of that member's donations. */
export function joinedAt(plan: Plan): Map<number, string> {
  const out = new Map<number, string>()
  for (const t of plan.txs) {
    if (t.sub?.table !== 'fund_donations') continue
    const id = t.sub.row.member_id as number | null
    if (id == null) continue
    const cur = out.get(id)
    if (!cur || t.occurredOn < cur) out.set(id, t.occurredOn)
  }
  return out
}

/** Compares the ledger's running balances with every CSV checkpoint; returns the first mismatch or the summary. */
export function verifyImport(txs: (FundTransaction & { import_row?: number | null })[], plan: Plan): { ok: true; verified: number; total: number } | { ok: false; message: string } {
  const { ordered, snapshots, latest } = computeRunningBalances(txs)
  const imported = txs.filter((t) => t.source === 'import')
  if (imported.length !== plan.txs.length) return { ok: false, message: `expected ${plan.txs.length} imported transactions, found ${imported.length}` }
  const byRow = new Map(imported.map((t) => [Number(t.import_row), t.id]))
  // Ledger order must equal plan order.
  const importedOrder = ordered.filter((t) => t.source === 'import').map((t) => Number((t as { import_row?: number }).import_row))
  const planOrder = plan.txs.map((t) => t.importRow)
  const firstOff = planOrder.findIndex((r, i) => importedOrder[i] !== r)
  if (firstOff >= 0) return { ok: false, message: `order differs at position ${firstOff}: ledger row ${importedOrder[firstOff]}, plan row ${planOrder[firstOff]}` }

  for (const c of plan.checkpoints) {
    const id = byRow.get(c.importRow)
    const snap = id === undefined ? undefined : snapshots.get(id)
    if (!snap) return { ok: false, message: `row ${c.importRow}: transaction not found` }
    const diffs: string[] = []
    for (const a of plan.refs.accounts) {
      const want = c.snapshot[a.name] ?? 0
      const got = snap.accounts[a.id] ?? 0
      if (want !== got) diffs.push(`${a.name} csv ${want} db ${got}`)
    }
    for (const s of plan.refs.storages) {
      const want = c.snapshot[s.name] ?? 0
      const got = snap.storages[s.id] ?? 0
      if (want !== got) diffs.push(`${s.name} csv ${want} db ${got}`)
    }
    if (c.snapshot['小結'] !== undefined && c.snapshot['小結'] !== snap.total) diffs.push(`小結 csv ${c.snapshot['小結']} db ${snap.total}`)
    if (diffs.length) return { ok: false, message: `row ${c.importRow}: ${diffs.join('; ')}` }
  }
  return { ok: true, verified: plan.checkpoints.length, total: latest.total }
}
