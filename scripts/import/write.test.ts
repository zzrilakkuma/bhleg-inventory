import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Plan, PlannedTx } from './plan.ts'
import { joinedAt, remapPlan, resolveLoanRef, verifyImport, writePlan } from './write.ts'

type Call = { table: string; op: string; rows?: Record<string, unknown>[]; patch?: Record<string, unknown>; filters: [string, unknown][] }

/** Minimal PostgREST stand-in: assigns ids per table and records every call. */
function fakeClient() {
  const calls: Call[] = []
  const nextId: Record<string, number> = {}
  const client = {
    from(table: string) {
      const call: Call = { table, op: '', filters: [] }
      let result: unknown = null
      let single = false
      const b = {
        insert(rows: Record<string, unknown> | Record<string, unknown>[]) {
          const list = (Array.isArray(rows) ? rows : [rows]).map((r) => ({ ...r }))
          for (const r of list) r.id = nextId[table] = (nextId[table] ?? (table === 'fund_accounts' ? 900 : table === 'fund_storages' ? 800 : 1)) + 1
          Object.assign(call, { op: 'insert', rows: list })
          calls.push(call)
          result = list
          return b
        },
        update(patch: Record<string, unknown>) {
          Object.assign(call, { op: 'update', patch })
          calls.push(call)
          return b
        },
        delete() {
          call.op = 'delete'
          calls.push(call)
          return b
        },
        select() {
          return b
        },
        single() {
          single = true
          return b
        },
        eq(c: string, v: unknown) { call.filters.push([`eq.${c}`, v]); return b },
        is(c: string, v: unknown) { call.filters.push([`is.${c}`, v]); return b },
        gte(c: string, v: unknown) { call.filters.push([`gte.${c}`, v]); return b },
        then(res: (v: unknown) => void) {
          const data = single && Array.isArray(result) ? result[0] : result
          res({ data, error: null })
        },
      }
      return b
    },
  }
  return { client: client as unknown as SupabaseClient, calls }
}

const tx = (o: Partial<PlannedTx>): PlannedTx => ({
  importRow: 0, type: 'expense', occurredOn: '2024-11-05', statedOn: null, dateNote: null, seq: 0, title: 't', voucher: null,
  note: null, comment: null, amount: 0, incomeSource: null, offLedger: false, lines: [], warns: [], ...o,
})

const basePlan = (txs: PlannedTx[], extra: Partial<Plan> = {}): Plan => ({
  txs, payables: [], preLoans: [], missingRefs: [], mismatches: [], warns: [], solverRows: [], checkpoints: [],
  refs: {
    mainId: 1,
    accounts: [{ id: 1, name: '不凍結零用金', kind: 'main', default_storage_id: 101 }, { id: -1, name: '特殊專款（廚房）', kind: 'special', default_storage_id: 101 }],
    storages: [{ id: 101, name: '郵局' }, { id: -2, name: '新袋' }],
  },
  ...extra,
})

test('remapPlan replaces temporary ids in refs and lines', () => {
  const p = basePlan([tx({ importRow: 2, lines: [{ account_id: -1, storage_id: -2, amount: 5, label: null }, { account_id: 1, storage_id: 101, amount: 3, label: null }] })])
  const r = remapPlan(p, new Map([[-1, 901]]), new Map([[-2, 801]]))
  assert.deepEqual(r.txs[0].lines.map((l) => [l.account_id, l.storage_id]), [[901, 801], [1, 101]])
  assert.deepEqual(r.refs.accounts.map((a) => a.id), [1, 901])
  assert.deepEqual(r.refs.storages.map((s) => s.id), [101, 801])
  assert.throws(() => remapPlan(p, new Map(), new Map([[-2, 801]])), /unmapped account id -1/)
})

test('resolveLoanRef maps import_row and pre_loan refs, throws when unresolved', () => {
  const loans = new Map([[50, 7]])
  const pre = new Map([['Eason', 3]])
  assert.deepEqual(resolveLoanRef({ amount: 1, loan_id: null, loan_ref: { import_row: 50 } }, loans, pre), { amount: 1, loan_id: 7 })
  assert.deepEqual(resolveLoanRef({ amount: 1, loan_id: null, loan_ref: { pre_loan: 'Eason' } }, loans, pre), { amount: 1, loan_id: 3 })
  assert.throws(() => resolveLoanRef({ loan_id: null, loan_ref: { import_row: 51 } }, loans, pre), /unresolved loan_ref/)
  assert.throws(() => resolveLoanRef({ loan_id: null, loan_ref: { pre_loan: 'X' } }, loans, pre), /unresolved loan_ref/)
})

