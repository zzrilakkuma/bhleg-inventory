import { ACCOUNT_ALIASES } from './aliases.ts'

export type Refs = {
  accounts: { id: number; name: string; kind: string; default_storage_id: number | null }[]
  storages: { id: number; name: string }[]
  mainId: number
}
export type Line = { account_id: number; storage_id: number; amount: number; label: string | null }
export type Delta = { accounts: Record<number, number>; storages: Record<number, number> }
export type Parsed = {
  amounts: { amount: number; label: string | null }[]
  tags: {
    storage: string | null
    advancer: string | null
    waived: boolean
    transfers: { from: string; to: string; amount: number }[]
  }
}
export type BuildResult = {
  lines: Line[]
  usedSolver: boolean
  offLedger?: boolean
  waived?: boolean
  warn?: string
}

const POST_OFFICE = '郵局'

function addTo(rec: Record<number, number>, id: number, v: number) {
  rec[id] = (rec[id] ?? 0) + v
}
function dropZeros(rec: Record<number, number>): Record<number, number> {
  const out: Record<number, number> = {}
  for (const [k, v] of Object.entries(rec)) if (v !== 0) out[Number(k)] = v
  return out
}

export function snapshotDelta(
  prev: Record<string, number> | null,
  cur: Record<string, number>,
  refs: Refs,
): Delta {
  const acc = new Map(refs.accounts.map((a) => [a.name, a.id]))
  const sto = new Map(refs.storages.map((s) => [s.name, s.id]))
  const out: Delta = { accounts: {}, storages: {} }
  const names = new Set([...Object.keys(cur), ...Object.keys(prev ?? {})])
  for (const name of names) {
    if (name === '小結') continue
    const d = (cur[name] ?? 0) - (prev?.[name] ?? 0)
    if (acc.has(name)) addTo(out.accounts, acc.get(name)!, d)
    else if (sto.has(name)) addTo(out.storages, sto.get(name)!, d)
    else throw new Error(`snapshotDelta: unknown account/storage name "${name}"`)
  }
  return { accounts: dropZeros(out.accounts), storages: dropZeros(out.storages) }
}

export function checkLines(lines: Line[], delta: Delta): { ok: boolean; diff: Delta } {
  const built: Delta = { accounts: {}, storages: {} }
  for (const l of lines) {
    addTo(built.accounts, l.account_id, l.amount)
    addTo(built.storages, l.storage_id, l.amount)
  }
  const diff = (a: Record<number, number>, b: Record<number, number>) => {
    const out: Record<number, number> = {}
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const d = (a[Number(k)] ?? 0) - (b[Number(k)] ?? 0)
      if (d !== 0) out[Number(k)] = d
    }
    return out
  }
  const d = { accounts: diff(built.accounts, delta.accounts), storages: diff(built.storages, delta.storages) }
  return { ok: Object.keys(d.accounts).length === 0 && Object.keys(d.storages).length === 0, diff: d }
}

function allocate(
  delta: Delta,
  refs: Refs,
  hint: { label?: string | null },
  pick: (acc: Refs['accounts'][number], d: number, remaining: Record<number, number>) => number,
): Line[] {
  const remaining: Record<number, number> = { ...delta.storages }
  const lines: Line[] = []
  const nonMain = refs.accounts.filter((a) => a.id !== refs.mainId).sort((a, b) => a.id - b.id)
  for (const a of nonMain) {
    const d = delta.accounts[a.id] ?? 0
    if (d === 0) continue
    const sid = pick(a, d, remaining)
    remaining[sid] = (remaining[sid] ?? 0) - d
    lines.push({ account_id: a.id, storage_id: sid, amount: d, label: a.name })
  }
  for (const sid of Object.keys(remaining).map(Number).sort((a, b) => a - b)) {
    const v = remaining[sid]
    if (v !== 0) lines.push({ account_id: refs.mainId, storage_id: sid, amount: v, label: hint.label ?? null })
  }
  return lines
}

