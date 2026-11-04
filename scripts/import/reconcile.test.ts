import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildLines, candidateLines, checkLines, snapshotDelta, solveLines, type Refs } from './reconcile.ts'
import { parseTags, parseAmounts } from './normalize.ts'

const refs: Refs = {
  mainId: 1,
  storages: [
    { id: 101, name: '郵局' }, { id: 102, name: '現金' }, { id: 103, name: '現金（廚房）' },
    { id: 104, name: '現金（蘭樂）' }, { id: 105, name: '現金（MT）' }, { id: 106, name: '現金（沙龍）' },
    { id: 107, name: '代墊（待清償）' },
  ],
  accounts: [
    { id: 1, name: '不凍結零用金', kind: 'main', default_storage_id: 101 },
    { id: 2, name: '緊急應變備用金', kind: 'reserve', default_storage_id: 101 },
    { id: 3, name: '共存前瞻預算', kind: 'reserve', default_storage_id: 101 },
    { id: 4, name: '小組專款（沙龍）', kind: 'group', default_storage_id: 106 },
    { id: 5, name: '小組專款（廚房）', kind: 'group', default_storage_id: 103 },
    { id: 6, name: '小組專款（蘭樂）', kind: 'group', default_storage_id: 104 },
    { id: 7, name: '小組專款（Maker）', kind: 'group', default_storage_id: 105 },
    { id: 8, name: '特殊專款（非人）', kind: 'special', default_storage_id: 101 },
    { id: 20, name: '特殊專款', kind: 'special', default_storage_id: 101 },
    { id: 21, name: '特殊專款（廚）', kind: 'special', default_storage_id: 101 },
    { id: 22, name: '特殊專款（椅）', kind: 'special', default_storage_id: 101 },
    { id: 23, name: '特殊專款（Kody）', kind: 'special', default_storage_id: 101 },
    { id: 24, name: '臨時專款（印）', kind: 'special', default_storage_id: 101 },
  ],
}

const parsed = (amountCell: string, note: string) => ({
  amounts: parseAmounts(amountCell, 1),
  tags: parseTags(note),
})
const sum = (lines: { amount: number }[]) => lines.reduce((s, l) => s + l.amount, 0)

test('snapshotDelta: null prev, 小結 ignored, unknown name throws', () => {
  const d = snapshotDelta(null, { 不凍結零用金: 5, 現金: 5, 小結: 10 }, refs)
  assert.deepEqual(d, { accounts: { 1: 5 }, storages: { 102: 5 } })
  const d2 = snapshotDelta({ 現金: 5 }, { 現金: 5 }, refs)
  assert.deepEqual(d2, { accounts: {}, storages: {} })
  assert.throws(() => snapshotDelta(null, { 神秘科目: 1 }, refs), /神秘科目/)
})

test('donation 1500 in cash: single main/現金 line, no solver', () => {
  const delta = { accounts: { 1: 1500 }, storages: { 102: 1500 } }
  const r = buildLines(parsed('1500', '#巢穴共同體成員奉納\n#存放現金袋'), delta, refs)
  assert.deepEqual(r.lines, [{ account_id: 1, storage_id: 102, amount: 1500, label: null }])
  assert.equal(r.usedSolver, false)
})

test('Barney 1000 / +11000（會計專款） to 郵局: two lines', () => {
  const delta = { accounts: { 1: 1000, 20: 11000 }, storages: { 101: 12000 } }
  const r = buildLines(parsed('1000\n+11000（會計專款）', '#匯入'), delta, refs)
  assert.equal(r.usedSolver, false)
  assert.equal(r.lines.length, 2)
  assert.ok(r.lines.some((l) => l.account_id === 1 && l.storage_id === 101 && l.amount === 1000))
  assert.ok(r.lines.some((l) => l.account_id === 20 && l.storage_id === 101 && l.amount === 11000))
})

