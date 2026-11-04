// Turns the ledger's RawRow sequence into the transactions to write (pure; no I/O).
import type { FundTransactionType, IncomeSource } from '../../lib/fund.ts'
import { ACCOUNT_ALIASES, MEMBER_ALIASES } from './aliases.ts'
import { classifyRow } from './classify.ts'
import { parseAmounts, parseDate, parseSnapshot, parseTags, type RawRow } from './normalize.ts'
import { buildLines, candidateLines, checkLines, snapshotDelta, solveLines, type Delta, type Line, type Refs } from './reconcile.ts'

export type PlanRefs = Refs & {
  members: { id: number; nickname: string; real_name: string | null }[]
  handlers: { id: number; name: string }[]
  advancers: { id: number; name: string }[]
  tags: { id: number; name: string }[]
}

export type SubTable = 'fund_donations' | 'fund_expenses' | 'fund_loans' | 'fund_repayments' | 'fund_settlements'

export type PlannedTx = {
  importRow: number
  type: FundTransactionType
  occurredOn: string
  statedOn: string | null
  dateNote: string | null
  seq: number
  title: string
  voucher: string | null
  note: string | null
  comment: string | null
  amount: number
  incomeSource: IncomeSource | null
  offLedger: boolean
  lines: Line[]
  sub?: { table: SubTable; row: Record<string, unknown> }
  warns: string[]
}

export type Payable = { title: string; amount: number; due_on: string | null; vendor: string | null }
export type PreLoan = { lender: string; principal: number; started_on: string }
export type MissingRef = { kind: 'account' | 'storage' | 'member'; name: string }
export type Mismatch = { row: number; expected: Delta; built: Delta }

export type Plan = {
  txs: PlannedTx[]
  payables: Payable[]
  preLoans: PreLoan[]
  missingRefs: MissingRef[]
  mismatches: Mismatch[]
  warns: string[]
  /** rows whose own amounts/tags did not match the snapshot delta, so the solver built the lines */
  solverRows: number[]
  /** refs extended with temporary negative ids for missingRefs accounts/storages */
  refs: Refs
}

export type PlanOptions = { allowFix?: boolean }

const POST = '郵局'
const CASH = '現金'
const RESERVE = '緊急應變備用金'
const FUTURE = '共存前瞻預算'
export const FIX_LABEL = '矯正回歸（匯入）'
const PRE_LOAN_START = '2024-11-01'
const REPAY_RE = /#不凍結零用金(\d[\d,]*)元用以償還(?:（(\d[\d,]*)元手續費）)?\s*(.+?)所提供/g

const num = (s: string) => Number(s.replace(/,/g, ''))
const pad = (n: number) => String(n).padStart(2, '0')
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const orNull = (s: string) => (s.trim() === '' ? null : s)
const stripRole = (s: string) => s.trim().replace(/^(巢穴人|巢穴眾|外家代表)\s*/, '').trim()

function lineDelta(lines: Line[]): Delta {
  const d: Delta = { accounts: {}, storages: {} }
  for (const l of lines) {
    d.accounts[l.account_id] = (d.accounts[l.account_id] ?? 0) + l.amount
    d.storages[l.storage_id] = (d.storages[l.storage_id] ?? 0) + l.amount
  }
  for (const side of [d.accounts, d.storages]) for (const k of Object.keys(side)) if (side[Number(k)] === 0) delete side[Number(k)]
  return d
}
function subDelta(a: Delta, b: Delta): Delta {
  const out: Delta = { accounts: {}, storages: {} }
  for (const side of ['accounts', 'storages'] as const) {
    for (const k of new Set([...Object.keys(a[side]), ...Object.keys(b[side])])) {
      const v = (a[side][Number(k)] ?? 0) - (b[side][Number(k)] ?? 0)
      if (v !== 0) out[side][Number(k)] = v
    }
  }
  return out
}

