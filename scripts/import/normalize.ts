import { ACCOUNT_ALIASES } from './aliases.ts'

export type RawRow = {
  row: number
  kind: string
  date: string
  title: string
  voucher: string
  amountCell: string
  note: string
  snapshotCell: string
  comment: string
}

export function toRawRows(rows: string[][]): RawRow[] {
  return rows.slice(1).map((r, i) => ({
    row: i + 2,
    kind: r[0] ?? '',
    date: r[1] ?? '',
    title: r[2] ?? '',
    voucher: r[3] ?? '',
    amountCell: r[4] ?? '',
    note: r[5] ?? '',
    snapshotCell: r[6] ?? '',
    comment: r[7] ?? '',
  }))
}

const pad = (n: number) => String(n).padStart(2, '0')

export function parseDate(
  cell: string,
  prev: string,
): { occurred: string; stated: string | null; note: string | null; warn?: string } {
  const notes: string[] = []
  const rest = cell.replace(/（(.+?)）/g, (_, t: string) => {
    notes.push(t.trim())
    return ' '
  })
  const note = notes.length ? notes.join(' ') : null
  const m = rest.match(/(?<!\d)(\d{4})\/(\d{1,2})(?:\/(\d{1,2})?)?/)
  if (!m || +m[2] < 1 || +m[2] > 12) {
    return { occurred: prev, stated: null, note, warn: `unparseable date ${JSON.stringify(cell)}, using previous ${prev}` }
  }
  const ym = `${m[1]}-${pad(+m[2])}`
  if (!m[3] || +m[3] === 0) {
    return { occurred: `${ym}-01`, stated: null, note, warn: `missing day in ${JSON.stringify(cell)}, using day 01` }
  }
  const iso = `${ym}-${pad(+m[3])}`
  return { occurred: iso, stated: iso, note }
}

const AMOUNT_RE = /^([+-]?)\s*([\d,]+|·|～[\d,]+)\s*(?:（(.+?)）)?$/

export function parseAmounts(cell: string, sign: 1 | -1): { amount: number; label: string | null }[] {
  const lines = cell.split('\n').map((l) => l.trim())
  const tokens: string[] = []
  for (let i = 0; i < lines.length; i++) {
    let t = lines[i]
    if (t === '') continue
    if (t.startsWith('（') && tokens.length > 0) {
      tokens[tokens.length - 1] += t
      continue
    }
    if (t === '+' || t === '-') {
      let j = i + 1
      while (j < lines.length && lines[j] === '') j++
      if (j < lines.length) {
        t = t + lines[j]
        i = j
      }
    }
    tokens.push(t)
  }
  return tokens.map((t) => {
    const m = t.match(AMOUNT_RE)
    if (!m) throw new Error(`cannot parse amount token: ${JSON.stringify(t)}`)
    let body = m[2]
    let value: number
    if (body === '·') value = 0
    else {
      if (body.startsWith('～')) body = body.slice(1)
      value = Number(body.replace(/,/g, ''))
    }
    const s = m[1] === '-' ? -1 : m[1] === '+' ? 1 : sign
    return { amount: value === 0 ? 0 : s * value, label: m[3] ?? null }
  })
}

export function parseSnapshot(cell: string): Record<string, number> | null {
  const out: Record<string, number> = {}
  for (const line of cell.split('\n')) {
    const m = line.trim().match(/^(.+?)：(-?[\d,]+)/)
    if (!m) continue
    const key = m[1].trim()
    if (key === '剩餘') continue
    out[ACCOUNT_ALIASES[key] ?? key] = Number(m[2].replace(/,/g, ''))
  }
  return Object.keys(out).length ? out : null
}

export type Storage = '郵局' | '現金' | '現金（廚房）'
export type Advancer = '中央蘭室' | '信用卡'

const STORAGE_RULES: [Storage, string[]][] = [
  ['郵局', ['#存放郵局', '#匯入', '#匯出', '#郵局支出', '#存入郵局', '#郵局', '#郵局支付', '#存入郵局支付', '#郵局帳戶存摺']],
  ['現金', ['#存放現金袋', '#現金', '#現金袋支付', '#存放現金', '#現金支出', '#現金袋支出', '#現金支付']],
  ['現金（廚房）', ['#廚房隨喜桶']],
]
const KEYWORDS = new Set<string>([
  '#巢穴共同體成員奉納',
  '#已請款',
  '#應請款已請款',
  '#無須支付',
  '#中央蘭室代墊',
  '#艾摩爾信用卡預先支付',
  '#信用卡代墊',
  ...STORAGE_RULES.flatMap(([, t]) => t),
])

export function parseTags(note: string): {
  tags: string[]
  storage: Storage | null
  advancer: Advancer | null
  claimed: boolean
  waived: boolean
  transfers: { from: string; to: string; amount: number }[]
  member: string | null
  handler: string | null
  last5: string | null
  months: string[]
} {
  const tags = note.match(/#[^\s#]+/g) ?? []
  const set = new Set(tags)
  let storage: Storage | null = null
  for (const [name, list] of STORAGE_RULES) {
    if (list.some((t) => set.has(t))) {
      storage = name
      break
    }
  }
  const advancer: Advancer | null = set.has('#中央蘭室代墊')
    ? '中央蘭室'
    : set.has('#艾摩爾信用卡預先支付') || set.has('#信用卡代墊')
      ? '信用卡'
      : null
  const claimed = set.has('#已請款') || set.has('#應請款已請款')
  const waived = note.includes('放棄請款') || note.includes('不請款') || set.has('#無須支付')

  const transfers: { from: string; to: string; amount: number }[] = []
  const re = /#「(.+?)」(?:轉入|匯入|轉至|移至)「(.+?)」\s*([\d,]+)\s*元/g
  let m: RegExpExecArray | null
  while ((m = re.exec(note))) {
    transfers.push({
      from: ACCOUNT_ALIASES[m[1]] ?? m[1],
      to: ACCOUNT_ALIASES[m[2]] ?? m[2],
      amount: Number(m[3].replace(/,/g, '')),
    })
  }

  let member: string | null = null
  const lines = note.split('\n')
  if (lines[0].includes('#巢穴共同體成員奉納') && lines[1]) {
    const first = lines[1].match(/#[^\s#]+/)?.[0]
    if (first && !KEYWORDS.has(first)) member = first.slice(1)
  }

  return {
    tags,
    storage,
    advancer,
    claimed,
    waived,
    transfers,
    member,
    handler: note.match(/#於巢穴由(.+?)經手/)?.[1] ?? null,
    last5: note.match(/末五碼(\d{5})/)?.[1] ?? null,
    months: [],
  }
}
