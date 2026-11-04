// 匯入總表流水帳。
// 用法：node --experimental-strip-types --env-file=.env.local scripts/import-ledger.ts (--dry-run | --reset [--wipe-live-data]) [--csv=PATH] [--until=ROW] [--allow-fix]
//   --dry-run         只規劃、印出摘要，不寫入。
//   --reset           刪除全部流水帳（交易、應付、帳前借款）後重新匯入，並以 CSV 快照逐列驗證。
//                     若資料庫已有非匯入資料（source ≠ 'import' 的交易、未標 [import] 的應付）則拒絕（exit 2）。
//   --wipe-live-data  搭配 --reset：連非匯入資料一併刪除。
import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { fetchAllTransactions } from '../lib/fund-fetch.ts'
import { parseCsv } from './import/csv.ts'
import { toRawRows } from './import/normalize.ts'
import { planImport, type Plan, type PlanRefs } from './import/plan.ts'
import { joinedAt, LiveDataError, resetLedger, verifyImport, writePlan } from './import/write.ts'

const DEFAULT_CSV = '巢穴參考資料/巢穴共同體 公基金計畫 流水帳 - 總表.csv'

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const flag = (name: string) => process.argv.includes(`--${name}`)

const USAGE = 'usage: import-ledger.ts (--dry-run | --reset [--wipe-live-data]) [--csv=PATH] [--until=ROW] [--allow-fix]'

const serviceClient = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function count(s: SupabaseClient, table: string, filter?: { eq?: [string, string]; isNull?: string }): Promise<number> {
  let q = s.from(table).select('id', { count: 'exact', head: true })
  if (filter?.eq) q = q.eq(...filter.eq)
  if (filter?.isNull) q = q.is(filter.isNull, null)
  const { count: n, error } = await q
  if (error) throw new Error(`${table}: ${error.message}`)
  return n ?? 0
}

async function loadRefs(s: SupabaseClient): Promise<PlanRefs> {
  const q = async (table: string) => {
    const { data, error } = await s.from(table).select('*')
    if (error) throw new Error(`${table}: ${error.message}`)
    return data as Record<string, unknown>[]
  }
  const [accounts, storages, members, handlers, advancers, tags] = await Promise.all(
    ['fund_accounts', 'fund_storages', 'fund_members', 'fund_handlers', 'fund_advancers', 'fund_tags'].map(q),
  )
  const main = accounts.find((a) => a.kind === 'main')
  if (!main) throw new Error('no main account')
  return {
    mainId: main.id as number,
    accounts: accounts.map((a) => ({ id: a.id as number, name: a.name as string, kind: a.kind as string, default_storage_id: (a.default_storage_id as number | null) ?? null })),
    storages: storages.map((x) => ({ id: x.id as number, name: x.name as string })),
    members: members.map((m) => ({ id: m.id as number, nickname: m.nickname as string, real_name: (m.real_name as string | null) ?? null })),
    handlers: handlers.map((h) => ({ id: h.id as number, name: h.name as string })),
    advancers: advancers.map((h) => ({ id: h.id as number, name: h.name as string })),
    tags: tags.map((h) => ({ id: h.id as number, name: h.name as string })),
  }
}

const countBy = <T,>(xs: T[], key: (x: T) => string) => {
  const m: Record<string, number> = {}
  for (const x of xs) m[key(x)] = (m[key(x)] ?? 0) + 1
  return m
}