test('writePlan: creates missing refs, remaps lines, links loans and pre-loans, backfills claims and joined_at', async () => {
  const txs = [
    tx({ importRow: 2, type: 'opening', amount: 10, lines: [{ account_id: -1, storage_id: -2, amount: 10, label: null }] }),
    tx({ importRow: 3, type: 'donation', occurredOn: '2024-11-06', amount: 5, lines: [{ account_id: 1, storage_id: 101, amount: 5, label: null }],
      sub: { table: 'fund_donations', row: { member_id: 9, months: ['2024-11'] } } }),
    tx({ importRow: 4, type: 'loan', amount: 100, lines: [{ account_id: 1, storage_id: 101, amount: 100, label: null }],
      sub: { table: 'fund_loans', row: { lender_name: 'A', principal: 100 } } }),
    tx({ importRow: -50, type: 'repayment', amount: -10, sub: { table: 'fund_repayments', row: { loan_id: null, amount: 10, fee: 0, loan_ref: { import_row: 4 } } } }),
    tx({ importRow: -51, type: 'repayment', amount: -20, sub: { table: 'fund_repayments', row: { loan_id: null, amount: 20, fee: 0, loan_ref: { pre_loan: 'Eason' } } } }),
    tx({ importRow: 6, occurredOn: '2024-11-08', amount: -3, sub: { table: 'fund_expenses', row: { claim_status: 'claimed' } } }),
    tx({ importRow: 7, type: 'donation', occurredOn: '2024-11-01', sub: { table: 'fund_donations', row: { member_id: 9, months: ['2024-11'] } } }),
  ]
  const plan = basePlan(txs, {
    preLoans: [{ lender: 'Eason', principal: 100000, started_on: '2024-11-01', lender_member_id: 15 }],
    payables: [{ title: 'p', amount: 1, due_on: null, vendor: null }],
  })
  const { client, calls } = fakeClient()
  const { inserted, plan: written } = await writePlan(client, plan)
  assert.equal(inserted, 7)
  const ins = (table: string) => calls.filter((c) => c.table === table && c.op === 'insert').flatMap((c) => c.rows!)

  assert.deepEqual(ins('fund_storages').map((r) => [r.name, r.active, r.id]), [['新袋', false, 801]])
  assert.deepEqual(ins('fund_accounts').map((r) => [r.name, r.kind, r.default_storage_id, r.active]), [['特殊專款（廚房）', 'special', 101, false]])
  const lines = ins('fund_lines')
  assert.deepEqual([lines[0].account_id, lines[0].storage_id], [901, 801])
  assert.equal(written.txs[0].lines[0].account_id, 901)

  const txRows = ins('fund_transactions')
  assert.ok(txRows.every((r) => r.source === 'import'))
  const idOf = (row: number) => txRows.find((r) => r.import_row === row)!.id

  const preLoan = ins('fund_loans').find((r) => r.transaction_id === null)!
  assert.deepEqual([preLoan.lender_name, preLoan.principal, preLoan.lender_member_id], ['Eason', 100000, 15])
  const loan = ins('fund_loans').find((r) => r.transaction_id === idOf(4))!
  const reps = ins('fund_repayments')
  assert.deepEqual(reps.map((r) => [r.transaction_id, r.loan_id, 'loan_ref' in r]), [[idOf(-50), loan.id, false], [idOf(-51), preLoan.id, false]])
  // the loan row is inserted before the repayment that references it
  assert.ok(calls.findIndex((c) => c.table === 'fund_loans' && c.rows![0].transaction_id !== null) < calls.findIndex((c) => c.table === 'fund_repayments'))

  const exp = ins('fund_expenses')[0]
  assert.deepEqual([exp.claimed_transaction_id, exp.claimed_on], [idOf(6), '2024-11-08'])
  assert.deepEqual(ins('fund_payables').map((r) => r.status), ['open'])
  const upd = calls.filter((c) => c.table === 'fund_members' && c.op === 'update')
  assert.deepEqual(upd.map((c) => [c.patch!.joined_at, c.filters]), [['2024-11-01', [['eq.id', 9], ['is.joined_at', null]]]])
})

test('writePlan throws on a repayment whose loan cannot be resolved', async () => {
  const plan = basePlan([tx({ importRow: -5, type: 'repayment', sub: { table: 'fund_repayments', row: { loan_id: null, amount: 1, fee: 0, loan_ref: { pre_loan: 'Nobody' } } } })])
  await assert.rejects(writePlan(fakeClient().client, plan), /unresolved loan_ref/)
})

test('joinedAt takes the earliest donation per member', () => {
  const p = basePlan([
    tx({ importRow: 1, occurredOn: '2024-12-01', sub: { table: 'fund_donations', row: { member_id: 2 } } }),
    tx({ importRow: 2, occurredOn: '2024-11-01', sub: { table: 'fund_donations', row: { member_id: 2 } } }),
    tx({ importRow: 3, occurredOn: '2024-10-01', sub: { table: 'fund_expenses', row: {} } }),
  ])
  assert.deepEqual([...joinedAt(p)], [[2, '2024-11-01']])
})

test('verifyImport compares running balances with checkpoints', () => {
  const plan = basePlan([tx({ importRow: 2 }), tx({ importRow: 3 })], {
    refs: { mainId: 1, accounts: [{ id: 1, name: '不凍結零用金', kind: 'main', default_storage_id: 101 }], storages: [{ id: 101, name: '郵局' }] },
    checkpoints: [{ importRow: 2, snapshot: { 不凍結零用金: 10, 郵局: 10, 小結: 10 } }, { importRow: 3, snapshot: { 不凍結零用金: 15, 郵局: 15, 小結: 15 } }],
  })
  const db = (amt: number) => [
    { id: 11, import_row: 2, source: 'import', occurred_on: '2024-11-05', seq: 20, fund_lines: [{ account_id: 1, storage_id: 101, amount: 10 }] },
    { id: 12, import_row: 3, source: 'import', occurred_on: '2024-11-05', seq: 30, fund_lines: [{ account_id: 1, storage_id: 101, amount: amt }] },
  ] as never
  assert.deepEqual(verifyImport(db(5), plan), { ok: true, verified: 2, total: 15 })
  const bad = verifyImport(db(6), plan)
  assert.equal(bad.ok, false)
  assert.match((bad as { message: string }).message, /row 3: 不凍結零用金 csv 15 db 16/)
})
