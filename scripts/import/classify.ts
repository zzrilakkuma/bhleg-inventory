import type { FundTransactionType, IncomeSource } from '../../lib/fund.ts'
import type { RawRow, parseTags } from './normalize.ts'
import { NON_MEMBER_DONORS } from './aliases.ts'

export type Classification = {
  type: FundTransactionType
  incomeSource: IncomeSource | null
  isMonthMarker: boolean
}

function out(type: FundTransactionType, incomeSource: IncomeSource | null = null, isMonthMarker = false): Classification {
  return { type, incomeSource, isMonthMarker }
}

function classifyIncome(r: RawRow, tags: ReturnType<typeof parseTags>): Classification {
  const { title, note } = r
  const donorTag = note.includes('#巢穴共同體成員奉納')
  const nonMember = tags.member === null || NON_MEMBER_DONORS.includes(tags.member)
  // parseTags can mistake a loan tag line (#巢穴緊急紓困借款...) for the member; such rows are loans.
  // Reinject (title 回注) wins over donation: e.g. 中央蘭室 奉納 ... 未用盡之餘款回注.
  if (/回注/.test(title)) return out('refund', 'reinject')
  const loanTagAsMember = tags.member !== null && /借款|借貸|紓困/.test(tags.member)
  if (donorTag && !nonMember && !loanTagAsMember) return out('donation', 'donation')
  // A member's regular donation recorded under an anonymous donor tag (#匿名 #巢穴人 ...): income/donation, no member.
  if (donorTag && nonMember && /#巢穴人|#巢穴眾/.test(note)) return out('income', 'donation')
  if (/#沙龍營業|#營業收入|沙龍營業/.test(title + '\n' + note)) return out('income', 'salon')
  if (/借款|借貸|紓困借/.test(title + '\n' + note)) return out('loan', 'loan')
  if (note.includes('#利息')) return out('income', 'interest')
  if (/隨喜/.test(title + '\n' + note)) return out('income', 'kitchen')
  if (/自由の奉納|巢流祭|聚餐|分攤|活動收入/.test(title + '\n' + note) || (donorTag && nonMember)) {
    return out('income', 'event')
  }
  return out('income', 'other')
}

export function classifyRow(r: RawRow, tags: ReturnType<typeof parseTags>): Classification {
  const kind = r.kind.trim()
  if (kind === '') {
    // Blank-kind rows are either month markers (月份) or fully empty rows; callers (Task 9) skip both.
    return out('income', null, true)
  }
  if (kind.includes('二階實踐') || kind === '初始金額') return out('opening')
  switch (kind) {
    case '收入':
      return classifyIncome(r, tags)
    case '支出':
      if (/償還.+?(所提供|借)/.test(r.title) || r.note.includes('#償還')) return out('repayment')
      return out('expense')
    case '結算':
      return out('settlement')
    case '歸零清算':
      return out('reset')
    case '小組彙整':
      return out('group_summary')
    case '轉帳':
      return out('transfer')
    default:
      throw new Error(`row ${r.row}: unknown kind ${JSON.stringify(r.kind)}`)
  }
}