export function solveLines(delta: Delta, refs: Refs, hint: { storage: string | null; label?: string | null }): Line[] {
  const fallbackSid = refs.storages.find((s) => s.name === (hint.storage ?? POST_OFFICE))?.id
    ?? refs.storages.find((s) => s.name === POST_OFFICE)?.id
  const byDefault = (a: Refs['accounts'][number]) => a.default_storage_id ?? fallbackSid!
  const A = allocate(delta, refs, hint, (a) => byDefault(a))
  const B = allocate(delta, refs, hint, (a, d, rem) => {
    let best: number | null = null
    for (const [k, v] of Object.entries(rem)) {
      if (v === 0 || Math.sign(v) !== Math.sign(d)) continue
      if (best === null || Math.abs(v) > Math.abs(rem[best]) || (Math.abs(v) === Math.abs(rem[best]) && Number(k) < best)) best = Number(k)
    }
    return best ?? byDefault(a)
  })
  const okA = checkLines(A, delta).ok
  const okB = checkLines(B, delta).ok
  // Default-storage allocation first (spec step 1/2); the same-sign fallback (step 3)
  // is used when A is inconsistent, or when it is consistent but needs more lines
  // (e.g. a cash donation to a group fund that landed in a non-default storage).
  if (okA && (!okB || A.length <= B.length)) return A
  if (okB) return B
  return A
}

/** Lines implied by the row's own amounts and inline transfer tags, without any snapshot check. */
export function candidateLines(parsed: Parsed, refs: Refs): { lines: Line[]; unresolved: boolean } {
  const { tags } = parsed
  const accByName = new Map(refs.accounts.map((a) => [a.name, a]))
  const stoByName = new Map(refs.storages.map((s) => [s.name, s.id]))
  const accById = new Map(refs.accounts.map((a) => [a.id, a]))
  const postId = stoByName.get(POST_OFFICE)!
  const alias = (n: string) => ACCOUNT_ALIASES[n] ?? n
  const tagStorage = tags.storage ? stoByName.get(tags.storage) ?? null : null

  const lines: Line[] = []
  for (const { amount, label } of parsed.amounts) {
    const name = label ? alias(label) : null
    const acc = name ? accByName.get(name) : undefined
    const account = acc ?? accById.get(refs.mainId)!
    lines.push({
      account_id: account.id,
      storage_id: tagStorage ?? account.default_storage_id ?? postId,
      amount,
      label: acc ? acc.name : label,
    })
  }

  const resolve = (raw: string): { account_id: number; storage_id: number } | null => {
    if (raw.includes('/')) {
      const [a, b] = raw.split('/').map((s) => alias(s.trim()))
      const acc = accByName.get(a)
      const sid = stoByName.get(b)
      return acc && sid ? { account_id: acc.id, storage_id: sid } : null
    }
    const n = alias(raw)
    const sid = stoByName.get(n)
    if (sid) return { account_id: refs.mainId, storage_id: sid }
    const acc = accByName.get(n)
    if (acc) return { account_id: acc.id, storage_id: acc.default_storage_id ?? postId }
    return null
  }
  let unresolved = false
  for (const t of tags.transfers) {
    const from = resolve(t.from)
    const to = resolve(t.to)
    if (!from || !to) {
      unresolved = true
      continue
    }
    lines.push({ ...from, amount: -t.amount, label: null })
    lines.push({ ...to, amount: t.amount, label: null })
  }
  return { lines: lines.filter((l) => l.amount !== 0), unresolved }
}

export function buildLines(parsed: Parsed, delta: Delta, refs: Refs): BuildResult {
  const { tags } = parsed
  const isZero =
    Object.values(delta.accounts).every((v) => v === 0) && Object.values(delta.storages).every((v) => v === 0)
  if (tags.waived) {
    const r: BuildResult = { lines: [], usedSolver: false, waived: true }
    if (!isZero) r.warn = 'waived row has non-zero snapshot delta'
    return r
  }
  if (tags.advancer && isZero) return { lines: [], usedSolver: false, offLedger: true }

  const { lines: merged, unresolved } = candidateLines(parsed, refs)
  if (!unresolved && checkLines(merged, delta).ok) return { lines: merged, usedSolver: false }
  return { lines: solveLines(delta, refs, { storage: tags.storage, label: null }), usedSolver: true }
}