export function printPlan(plan: Plan, rowCount: number) {
  const { txs } = plan
  console.log(`rows: ${rowCount}`)
  console.log(`txs: ${txs.length}`)
  console.log('by type:', countBy(txs, (t) => t.type))
  console.log('by income_source:', countBy(txs.filter((t) => t.incomeSource), (t) => t.incomeSource!))
  console.log(`settlements: ${txs.filter((t) => t.type === 'settlement').length}`)
  for (const t of txs.filter((x) => x.type === 'settlement')) {
    const r = t.sub!.row
    const base = Number(r.freeze_base)
    console.log(`  settlement row ${t.importRow} ${r.month}#${r.period_no}: freeze_base ${base} ×30%=${Math.round(base * 0.3)} frozen ${r.frozen_reserve}/${r.frozen_future} zero_reason ${r.zero_reason ?? '-'}`)
  }
  console.log(`offLedger: ${txs.filter((t) => t.offLedger).length}`, countBy(txs.filter((t) => t.sub?.table === 'fund_expenses'), (t) => String(t.sub!.row.claim_status)))
  const keys = new Set(txs.map((t) => t.importRow))
  const seqKeys = new Set(txs.map((t) => `${t.occurredOn}|${t.seq}`))
  console.log(`import_row unique: ${keys.size === txs.length} (${keys.size}/${txs.length}, negative ${txs.filter((t) => t.importRow < 0).length}); (occurred_on, seq) unique: ${seqKeys.size === txs.length}`)
  console.log(`stated_on ≠ occurred_on: ${txs.filter((t) => t.statedOn && t.statedOn !== t.occurredOn).length}`)
  console.log(`solver rows: ${plan.solverRows.length}`, plan.solverRows.slice(0, 40).join(','), plan.solverRows.length > 40 ? '…' : '')
  console.log(`payables: ${plan.payables.length}`, plan.payables)
  console.log(`preLoans: ${plan.preLoans.length}`, plan.preLoans)
  console.log(`missingRefs: ${plan.missingRefs.length}`, plan.missingRefs)
  console.log(`warns: ${plan.warns.length}`)
  for (const w of plan.warns.slice(0, 20)) console.log(`  ${w}`)
  if (plan.warns.length > 20) console.log(`  … ${plan.warns.length - 20} more`)
  console.log(`mismatches: ${plan.mismatches.length}`)
  for (const m of plan.mismatches.slice(0, 3)) console.log(`  row ${m.row}`, JSON.stringify({ expected: m.expected, built: m.built }))
  const last = txs[txs.length - 1]
  if (last) console.log(`last tx: row ${last.importRow} ${last.type} ${last.occurredOn}`)
  if (plan.mismatches.length === 0) console.log(`PLAN OK ${txs.length} txs`)
}

async function main() {
  const dry = flag('dry-run')
  const reset = flag('reset')
  const s = serviceClient()
  if (dry === reset) {
    // No mode (or both): refuse. Say so explicitly when an import is already in the ledger.
    if (!dry) {
      const existing = await count(s, 'fund_transactions', { eq: ['source', 'import'] })
      if (existing) console.error(`已有 ${existing} 筆 source='import' 交易；要重新匯入請加 --reset（會刪除全部流水帳）。`)
    }
    console.error(USAGE)
    process.exit(2)
  }
  const csv = arg('csv') ?? DEFAULT_CSV
  const until = arg('until') ? Number(arg('until')) : Infinity
  const rows = toRawRows(parseCsv(readFileSync(csv, 'utf8'))).filter((r) => r.row <= until)
  const refs = await loadRefs(s)
  const plan = planImport(rows, refs, { allowFix: flag('allow-fix') })
  printPlan(plan, rows.length)
  if (dry) process.exit(plan.mismatches.length ? 1 : 0)

  // --reset: refuse to delete anything unless the plan is clean.
  const missingMembers = plan.missingRefs.filter((m) => m.kind === 'member')
  if (plan.mismatches.length || missingMembers.length) {
    console.error(`ABORT before deleting: ${plan.mismatches.length} mismatches (rows ${plan.mismatches.map((m) => m.row).join(',')}), missing members: ${missingMembers.map((m) => m.name).join(',') || '-'}`)
    process.exit(1)
  }
  const [txCount, payableCount, preLoanCount] = await Promise.all([
    count(s, 'fund_transactions'),
    count(s, 'fund_payables'),
    count(s, 'fund_loans', { isNull: 'transaction_id' }),
  ])
  console.log(`reset: deleting ${txCount} fund_transactions, ${payableCount} fund_payables, ${preLoanCount} pre-ledger fund_loans`)
  try {
    const live = await resetLedger(s, { joinedAt: joinedAt(plan), wipeLiveData: flag('wipe-live-data') })
    if (live.transactions || live.payables) console.log(`reset: --wipe-live-data deleted ${live.transactions} live fund_transactions, ${live.payables} live fund_payables`)
  } catch (e) {
    if (!(e instanceof LiveDataError)) throw e
    console.error(`ABORT before deleting: 已有非匯入資料 ${e.counts.transactions} 筆 fund_transactions（source ≠ 'import'）、${e.counts.payables} 筆 fund_payables（未標 [import]）；確定要一併刪除請加 --wipe-live-data。`)
    process.exit(2)
  }
  const { inserted, plan: written } = await writePlan(s, plan)
  console.log(`inserted ${inserted}`)

  const res = verifyImport(await fetchAllTransactions(s), written)
  if (!res.ok) {
    console.error(`IMPORT MISMATCH ${res.message}`)
    process.exit(1)
  }
  console.log(`IMPORT OK ${res.verified} rows verified, final total ${res.total}`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
