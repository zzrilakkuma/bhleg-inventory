import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { RawRow } from './normalize.ts'
import { parseTags } from './normalize.ts'
import { classifyRow } from './classify.ts'

const mk = (o: Partial<RawRow>): RawRow => ({
  row: 2, kind: '', date: '', title: '', voucher: '', amountCell: '', note: '', snapshotCell: '', comment: '', ...o,
})
const c = (o: Partial<RawRow>) => classifyRow(mk(o), parseTags(o.note ?? ''))

test('month marker', () => {
  assert.deepEqual(c({ amountCell: '十一月份' }), { type: 'income', incomeSource: null, isMonthMarker: true })
  assert.equal(c({ amountCell: '2月份\n*** 二階實踐開始 ***' }).isMonthMarker, true)
})

test('member donation', () => {
  const r = c({ kind: '收入', title: '奉納', note: '#巢穴共同體成員奉納\n#小明 #存放郵局' })
  assert.equal(r.type, 'donation')
  assert.equal(r.incomeSource, 'donation')
})

test('non-member donor -> income/event', () => {
  const r = c({ kind: '收入', title: '奉納', note: '#巢穴共同體成員奉納\n#匿名 #存放郵局' })
  assert.equal(r.type, 'income')
  assert.equal(r.incomeSource, 'event')
  const r2 = c({ kind: '收入', title: '奉納', note: '#巢穴共同體成員奉納' })
  assert.equal(r2.incomeSource, 'event')
})

test('salon income', () => {
  const r = c({ kind: '收入', title: '沙龍收入', note: '#巢穴 #沙龍營業 #營業收入' })
  assert.equal(r.type, 'income')
  assert.equal(r.incomeSource, 'salon')
})

test('loan income', () => {
  const r = c({ kind: '收入', title: '巢穴眾Eason提供紓困借貸', note: '#匯入' })
  assert.equal(r.type, 'loan')
  assert.equal(r.incomeSource, 'loan')
})

test('loan row tagged as member donation is still loan', () => {
  const r = c({
    kind: '收入',
    title: '巢穴人 嚴昕 借款\n***巢穴緊急紓困借款***',
    note: '#巢穴共同體成員奉納\n#巢穴緊急紓困借款（一階結算與巢穴債務整合）\n#嚴昕 #匯入 #存放郵局\n',
  })
  assert.equal(r.type, 'loan')
  assert.equal(r.incomeSource, 'loan')
})

test('reinject -> refund', () => {
  const r = c({ kind: '收入', title: '特殊專款回注', note: '' })
  assert.equal(r.type, 'refund')
  assert.equal(r.incomeSource, 'reinject')
})

test('interest, kitchen, event, other', () => {
  assert.equal(c({ kind: '收入', title: '郵局利息', note: '#利息' }).incomeSource, 'interest')
  assert.equal(c({ kind: '收入', title: '廚房隨喜', note: '' }).incomeSource, 'kitchen')
  assert.equal(c({ kind: '收入', title: '巢流祭聚餐分攤', note: '' }).incomeSource, 'event')
  const o = c({ kind: '收入', title: '雜項', note: '' })
  assert.equal(o.type, 'income')
  assert.equal(o.incomeSource, 'other')
})

test('repayment', () => {
  const r = c({ kind: '支出', title: '償還巢穴眾Eason所提供的紓困借貸', note: '#匯入帳號末五碼30222' })
  assert.equal(r.type, 'repayment')
  assert.equal(r.incomeSource, null)
  assert.equal(c({ kind: '支出', title: '某項', note: '#償還' }).type, 'repayment')
})

test('expense (salon tag on expense stays expense)', () => {
  const r = c({ kind: '支出', title: '營業稅', note: '#巢穴 #沙龍營業 #營業稅' })
  assert.equal(r.type, 'expense')
  assert.equal(r.incomeSource, null)
})

test('settlement / group_summary / reset / transfer', () => {
  assert.equal(c({ kind: '結算', title: '10月結算' }).type, 'settlement')
  assert.equal(c({ kind: '小組彙整', title: '共享廚房金流1月結算彙整' }).type, 'group_summary')
  assert.equal(c({ kind: '歸零清算' }).type, 'reset')
  assert.equal(c({ kind: '轉帳' }).type, 'transfer')
})

test('opening incl. 二階實踐 variant', () => {
  assert.equal(c({ kind: '初始金額' }).type, 'opening')
  assert.equal(c({ kind: '二階實踐\n初始金額' }).type, 'opening')
})

test('unknown kind throws with kind text', () => {
  assert.throws(() => c({ kind: '怪類型' }), /怪類型/)
})