test('freeze: solver yields three lines at 郵局, sums to 0', () => {
  const delta = { accounts: { 1: -1734, 2: 867, 3: 867 }, storages: {} }
  const lines = solveLines(delta, refs, { storage: null })
  assert.equal(lines.length, 3)
  assert.ok(lines.every((l) => l.storage_id === 101))
  assert.equal(sum(lines), 0)
  assert.equal(checkLines(lines, delta).ok, true)
  const r = buildLines(parsed('', '#凍結'), delta, refs)
  assert.equal(r.usedSolver, true)
})

test('advancer with zero delta: offLedger', () => {
  const r = buildLines(parsed('300', '#中央蘭室代墊'), { accounts: {}, storages: {} }, refs)
  assert.deepEqual(r.lines, [])
  assert.equal(r.offLedger, true)
})

test('checkLines detects mismatch', () => {
  const delta = { accounts: { 1: 100 }, storages: { 101: 100 } }
  const c = checkLines([{ account_id: 1, storage_id: 102, amount: 100, label: null }], delta)
  assert.equal(c.ok, false)
  assert.deepEqual(c.diff, { accounts: {}, storages: { 101: -100, 102: 100 } })
})

test('transfer 郵局 -> 現金袋 5000', () => {
  const delta = { accounts: {}, storages: { 101: -5000, 102: 5000 } }
  const r = buildLines(parsed('', '#「郵局」轉入「現金袋」5000元'), delta, refs)
  assert.equal(r.usedSolver, false)
  assert.equal(r.lines.length, 2)
  assert.ok(r.lines.some((l) => l.account_id === 1 && l.storage_id === 101 && l.amount === -5000))
  assert.ok(r.lines.some((l) => l.account_id === 1 && l.storage_id === 102 && l.amount === 5000))
})

test('transfer with A/B name: 不凍結資金/現金 means main at 現金', () => {
  const delta = { accounts: {}, storages: { 101: -3000, 102: 3000 } }
  const r = buildLines(parsed('', '#「郵局」轉入「不凍結資金/現金」3000元'), delta, refs)
  assert.equal(r.usedSolver, false)
  assert.ok(r.lines.some((l) => l.account_id === 1 && l.storage_id === 102 && l.amount === 3000))
})

test('group fund donation physically in 現金: solver picks matching storage', () => {
  const delta = { accounts: { 5: 1000 }, storages: { 102: 1000 } }
  const lines = solveLines(delta, refs, { storage: null })
  assert.deepEqual(lines, [{ account_id: 5, storage_id: 102, amount: 1000, label: '小組專款（廚房）' }])
  assert.equal(checkLines(lines, delta).ok, true)
})

test('group fund donation into default storage uses default', () => {
  const delta = { accounts: { 5: 1000 }, storages: { 103: 1000 } }
  const lines = solveLines(delta, refs, { storage: null })
  assert.deepEqual(lines, [{ account_id: 5, storage_id: 103, amount: 1000, label: '小組專款（廚房）' }])
})

test('waived with non-zero delta: waived flag plus warn', () => {
  const r = buildLines(parsed('200', '#無須支付'), { accounts: { 1: -200 }, storages: { 101: -200 } }, refs)
  assert.deepEqual(r.lines, [])
  assert.equal(r.waived, true)
  assert.ok(r.warn)
  const r2 = buildLines(parsed('200', '#無須支付'), { accounts: {}, storages: {} }, refs)
  assert.equal(r2.waived, true)
  assert.equal(r2.warn, undefined)
})

test('candidateLines: amounts and transfers without snapshot check; unresolved flagged', () => {
  const c = candidateLines(parsed('1000\n+11000（會計專款）', '#匯入'), refs)
  assert.equal(c.unresolved, false)
  assert.deepEqual(c.lines, [
    { account_id: 1, storage_id: 101, amount: 1000, label: null },
    { account_id: 20, storage_id: 101, amount: 11000, label: '特殊專款' },
  ])
  const u = candidateLines(parsed('', '#「郵局」轉入「神秘專款」500元'), refs)
  assert.equal(u.unresolved, true)
  assert.deepEqual(u.lines, [])
})