/** Names above the ———— divider are accounts, below are storages. */
function snapshotSides(cell: string): { accounts: string[]; storages: string[] } {
  const out = { accounts: [] as string[], storages: [] as string[] }
  let below = false
  for (const raw of cell.split('\n')) {
    const line = raw.trim()
    if (/^[—–-]{3,}/.test(line)) {
      below = true
      continue
    }
    const m = line.match(/^(.+?)：(-?[\d,]+)/)
    if (!m) continue
    const key = m[1].trim()
    if (key === '剩餘' || key === '小結') continue
    ;(below ? out.storages : out.accounts).push(ACCOUNT_ALIASES[key] ?? key)
  }
  return out
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000)
}

/** Month number in a title → ISO YYYY-MM relative to the row date (Dec/Jan wrap either way). */
function isoMonth(month: number, rowDate: string): string {
  let year = Number(rowDate.slice(0, 4))
  const rowMonth = Number(rowDate.slice(5, 7))
  if (month - rowMonth > 6) year -= 1
  else if (rowMonth - month > 6) year += 1
  return `${year}-${pad(month)}`
}

export function donationMonths(title: string, rowDate: string): string[] {
  const m = title.match(/(\d{1,2})月((?:\+\d{1,2}月)*)/)
  if (!m) return [rowDate.slice(0, 7)]
  const months = [m[1], ...(m[2].match(/\d{1,2}/g) ?? [])].map(Number).filter((x) => x >= 1 && x <= 12)
  return months.length ? months.map((x) => isoMonth(x, rowDate)) : [rowDate.slice(0, 7)]
}

