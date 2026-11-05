import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toRawRows, parseDate, parseAmounts, parseSnapshot, parseTags } from './normalize.ts'

test('toRawRows skips header and numbers rows from 2', () => {
  const rows = [
    ['金流類型', '日期', '品項說明', '憑證', '金額', '備註', '結算', '留言與其他備註'],
    ['收入', '2024/11/6', 'a', 'v', '1000', 'n', 's', 'c'],
  ]
  assert.deepEqual(toRawRows(rows), [
    { row: 2, kind: '收入', date: '2024/11/6', title: 'a', voucher: 'v', amountCell: '1000', note: 'n', snapshotCell: 's', comment: 'c' },
  ])
})

test('parseAmounts', () => {
  assert.deepEqual(parseAmounts('1000\n+11000（會計專款）', 1), [
    { amount: 1000, label: null },
    { amount: 11000, label: '會計專款' },
  ])
  assert.deepEqual(parseAmounts('-11000\n-12（手續費）', -1), [
    { amount: -11000, label: null },
    { amount: -12, label: '手續費' },
  ])
  assert.deepEqual(parseAmounts('～5000', 1), [{ amount: 5000, label: null }])
  assert.deepEqual(parseAmounts('1,500', -1), [{ amount: -1500, label: null }])
  assert.deepEqual(parseAmounts('+500', -1), [{ amount: 500, label: null }])
  assert.deepEqual(parseAmounts('·（Kody專款）', 1), [{ amount: 0, label: 'Kody專款' }])
  assert.deepEqual(parseAmounts('+\n300', -1), [{ amount: 300, label: null }])
  assert.deepEqual(parseAmounts('6000\n（Kody手術專款）', 1), [{ amount: 6000, label: 'Kody手術專款' }])
  assert.deepEqual(parseAmounts('5000\n+15000\n（緊急應變備用金）', 1), [
    { amount: 5000, label: null },
    { amount: 15000, label: '緊急應變備用金' },
  ])
  assert.deepEqual(
    parseAmounts(
      '5000\n+10000\n（共同債務專用）\n+2000\n（緊急應變備用金）\n+2000\n（共存前瞻預算）\n+1000\n（蘭室樂團 小組專款）\n+14000\n（印表機碳粉匣專用）',
      1,
    ),
    [
      { amount: 5000, label: null },
      { amount: 10000, label: '共同債務專用' },
      { amount: 2000, label: '緊急應變備用金' },
      { amount: 2000, label: '共存前瞻預算' },
      { amount: 1000, label: '蘭室樂團 小組專款' },
      { amount: 14000, label: '印表機碳粉匣專用' },
    ],
  )
  assert.throws(() => parseAmounts('abc', 1), /abc/)
})

test('parseDate', () => {
  assert.deepEqual(parseDate('2025/04/4\n（延後結算）', '2025-03-31'), {
    occurred: '2025-04-04',
    stated: '2025-04-04',
    note: '延後結算',
  })
  assert.deepEqual(parseDate('2024/11/6', ''), { occurred: '2024-11-06', stated: '2024-11-06', note: null })
  const m = parseDate('2026/11/', '2026-11-03')
  assert.equal(m.occurred, '2026-11-01')
  assert.ok(m.warn)
  const z = parseDate('2026/1/15\n（歸零清算）', '2026-01-01')
  assert.equal(z.occurred, '2026-01-15')
  assert.equal(z.note, '歸零清算')
  // day 0 (rows 417/418 `2025/7/0`) is a missing day, not an invalid ISO date
  const d0 = parseDate('2025/7/0\n（延後結算）', '2026-01-28')
  assert.equal(d0.occurred, '2025-07-01')
  assert.equal(d0.stated, null)
  assert.ok(d0.warn)
  // row 236 typo `20257/4` must not parse as year 0257
  const typo = parseDate('20257/4', '2025-07-03')
  assert.equal(typo.occurred, '2025-07-03')
  assert.equal(typo.stated, null)
  assert.ok(typo.warn)
  const bad = parseDate('', '2026-11-03')
  assert.equal(bad.occurred, '2026-11-03')
  assert.equal(bad.stated, null)
  assert.ok(bad.warn)
})

test('parseSnapshot', () => {
  assert.deepEqual(parseSnapshot('不凍結零用金：1546\n緊急應變備用金：0\n————————\n郵局：46\n現金：1500\n小結：1546'), {
    不凍結零用金: 1546,
    緊急應變備用金: 0,
    郵局: 46,
    現金: 1500,
    小結: 1546,
  })
  assert.equal(parseSnapshot(''), null)
  assert.equal(parseSnapshot('#已繳納\n剩餘：121737元\n'), null)
  assert.deepEqual(parseSnapshot('特殊專款（非人））：0\n現金袋：1,200'), { '特殊專款（非人）': 0, 現金: 1200 })
})

test('parseTags', () => {
  const a = parseTags('#巢穴共同體成員奉納\n#林承翰 #現金 #存放現金袋')
  assert.equal(a.storage, '現金')
  assert.equal(a.member, '林承翰')
  const b = parseTags('#中央蘭室代墊 #已請款')
  assert.equal(b.advancer, '中央蘭室')
  assert.equal(b.claimed, true)
  assert.equal(b.storage, null)
  assert.equal(b.member, null)
  assert.deepEqual(parseTags('#「郵局」轉入「現金袋」5000元').transfers, [{ from: '郵局', to: '現金', amount: 5000 }])
  assert.equal(parseTags('#現金袋支出').storage, '現金')
  assert.equal(parseTags('#郵局支付').storage, '郵局')
  assert.equal(parseTags('#廚房隨喜桶').storage, '現金（廚房）')
  assert.equal(parseTags('#匯入 #存放現金袋').storage, '郵局')
  assert.equal(parseTags('#艾摩爾信用卡預先支付').advancer, '信用卡')
  assert.equal(parseTags('放棄請款').waived, true)
  assert.equal(parseTags('#於巢穴由小明經手 末五碼12345').handler, '小明')
  assert.equal(parseTags('末五碼12345').last5, '12345')
  assert.deepEqual(parseTags('').months, [])
})
