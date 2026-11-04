// 匯入總表流水帳。
// 用法：node --experimental-strip-types --env-file=.env.local scripts/import-ledger.ts --dry-run [--csv=PATH] [--until=ROW] [--allow-fix]
// 寫入模式（--reset）於 Task 10 實作。
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { parseCsv } from './import/csv.ts'
import { toRawRows } from './import/normalize.ts'
import { planImport, type Plan, type PlanRefs } from './import/plan.ts'

const DEFAULT_CSV = '巢穴參考資料/巢穴共同體 公基金計畫 流水帳 - 總表.csv'

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const flag = (name: string) => process.argv.includes(`--${name}`)

async function loadRefs(): Promise<PlanRefs> {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
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
  if (flag('reset')) {
    console.error('write mode not implemented yet (Task 10)')
    process.exit(2)
  }
  const csv = arg('csv') ?? DEFAULT_CSV
  const until = arg('until') ? Number(arg('until')) : Infinity
  const rows = toRawRows(parseCsv(readFileSync(csv, 'utf8'))).filter((r) => r.row <= until)
  const refs = await loadRefs()
  const plan = planImport(rows, refs, { allowFix: flag('allow-fix') })
  printPlan(plan, rows.length)
  process.exit(plan.mismatches.length ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