export function planImport(rows: RawRow[], baseRefs: PlanRefs, opts: PlanOptions = {}): Plan {
  // Working refs: copies we can extend with temporary ids for missing names.
  const refs: Refs = { mainId: baseRefs.mainId, accounts: [...baseRefs.accounts], storages: [...baseRefs.storages] }
  const missingRefs: MissingRef[] = []
  const warns: string[] = []
  const mismatches: Mismatch[] = []
  const txs: PlannedTx[] = []
  const payables: Payable[] = []
  const preLoans: PreLoan[] = []
  const solverRows: number[] = []
  let tmpId = -1

  const postId = () => refs.storages.find((s) => s.name === POST)!.id
  const cashId = () => refs.storages.find((s) => s.name === CASH)!.id
  const accId = (name: string) => refs.accounts.find((a) => a.name === name)?.id
  const ensureAccount = (name: string) => {
    if (accId(name) !== undefined || refs.storages.some((s) => s.name === name)) return
    refs.accounts.push({ id: tmpId--, name, kind: 'special', default_storage_id: postId() })
    missingRefs.push({ kind: 'account', name })
  }
  const ensureStorage = (name: string) => {
    if (refs.storages.some((s) => s.name === name) || accId(name) !== undefined) return
    refs.storages.push({ id: tmpId--, name })
    missingRefs.push({ kind: 'storage', name })
  }

  const memberByName = (raw: string | null) => {
    if (!raw) return null
    const name = raw.trim()
    for (const n of [name, MEMBER_ALIASES[name]].filter(Boolean) as string[]) {
      const lc = n.toLowerCase()
      const m = baseRefs.members.find((x) => x.nickname.toLowerCase() === lc) ?? baseRefs.members.find((x) => x.real_name === n)
      if (m) return m
    }
    return null
  }
  const missingMember = (name: string) => {
    if (!missingRefs.some((m) => m.kind === 'member' && m.name === name)) missingRefs.push({ kind: 'member', name })
  }
  const tagNames = new Set(baseRefs.tags.map((t) => t.name))
  const expenseTags = (note: string) => {
    const out: string[] = []
    for (const t of note.match(/#[^\s#]+/g) ?? []) {
      const n = t.slice(1)
      const hit = tagNames.has(n) ? n : n.startsWith('巢穴共同體') && tagNames.has(n.slice(5)) ? n.slice(5) : null
      if (hit && !out.includes(hit)) out.push(hit)
    }
    return out
  }

  // Balances by (account, storage) pair, from planned lines.
  const pairs = new Map<string, number>()
  const apply = (lines: Line[]) => {
    for (const l of lines) {
      const k = `${l.account_id}|${l.storage_id}`
      pairs.set(k, (pairs.get(k) ?? 0) + l.amount)
    }
  }
  const accountBalance = (id: number) => {
    let s = 0
    for (const [k, v] of pairs) if (Number(k.split('|')[0]) === id) s += v
    return s
  }

  // Snapshot chain.
  let prev: Record<string, number> | null = null // last consistent snapshot
  let pending: Line[] = [] // lines planned since `prev`
  let pendingRows: number[] = []
  let prevOccurred = ''
  let prevDateForParse = ''
  let stop = false
  let pendingReset: PlannedTx | null = null
  const settlementCount = new Map<string, number>()
  const plannedLoans: { importRow: number; lender: string; memberId: number | null }[] = []
  const repaidByLender = new Map<string, number>()

  const repaymentRow = (lender: string, principal: number, fee: number): Record<string, unknown> => {
    const lenderId = memberByName(lender)?.id ?? null
    const loan = plannedLoans.find((l) => l.lender === lender || (lenderId !== null && l.memberId === lenderId))
    if (!loan && !preLoans.some((p) => p.lender === lender)) preLoans.push({ lender, principal: 0, started_on: PRE_LOAN_START })
    if (!loan) repaidByLender.set(lender, (repaidByLender.get(lender) ?? 0) + principal)
    return {
      loan_id: null,
      amount: principal,
      fee,
      loan_ref: loan ? { import_row: loan.importRow } : { pre_loan: lender },
    }
  }

  // Rows after the last snapshot row whose dates lack a day are future bills, not transactions.
  const lastSnapRow = Math.max(0, ...rows.filter((r) => parseSnapshot(r.snapshotCell)).map((r) => r.row))

  // 歸零清算 zone: rows after the last snapshot before the reset row, up to the next opening row,
  // all occur on the reset row's date (their own dates stay in statedOn).
  const resetIdx = rows.findIndex((r) => r.kind.trim() === '歸零清算')
  let zone: { from: number; to: number; date: string } | null = null
  if (resetIdx >= 0) {
    const reset = rows[resetIdx]
    const before = rows.slice(0, resetIdx).filter((r) => parseSnapshot(r.snapshotCell))
    const opening = rows.slice(resetIdx + 1).find((r) => r.kind.includes('二階實踐') || r.kind.trim() === '初始金額')
    zone = {
      from: before.length ? before[before.length - 1].row + 1 : reset.row,
      to: opening ? opening.row - 1 : reset.row,
      date: parseDate(reset.date, '').occurred,
    }
  }

  const push = (tx: PlannedTx) => {
    txs.push(tx)
    apply(tx.lines)
    pending.push(...tx.lines)
    prevOccurred = tx.occurredOn
  }

  const finalizeReset = (seqRow: number) => {
    if (!pendingReset) return
    // Zero every account and storage balance; the solver keeps the line count small
    // (each non-main account at its default storage, main absorbs the per-storage rest).
    const neg: Delta = { accounts: {}, storages: {} }
    for (const [k, v] of pairs) {
      const [a, st] = k.split('|').map(Number)
      neg.accounts[a] = (neg.accounts[a] ?? 0) - v
      neg.storages[st] = (neg.storages[st] ?? 0) - v
    }
    const target = subDelta(neg, { accounts: {}, storages: {} }) // drops zero entries
    const lines = solveLines(target, refs, { storage: null, label: null })
    if (!checkLines(lines, target).ok) warns.push(`reset row ${pendingReset.importRow}: solver could not zero balances`)
    pendingReset.lines = lines
    pendingReset.amount = sum(lines.map((l) => l.amount))
    pendingReset.seq = seqRow * 10 + 5
    pendingReset.occurredOn = prevOccurred > pendingReset.occurredOn ? prevOccurred : pendingReset.occurredOn
    if (pendingRows.length) warns.push(`reset row ${pendingReset.importRow}: rows ${pendingRows.join(',')} had no checkpoint; absorbed by the reset`)
    push(pendingReset)
    pendingReset = null
    prev = {}
    pending = []
    pendingRows = []
  }

  for (const r of rows) {
    if (stop) break
    const tags = parseTags(r.note)
    const cls = classifyRow(r, tags)
    if (cls.isMonthMarker) continue
    const rowWarns: string[] = []

    const d = parseDate(r.date, prevDateForParse)
    if (d.warn) rowWarns.push(d.warn)
    prevDateForParse = d.occurred
    const inZone = zone !== null && r.row >= zone.from && r.row <= zone.to
    const occurredOn = inZone ? zone!.date : d.occurred > prevOccurred ? d.occurred : prevOccurred
    const title = r.title.trim()
    const vendor = title.match(/【(.+?)】/)?.[1]?.trim() ?? null

    let amounts: { amount: number; label: string | null }[] = []
    if (!['settlement', 'reset', 'opening', 'transfer'].includes(cls.type) || /^[+-]?[\d,]+$/.test(r.amountCell.trim())) {
      try {
        amounts = parseAmounts(r.amountCell, r.kind.trim() === '支出' ? -1 : 1)
      } catch (e) {
        rowWarns.push(String((e as Error).message))
      }
    }
    if (cls.type === 'transfer') amounts = []
    const amount = sum(amounts.map((a) => a.amount))

    if (r.row > lastSnapRow && r.kind.trim() === '支出' && /missing day/.test(d.warn ?? '')) {
      const text = `${r.note}\n${r.comment}`
      const due = text.match(/(\d{1,2})\/(\d{1,2})/)
      payables.push({
        title: title.replace(/【.+?】/, '').replace(/\s*\n\s*/g, ' ').trim(),
        amount: Math.abs(amount),
        due_on: due ? `${d.occurred.slice(0, 4)}-${pad(+due[1])}-${pad(+due[2])}` : null,
        vendor,
      })
      continue
    }

    // Opening of a new phase: settle the pending reset first.
    if (cls.type === 'opening' && pendingReset) finalizeReset(r.row - 1)

    const base: PlannedTx = {
      importRow: r.row,
      type: cls.type,
      occurredOn,
      statedOn: d.stated,
      dateNote: d.note,
      seq: r.row * 10,
      title,
      voucher: orNull(r.voucher),
      note: orNull(r.note),
      comment: orNull(r.comment),
      amount,
      incomeSource: cls.incomeSource,
      offLedger: false,
      lines: [],
      warns: rowWarns,
    }

    if (cls.type === 'reset') {
      base.amount = 0
      pendingReset = base
      continue
    }

    // Snapshot for this row.
    const sides = snapshotSides(r.snapshotCell)
    sides.accounts.forEach(ensureAccount)
    sides.storages.forEach(ensureStorage)
    const cur = parseSnapshot(r.snapshotCell)
    let target: Delta | null = null // delta this row (plus pending) must produce
    if (cur) {
      const full = snapshotDelta(prev, cur, refs)
      if (sum(Object.values(full.accounts)) !== sum(Object.values(full.storages))) {
        rowWarns.push(`inconsistent snapshot (account Δ ${sum(Object.values(full.accounts))} ≠ storage Δ ${sum(Object.values(full.storages))}); verified at next consistent snapshot`)
      } else target = full
    }

    const parsed = { amounts, tags }
    const extraTxs: PlannedTx[] = []

    // Settlement: repayments extracted from the note come first.
    let freezeBase: number | null = null
    if (cls.type === 'settlement') {
      base.amount = 0
      base.seq = r.row * 10 + 5
      const sid = tags.storage === CASH ? cashId() : postId()
      let k = 0
      for (const m of r.note.matchAll(REPAY_RE)) {
        const principal = num(m[1])
        const fee = m[2] ? num(m[2]) : 0
        const lender = stripRole(m[3])
        const rtx: PlannedTx = {
          ...base,
          type: 'repayment',
          // k-th repayment of settlement row R: seq R*10+k, importRow -(R*10+k) (negative keeps the
          // partial unique index on import_row; the settlement itself is seq R*10+5, importRow R).
          importRow: -(r.row * 10 + k),
          seq: r.row * 10 + k,
          title: `償還 ${lender} 所提供之借款（${title.replace(/\*/g, '')}）`,
          voucher: null,
          note: m[0].replace(/\s*\n\s*/g, ' '),
          comment: null,
          amount: -(principal + fee),
          incomeSource: null,
          lines: [{ account_id: refs.mainId, storage_id: sid, amount: -(principal + fee), label: null }],
          sub: { table: 'fund_repayments', row: repaymentRow(lender, principal, fee) },
          warns: [],
        }
        extraTxs.push(rtx)
        k++
      }
      freezeBase = accountBalance(refs.mainId) - sum(extraTxs.map((t) => -t.amount))
    }

    // Lines.
    let waived = false
    if (target) {
      const pendingAndExtra = [...pending, ...extraTxs.flatMap((t) => t.lines)]
      const residual = subDelta(target, lineDelta(pendingAndExtra))
      if (cls.type === 'settlement') {
        base.lines = solveLines(residual, refs, { storage: null, label: null })
      } else {
        const b = buildLines(parsed, residual, refs)
        base.lines = b.lines
        if (b.warn) rowWarns.push(b.warn)
        if (b.usedSolver) solverRows.push(r.row)
        if (b.offLedger || b.waived) base.offLedger = true
        if (b.offLedger && tags.claimed) rowWarns.push('claimed tag but zero delta')
        waived = b.waived === true
      }
      const all = [...pendingAndExtra, ...base.lines]
      const chk = checkLines(all, target)
      if (!chk.ok) {
        const accDiff = sum(Object.values(chk.diff.accounts))
        const stoDiff = sum(Object.values(chk.diff.storages))
        if (opts.allowFix && accDiff === stoDiff) {
          const fix = solveLines(subDelta(target, lineDelta(all)), refs, { storage: POST, label: FIX_LABEL })
          base.lines.push(...fix.map((l) => ({ ...l, label: l.label ?? FIX_LABEL })))
          rowWarns.push(`correction line(s) appended: ${JSON.stringify(chk.diff)}`)
        } else {
          mismatches.push({ row: r.row, expected: target, built: lineDelta(all) })
          if (!opts.allowFix) stop = true
        }
      }
    } else {
      // No checkpoint: candidate lines as-is.
      if (cls.type === 'settlement') {
        rowWarns.push('settlement without consistent snapshot: no freeze lines')
      } else if (tags.waived) {
        base.offLedger = true
        waived = true
      } else {
        const c = candidateLines(parsed, refs)
        base.lines = c.lines
        if (c.unresolved) rowWarns.push('unresolved inline transfer (no checkpoint)')
        if (tags.advancer) rowWarns.push('advancer row without checkpoint: assumed paid from fund')
      }
    }

    // Sub-tables.
    const voucherAndNote = `${r.voucher}\n${r.note}`
    if (cls.type === 'donation') {
      const member = memberByName(tags.member)
      if (!member) missingMember(tags.member ?? '(none)')
      const payerName = title.match(/（(.+?)代繳）/)?.[1] ?? null
      const payer = payerName ? memberByName(stripRole(payerName)) : null
      if (payerName && !payer) rowWarns.push(`payer not found: ${payerName}`)
      const last5 = voucherAndNote.match(/末五碼(\d{5})/)?.[1] ?? null
      const handlerName = voucherAndNote.match(/#於巢穴由(.+?)經手/)?.[1] ?? null
      const handler = handlerName ? baseRefs.handlers.find((h) => h.name === handlerName) ?? null : null
      if (handlerName && !handler) rowWarns.push(`handler not found: ${handlerName}`)
      base.sub = {
        table: 'fund_donations',
        row: {
          member_id: member?.id ?? null,
          payer_member_id: payer?.id ?? null,
          payment_method: last5 ? 'transfer' : 'cash',
          last5,
          handler_id: handler?.id ?? null,
          months: donationMonths(title, d.stated ?? occurredOn),
          message: orNull(r.comment),
        },
      }
    } else if (cls.type === 'expense') {
      const advancer = tags.advancer ? baseRefs.advancers.find((a) => a.name === tags.advancer) ?? null : null
      if (tags.advancer && !advancer) rowWarns.push(`advancer not found: ${tags.advancer}`)
      const claim = waived ? 'waived' : tags.advancer ? (base.offLedger ? 'unclaimed' : 'claimed') : 'none'
      base.sub = {
        table: 'fund_expenses',
        row: {
          vendor,
          description: title.replace(/【.+?】/, '').trim() || null,
          voucher_no: r.voucher.match(/[A-Z]{2}-?\d{8}/)?.[0] ?? r.voucher.match(/末五碼(\d{5})/)?.[1] ?? null,
          tags: expenseTags(r.note),
          advancer_id: advancer?.id ?? null,
          claim_status: claim,
        },
      }
    } else if (cls.type === 'loan') {
      let member = null
      for (const t of r.note.match(/#[^\s#]+/g) ?? []) if ((member = memberByName(t.slice(1)))) break
      const titleName = title.match(/^(?:巢穴人|巢穴眾|外家代表)?\s*(.+?)(?:（.+?）)?\s*(?:借款|借貸)/)?.[1]?.trim() ?? title
      const lender = member?.nickname ?? titleName
      plannedLoans.push({ importRow: r.row, lender, memberId: member?.id ?? null })
      base.sub = {
        table: 'fund_loans',
        row: { lender_name: lender, lender_member_id: member?.id ?? null, principal: amount, started_on: occurredOn, status: 'open', note: null },
      }
    } else if (cls.type === 'repayment') {
      const m = title.match(/償還\s*(.+?)(?:所提供|借)/)
      const lender = m ? stripRole(m[1]) : (tags.tags.map((t) => t.slice(1)).find((t) => memberByName(t)) ?? '(unknown)')
      const abs = amounts.map((a) => Math.abs(a.amount))
      base.sub = { table: 'fund_repayments', row: repaymentRow(lender, abs[0] ?? 0, sum(abs.slice(1))) }
    } else if (cls.type === 'settlement') {
      const mm = title.match(/\*{3}(\d{1,2})月結算\*{3}/)
      const settledOn = d.stated ?? occurredOn
      const month = mm ? isoMonth(+mm[1], settledOn) : settledOn.slice(0, 7)
      if (!mm) rowWarns.push('settlement month not found in title')
      const periodNo = (settlementCount.get(month) ?? 0) + 1
      settlementCount.set(month, periodNo)
      const frozen = (name: string) => {
        const id = accId(name)
        return Math.max(0, sum(base.lines.filter((l) => l.account_id === id).map((l) => l.amount)))
      }
      const frozenReserve = frozen(RESERVE)
      const frozenFuture = frozen(FUTURE)
      base.sub = {
        table: 'fund_settlements',
        row: {
          month,
          period_no: periodNo,
          actual_post: null,
          actual_cash: null,
          system_post: cur?.[POST] ?? null,
          system_cash: cur?.[CASH] ?? null,
          freeze_base: freezeBase,
          frozen_reserve: frozenReserve,
          frozen_future: frozenFuture,
          zero_reason: r.note.includes('因餘款不足') ? '因餘款不足' : frozenReserve === 0 && frozenFuture === 0 ? '匯入：原因未註明' : null,
          late_days: Math.max(0, daysBetween(`${month}-20`, settledOn)),
        },
      }
    }

    if (base.lines.length === 0 && !base.offLedger && base.amount !== 0 && cls.type !== 'settlement') {
      rowWarns.push(`amount ${base.amount} but zero snapshot delta: no lines`)
    }
    if (cls.type === 'transfer' && base.lines.length === 0) rowWarns.push('transfer with no resolvable lines')
    for (const t of extraTxs) push(t)
    push(base)
    if (target) {
      prev = cur
      pending = []
      pendingRows = []
    } else pendingRows.push(r.row)
  }
  if (!stop) finalizeReset(rows.length ? rows[rows.length - 1].row : 0)
  if (pendingRows.length) warns.push(`rows ${pendingRows.join(',')} after the last consistent snapshot are unverified`)

  // Pre-ledger loans: principal = repaid + remaining from the last settlement note naming the lender.
  for (const p of preLoans) {
    let remaining = 0
    for (const r of rows) {
      if (r.kind.trim() !== '結算') continue
      const esc = p.lender.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const m = r.note.match(new RegExp(`${esc}.*?剩餘\\s*([\\d,]+)\\s*元`))
      if (m) remaining = num(m[1])
    }
    p.principal = (repaidByLender.get(p.lender) ?? 0) + remaining
  }

  for (const t of txs) for (const w of t.warns) warns.push(`row ${t.importRow}: ${w}`)
  return { txs, payables, preLoans, missingRefs, mismatches, warns, solverRows, refs }
}
