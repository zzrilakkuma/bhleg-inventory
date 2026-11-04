import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { RawRow } from './normalize.ts'
import { planImport, type PlanRefs } from './plan.ts'

export const refs: PlanRefs = {
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
    { id: 20, name: '特殊專款', kind: 'special', default_storage_id: 101 },
  ],
  members: [
    '林承翰', '阿曦夫', 'Ruby', '余昱霖', 'Jack', '嚴昕', 'Ryan', '林承豪', 'June', '陳臻', 'Barney', 'Steven', 'Lucy', 'Bobo', 'Eason',
  ].map((nickname, i) => ({ id: i + 1, nickname, real_name: null as string | null })).concat([{ id: 50, nickname: 'Asher', real_name: '艾希爾' }]),
  handlers: [{ id: 1, name: '艾摩爾' }],
  advancers: [{ id: 1, name: '信用卡' }, { id: 2, name: '中央蘭室' }],
  tags: ['巢穴', '共營空間', '經常性基本開銷', '固定聚會成本', '水費', '會計費', '電費', '共同債務'].map((name, i) => ({ id: i + 1, name })),
}

// 總表前 20 列（列 2–21），字串原樣複製自 CSV。
const FIRST20: RawRow[] = [
  {"row":2,"kind":"初始金額","date":"2024/11/05","title":"***初始金額***","voucher":"*** ***","amountCell":"46","note":"#帳戶初始金額","snapshotCell":"不凍結零用金：46\n緊急應變備用金：0\n共存前瞻預算：0\n————————\n郵局：46\n現金：0\n小結：46","comment":""},
  {"row":3,"kind":"","date":"","title":"","voucher":"","amountCell":"十一月份","note":"","snapshotCell":"","comment":""},
  {"row":4,"kind":"收入","date":"2024/11/6","title":"巢穴人 林承翰 奉納","voucher":"#已回填每月奉納紀錄\n#於巢穴由艾摩爾經手","amountCell":"1500","note":"#巢穴共同體成員奉納\n#林承翰 #現金 #存放現金袋","snapshotCell":"不凍結零用金：1546\n緊急應變備用金：0\n共存前瞻預算：0\n————————\n郵局：46\n現金：1500\n小結：1546","comment":""},
  {"row":5,"kind":"收入","date":"2024/11/6","title":"巢穴人 阿曦夫（賴冠宇） 奉納","voucher":"#已回填每月奉納紀錄\n#匯款帳號末五碼83809","amountCell":"1500","note":"#巢穴共同體成員奉納\n#阿曦夫 #匯入 #存放郵局","snapshotCell":"不凍結零用金：3046\n緊急應變備用金：0\n共存前瞻預算：0\n————————\n郵局：1546\n現金：1500\n小結：3046","comment":"沒事的 大家一起努力 希望能幫上一點小忙 辛苦了🫶✨"},
  {"row":6,"kind":"收入","date":"2024/11/7","title":"巢穴人 Ruby（洪瑞綺） 奉納","voucher":"#已回填每月奉納紀錄\n#匯款帳號末五碼73465","amountCell":"600","note":"#巢穴共同體成員奉納\n#Ruby #匯入 #存放郵局","snapshotCell":"不凍結零用金：3646\n緊急應變備用金：0\n共存前瞻預算：0\n————————\n郵局：2146\n現金：1500\n小結：3646","comment":"上個月收入比較少QQ 湊個整數66大順😀"},
  {"row":7,"kind":"收入","date":"2024/11/8","title":"巢穴人 余昱霖 奉納","voucher":"#已回填每月奉納紀錄\n#匯款帳號末五碼00960","amountCell":"1500","note":"#巢穴共同體成員奉納\n#余昱霖 #匯入 #存放郵局","snapshotCell":"不凍結零用金：5146\n緊急應變備用金：0\n共存前瞻預算：0\n————————\n郵局：3646\n現金：1500\n小結：5146","comment":"期待聚餐💞"},
  {"row":8,"kind":"收入","date":"2024/11/9","title":"巢穴眾 Jack（官大翔） 奉納","voucher":"#已回填每月奉納紀錄\n#匯款帳號末五碼27150","amountCell":"1500","note":"#巢穴共同體成員奉納\n#Jack #匯入 #存放郵局","snapshotCell":"不凍結零用金：6646\n緊急應變備用金：0\n共存前瞻預算：0\n————————\n郵局：5146\n現金：1500\n小結：6646","comment":"哈庫奈馬塔塔"},
  {"row":9,"kind":"收入","date":"2024/11/9","title":"巢穴人 嚴昕 奉納","voucher":"#已回填每月奉納紀錄\n#匯款帳號末五碼10324","amountCell":"1500","note":"#巢穴共同體成員奉納\n#嚴昕 #匯入 #存放郵局","snapshotCell":"不凍結零用金：8146\n緊急應變備用金：0\n共存前瞻預算：0\n————————\n郵局：6646\n現金：1500\n小結：8146","comment":""},
  {"row":10,"kind":"收入","date":"2024/11/11","title":"巢穴眾 Ryan（陳志翰） 奉納","voucher":"#已回填每月奉納紀錄\n#於巢穴由艾摩爾經手","amountCell":"1500","note":"#巢穴共同體成員奉納\n#Ryan #現金 #存放現金袋","snapshotCell":"不凍結零用金：9646\n緊急應變備用金：0\n共存前瞻預算：0\n————————\n郵局：6646\n現金：3000\n小結：9646","comment":""},
  {"row":11,"kind":"收入","date":"2024/11/12","title":"巢穴人 林承豪 奉納","voucher":"#已回填每月奉納紀錄\n#匯款帳號末五碼74189","amountCell":"1500","note":"#巢穴共同體成員奉納\n#林承豪 #匯入 #存放郵局","snapshotCell":"不凍結零用金：11146\n緊急應變備用金：0\n共存前瞻預算：0\n————————\n郵局：8146\n現金：3000\n小結：11146","comment":""},
  {"row":12,"kind":"收入","date":"2024/11/12","title":"巢穴眾 June（王慧君） 奉納","voucher":"#已回填每月奉納紀錄\n#匯款帳號末五碼61600","amountCell":"2000","note":"#巢穴共同體成員奉納\n#June #匯入 #存放郵局","snapshotCell":"不凍結零用金：13146\n緊急應變備用金：0\n共存前瞻預算：0\n————————\n郵局：10146\n現金：3000\n小結：13146","comment":"#現金改匯款\n原本填了一單現場繳但臨時改為匯款：）"},
  {"row":13,"kind":"收入","date":"2024/11/12","title":"巢穴眾 陳臻 奉納","voucher":"#已回填每月奉納紀錄\n#匯款帳號末五碼49755","amountCell":"1500","note":"#巢穴共同體成員奉納\n#陳臻 #匯入 #存放郵局","snapshotCell":"不凍結零用金：14646\n緊急應變備用金：0\n共存前瞻預算：0\n————————\n郵局：11646\n現金：3000\n小結：14646","comment":""},
  {"row":14,"kind":"收入","date":"2024/11/13","title":"巢穴人 Barney（黃嵩淵） 奉納","voucher":"#已回填每月奉納紀錄\n#匯款帳號末五碼60399","amountCell":"1000\n+11000（會計專款）","note":"#巢穴共同體成員奉納\n#Barney #匯入 #存放郵局 \n#特殊專款用於支付會計事務所債務","snapshotCell":"不凍結零用金：15646\n緊急應變備用金：0\n共存前瞻預算：0\n特殊專款：11000\n————————\n郵局：23646\n現金：3000\n小結：26646","comment":"#指定11000元為特殊專款，用於償還會計師事務所。\n今天很可惜不克參加，大家下次見！"},
  {"row":15,"kind":"收入","date":"2024/11/13","title":"巢穴眾 Steven（趙哲儒） 奉納","voucher":"#已回填每月奉納紀錄\n#於巢穴由艾摩爾經手","amountCell":"1000","note":"#巢穴共同體成員奉納\n#Steven #現金 #存放現金袋","snapshotCell":"不凍結零用金：16646\n緊急應變備用金：0\n共存前瞻預算：0\n特殊專款：11000\n————————\n郵局：23646\n現金：4000\n小結：27646","comment":""},
  {"row":16,"kind":"收入","date":"2024/11/13","title":"巢穴眾 Lucy（劉怡萱） 奉納","voucher":"#已回填每月奉納紀錄\n#於巢穴由艾摩爾經手","amountCell":"3000","note":"#巢穴共同體成員奉納\n#Lucy #現金 #存放現金袋","snapshotCell":"不凍結零用金：19646\n緊急應變備用金：0\n共存前瞻預算：0\n特殊專款：11000\n————————\n郵局：23646\n現金：7000\n小結：30646","comment":""},
  {"row":17,"kind":"支出","date":"2024/11/13","title":"【大潤發】\n11月固定聚會食材成本","voucher":"#電子發票證明聯\nGH-24935707","amountCell":"-1153","note":"#巢穴共同體經常性基本開銷\n#巢穴 #11月 #固定聚會成本 \n#艾摩爾信用卡預先支付 #現金袋支付","snapshotCell":"不凍結零用金：18493\n緊急應變備用金：0\n共存前瞻預算：0\n特殊專款：11000\n————————\n郵局：23646\n現金：5847\n小結：29493","comment":""},
  {"row":18,"kind":"支出","date":"2024/11/14","title":"【誠正聯合會計師事務所】\n弱冠股份有限公司 部分會計費","voucher":"#特殊專款\n#匯款帳號末五碼10983","amountCell":"-11000\n-12（手續費）","note":"#弱冠股份有限公司會計費開銷\n#特殊專款用於支付會計事務所債務\n#巢穴 #共營公司 #會計費\n#Barney #匯出 #郵局支出","snapshotCell":"不凍結零用金：18481\n緊急應變備用金：0\n共存前瞻預算：0\n特殊專款：0\n————————\n郵局：12634\n現金：5847\n小結：18481","comment":""},
  {"row":19,"kind":"支出","date":"2024/11/14","title":"【臺北自來水事業處】\n巢穴 10月份 水費","voucher":"#國營企業繳費通知單","amountCell":"-1082","note":"#巢穴共同體經常性基本開銷\n#巢穴 #共營空間 #水費\n#現金袋支付","snapshotCell":"不凍結零用金：17399\n緊急應變備用金：0\n共存前瞻預算：0\n特殊專款：0\n————————\n郵局：12634\n現金：4765\n小結：17399","comment":""},
  {"row":20,"kind":"收入","date":"2024/11/13","title":"巢穴人 陳震宇 11月聚餐成本分攤","voucher":"#非計畫參與者聚會成本分攤\n#於巢穴由艾摩爾經手","amountCell":"100","note":"#非計畫參與者聚會成本分攤\n#陳震宇 #現金 #存放現金袋","snapshotCell":"不凍結零用金：17499\n緊急應變備用金：0\n共存前瞻預算：0\n特殊專款：0\n————————\n郵局：12634\n現金：4865\n小結：17499","comment":""},
  {"row":21,"kind":"收入","date":"2024/11/14","title":"巢穴人 Bobo（黃柏瀚） 奉納","voucher":"#已回填每月奉納紀錄\n#匯款帳號末五碼41068","amountCell":"1500","note":"#巢穴共同體成員奉納\n#Bobo #匯入 #存放郵局 ","snapshotCell":"不凍結零用金：18999\n緊急應變備用金：0\n共存前瞻預算：0\n特殊專款：0\n————————\n郵局：14134\n現金：4865\n小結：18999","comment":"可不可以不要用奉納這個詞啊，有點造王或造神的感覺"},
]

const blank: RawRow = { row: 0, kind: '', date: '', title: '', voucher: '', amountCell: '', note: '', snapshotCell: '', comment: '' }
const mk = (o: Partial<RawRow>): RawRow => ({ ...blank, ...o })
const snap = (o: Record<string, number>) => {
  const acc = ['不凍結零用金', '緊急應變備用金', '共存前瞻預算', '小組專款（沙龍）', '小組專款（廚房）', '特殊專款']
  const a = Object.entries(o).filter(([k]) => acc.includes(k) || /專款/.test(k))
  const s = Object.entries(o).filter(([k]) => !(acc.includes(k) || /專款/.test(k)))
  const total = a.reduce((x, [, v]) => x + v, 0)
  return [...a.map(([k, v]) => `${k}：${v}`), '————————', ...s.map(([k, v]) => `${k}：${v}`), `小結：${total}`].join('\n')
}
const opening = (o: Record<string, number>, amount = '0') =>
  mk({ row: 2, kind: '初始金額', date: '2024/11/05', title: '***初始金額***', amountCell: amount, note: '#帳戶初始金額', snapshotCell: snap(o) })
const sumLines = (ls: { amount: number }[]) => ls.reduce((s, l) => s + l.amount, 0)

test('first 20 rows: 19 txs, no mismatches, opening 46, Barney two lines', () => {
  const p = planImport(FIRST20, refs)
  assert.equal(p.txs.length, 19)
  assert.deepEqual(p.mismatches, [])
  assert.deepEqual(p.missingRefs, [])
  const first = p.txs[0]
  assert.equal(first.type, 'opening')
  assert.equal(first.amount, 46)
  assert.equal(sumLines(first.lines), 46)
  const barney = p.txs.find((t) => t.importRow === 14)!
  assert.equal(barney.type, 'donation')
  assert.equal(barney.lines.length, 2)
  assert.equal(barney.amount, 12000)
  assert.ok(barney.lines.some((l) => l.account_id === 20 && l.amount === 11000))
})

test('first 20 rows: seq, monotonic occurredOn, statedOn', () => {
  const p = planImport(FIRST20, refs)
  assert.ok(p.txs.every((t) => t.seq === t.importRow * 10))
  for (let i = 1; i < p.txs.length; i++) assert.ok(p.txs[i].occurredOn >= p.txs[i - 1].occurredOn)
  const r20 = p.txs.find((t) => t.importRow === 20)!
  assert.equal(r20.statedOn, '2024-11-13')
  assert.equal(r20.occurredOn, '2024-11-14')
  assert.equal(r20.incomeSource, 'event')
  assert.equal(r20.sub, undefined)
})

test('first 20 rows: donation sub rows', () => {
  const p = planImport(FIRST20, refs)
  const r4 = p.txs.find((t) => t.importRow === 4)!
  assert.deepEqual(r4.sub, {
    table: 'fund_donations',
    row: { member_id: 1, payer_member_id: null, payment_method: 'cash', last5: null, handler_id: 1, months: ['2024-11'], message: null },
  })
  const r5 = p.txs.find((t) => t.importRow === 5)!
  assert.equal(r5.sub!.row.payment_method, 'transfer')
  assert.equal(r5.sub!.row.last5, '83809')
  assert.equal(r5.sub!.row.member_id, 2)
  assert.equal(r5.sub!.row.handler_id, null)
  assert.match(String(r5.sub!.row.message), /大家一起努力/)
})

test('first 20 rows: expenses (advancer claimed, solver for fee row)', () => {
  const p = planImport(FIRST20, refs)
  const r17 = p.txs.find((t) => t.importRow === 17)!
  assert.equal(r17.type, 'expense')
  assert.equal(r17.amount, -1153)
  assert.equal(r17.offLedger, false)
  assert.deepEqual(r17.sub, {
    table: 'fund_expenses',
    row: {
      vendor: '大潤發', description: '11月固定聚會食材成本', voucher_no: 'GH-24935707',
      tags: ['經常性基本開銷', '巢穴', '固定聚會成本'], advancer_id: 1, claim_status: 'claimed',
    },
  })
  assert.deepEqual(r17.lines, [{ account_id: 1, storage_id: 102, amount: -1153, label: null }])
  const r18 = p.txs.find((t) => t.importRow === 18)!
  assert.equal(r18.amount, -11012)
  assert.equal(r18.sub!.row.voucher_no, '10983')
  assert.equal(r18.sub!.row.claim_status, 'none')
  assert.ok(r18.lines.some((l) => l.account_id === 20 && l.storage_id === 101 && l.amount === -11000))
  assert.ok(r18.lines.some((l) => l.account_id === 1 && l.storage_id === 101 && l.amount === -12))
})

const settlementNote = [
  '#不凍結零用金剩餘：2000*30%=600', '#整數計算為600元',
  '#不凍結零用金300元以「緊急應變備用金」凍存', '#不凍結零用金300元以「共存前瞻預算」凍存', '',
  '#不凍結零用金300元用以償還（12元手續費）', '巢穴人嚴昕所提供之「巢穴緊急紓困借款」',
  '#不凍結零用金300元用以償還', '巢穴人Ruby所提供之「巢穴緊急紓困借款」', '',
  '嚴昕借款 剩餘13400元 尚待償還', 'Ruby借款 剩餘13400元 尚待償還',
].join('\n')

test('settlement: repayments extracted first, solver freeze lines, settlement sub, preLoans', () => {
  const p = planImport([
    opening({ 不凍結零用金: 2000, 緊急應變備用金: 0, 共存前瞻預算: 0, 郵局: 2000 }, '2000'),
    mk({
      row: 3, kind: '結算', date: '2026/11/3\n（延後結算）', title: '***10月結算***', voucher: '#郵局帳戶\n#現金袋',
      amountCell: '***10月結算***', note: settlementNote,
      snapshotCell: snap({ 不凍結零用金: 788, 緊急應變備用金: 300, 共存前瞻預算: 300, 郵局: 1388 }),
    }),
  ], refs)
  assert.deepEqual(p.mismatches, [])
  assert.deepEqual(p.txs.map((t) => [t.type, t.importRow, t.seq, t.amount]), [
    ['opening', 2, 20, 2000], ['repayment', -3, 30, -312], ['repayment', -31, 30, -300], ['settlement', 3, 31, 0],
  ])
  assert.equal(new Set(p.txs.map((t) => t.importRow)).size, p.txs.length, 'import_row unique')
  const [, r1, r2, st] = p.txs
  assert.deepEqual(r1.lines, [{ account_id: 1, storage_id: 101, amount: -312, label: null }])
  assert.deepEqual(r1.sub, { table: 'fund_repayments', row: { loan_id: null, amount: 300, fee: 12, loan_ref: { pre_loan: '嚴昕' } } })
  assert.equal(r2.sub!.row.fee, 0)
  assert.match(r1.title, /償還 嚴昕/)
  assert.equal(sumLines(st.lines), 0)
  assert.equal(st.lines.length, 3)
  assert.deepEqual(st.sub, {
    table: 'fund_settlements',
    row: {
      month: '2026-10', period_no: 1, actual_post: null, actual_cash: null, system_post: 1388, system_cash: null,
      freeze_base: 1388, frozen_reserve: 300, frozen_future: 300, zero_reason: null, late_days: 14,
    },
  })
  assert.deepEqual(p.preLoans, [
    { lender: '嚴昕', principal: 13700, started_on: '2024-11-01' },
    { lender: 'Ruby', principal: 13700, started_on: '2024-11-01' },
  ])
})

test('settlement: 12月結算 in January is previous year; zero freeze reasons; period_no counts', () => {
  const s = (row: number, date: string, title: string, note: string) =>
    mk({ row, kind: '結算', date, title, amountCell: title, note, snapshotCell: snap({ 不凍結零用金: 100, 緊急應變備用金: 0, 共存前瞻預算: 0, 郵局: 100 }) })
  const p = planImport([
    opening({ 不凍結零用金: 100, 緊急應變備用金: 0, 共存前瞻預算: 0, 郵局: 100 }, '100'),
    s(3, '2026/1/7\n（延後結算）', '***12月結算***', '#不凍結資金餘額不足'),
    s(4, '2026/1/9', '***12月結算***', '#因餘款不足'),
  ], refs)
  const [a, b] = p.txs.filter((t) => t.type === 'settlement').map((t) => t.sub!.row)
  assert.equal(a.month, '2025-12')
  assert.equal(a.period_no, 1)
  assert.equal(a.zero_reason, '匯入：原因未註明')
  assert.equal(a.late_days, 18)
  assert.equal(b.period_no, 2)
  assert.equal(b.zero_reason, '因餘款不足')
})

test('reset: negates every balance after the no-checkpoint rows; opening of phase 2 starts from zero', () => {
  const p = planImport([
    opening({ 不凍結零用金: 1500, 緊急應變備用金: 0, 共存前瞻預算: 0, 郵局: 1000, 現金: 500 }, '1500'),
    mk({ row: 3, kind: '歸零清算', date: '2026/1/15\n（歸零清算）', title: '***公基金計畫 一階實踐 14個月總結算***', amountCell: '歸零清算', snapshotCell: '122200元' }),
    mk({ row: 4, kind: '支出', date: '2026/1/16', title: '【臺北自來水事業處】\n巢穴 12月份 水費', amountCell: '-100', note: '#現金袋支付', snapshotCell: '#已繳納\n剩餘：121737元\n' }),
    mk({ row: 5 }),
    mk({ row: 6, kind: '二階實踐\n初始金額', date: '2026/1/15', title: '***歸零重整 二階實踐 開始***', amountCell: '***一階歸零***', snapshotCell: snap({ 不凍結零用金: 0, 郵局: 0, 現金: 0 }) }),
    mk({ row: 7, kind: '收入', date: '2026/1/20', title: '巢穴人 嚴昕 奉納', amountCell: '1000', note: '#巢穴共同體成員奉納\n#嚴昕 #匯入 #存放郵局', snapshotCell: snap({ 不凍結零用金: 1000, 郵局: 1000, 現金: 0 }) }),
  ], refs)
  assert.deepEqual(p.mismatches, [])
  assert.deepEqual(p.txs.map((t) => [t.importRow, t.type, t.seq]), [
    [2, 'opening', 20], [4, 'expense', 40], [3, 'reset', 55], [6, 'opening', 60], [7, 'donation', 70],
  ])
  const reset = p.txs[2]
  assert.deepEqual(reset.lines, [
    { account_id: 1, storage_id: 101, amount: -1000, label: null },
    { account_id: 1, storage_id: 102, amount: -400, label: null },
  ])
  assert.equal(reset.amount, -1400)
  assert.equal(reset.occurredOn, '2026-01-15') // zone date (row 4's own 1/16 stays in statedOn)
  assert.deepEqual(p.txs[3].lines, [])
  assert.ok(p.warns.some((w) => /reset row 3: rows 4 had no checkpoint/.test(w)))
})

test('inconsistent snapshot: candidate lines, verified cumulatively at the next consistent snapshot', () => {
  const don = (row: number, s: Record<string, number>) =>
    mk({ row, kind: '收入', date: '2024/11/6', title: '巢穴人 嚴昕 奉納', amountCell: '100', note: '#巢穴共同體成員奉納\n#嚴昕 #現金 #存放現金袋', snapshotCell: snap(s) })
  const p = planImport([
    opening({ 不凍結零用金: 1000, 郵局: 1000, 現金: 0 }, '1000'),
    don(3, { 不凍結零用金: 1100, 郵局: 1000, 現金: 200 }),
    don(4, { 不凍結零用金: 1200, 郵局: 1000, 現金: 200 }),
  ], refs)
  assert.deepEqual(p.mismatches, [])
  for (const t of p.txs.slice(1)) assert.deepEqual(t.lines, [{ account_id: 1, storage_id: 102, amount: 100, label: null }])
  assert.ok(p.warns.some((w) => /row 3: inconsistent snapshot/.test(w)))
})

test('trailing undated bills after the last snapshot become payables', () => {
  const p = planImport([
    opening({ 不凍結零用金: 46, 郵局: 46 }, '46'),
    mk({ row: 3 }),
    mk({
      row: 4, kind: '支出', date: '2026/11/', title: '【台灣電力公司】\n巢穴 9月份 電費', amountCell: '-22239',
      note: '#巢穴共同體經常性基本開銷\n#「不凍結零用金」支付 #現金袋支付', comment: '11/24 斷電，在此之前必須繳納',
    }),
    mk({ row: 5, kind: '支出', date: '2026/11/', title: '【中華電信股份有限公司】\n巢穴 10月份 電信費', amountCell: '-929', note: '#現金袋支付' }),
  ], refs)
  assert.equal(p.txs.length, 1)
  assert.deepEqual(p.payables, [
    { title: '巢穴 9月份 電費', amount: 22239, due_on: '2026-11-24', vendor: '台灣電力公司' },
    { title: '巢穴 10月份 電信費', amount: 929, due_on: null, vendor: '中華電信股份有限公司' },
  ])
})

test('unknown snapshot names become missingRefs with temporary negative ids', () => {
  const p = planImport([opening({ 不凍結零用金: 46, '特殊專款（廚房）': 0, 郵局: 46, '現金（X）': 0 }, '46')], refs)
  assert.deepEqual(p.missingRefs, [{ kind: 'account', name: '特殊專款（廚房）' }, { kind: 'storage', name: '現金（X）' }])
  assert.ok(p.refs.accounts.find((a) => a.name === '特殊專款（廚房）')!.id < 0)
  assert.ok(p.refs.storages.find((s) => s.name === '現金（X）')!.id < 0)
  assert.deepEqual(p.mismatches, [])
})

test('donation: member aliases (自在林 → 小八), missing member, payer, multi-month wrap', () => {
  const r = { ...refs, members: [...refs.members, { id: 60, nickname: '小八', real_name: '吳佩姍' }] }
  const s0 = { 不凍結零用金: 0, 郵局: 0, 現金: 0 }
  const p = planImport([
    opening(s0),
    mk({ row: 3, kind: '收入', date: '2026/3/27', title: '【自在林】代表 小八（吳佩姍） 奉納\n3月 奉納金', amountCell: '1500', note: '#巢穴共同體成員奉納\n#自在林 #現金 #存放現金袋', snapshotCell: snap({ 不凍結零用金: 1500, 郵局: 0, 現金: 1500 }) }),
    mk({ row: 4, kind: '收入', date: '2026/1/5', title: '巢穴人 Eason（王翊丞） 奉納\n（Asher代繳）\n12月+1月 奉納金', voucher: '#於巢穴由艾摩爾經手', amountCell: '300', note: '#巢穴共同體成員奉納\n#Eason #現金 #存放現金袋', snapshotCell: snap({ 不凍結零用金: 1800, 郵局: 0, 現金: 1800 }) }),
    mk({ row: 5, kind: '收入', date: '2026/1/6', title: '巢穴人 路人 奉納', amountCell: '100', note: '#巢穴共同體成員奉納\n#路人甲 #現金 #存放現金袋', snapshotCell: snap({ 不凍結零用金: 1900, 郵局: 0, 現金: 1900 }) }),
  ], r)
  const [, a, b, c] = p.txs
  assert.equal(a.sub!.row.member_id, 60)
  assert.deepEqual(a.sub!.row.months, ['2026-03'])
  assert.equal(b.sub!.row.payer_member_id, 50)
  assert.deepEqual(b.sub!.row.months, ['2025-12', '2026-01'])
  assert.equal(c.sub!.row.member_id, null)
  assert.deepEqual(p.missingRefs, [{ kind: 'member', name: '路人甲' }])
})

test('expenses: zero-delta advancer is off-ledger unclaimed (claimed tag warns); waived', () => {
  const s = snap({ 不凍結零用金: 1000, 郵局: 1000 })
  const p = planImport([
    opening({ 不凍結零用金: 1000, 郵局: 1000 }, '1000'),
    mk({ row: 3, kind: '支出', date: '2026/3/1', title: '【文新瓦斯行】\n瓦斯', amountCell: '-660', note: '#共享廚房 #瓦斯\n#中央蘭室代墊 #已請款', snapshotCell: s }),
    mk({ row: 4, kind: '支出', date: '2026/3/2', title: '【某店】\n東西', amountCell: '-200', note: '#巢穴 #無須支付', snapshotCell: s }),
  ], refs)
  const [, a, b] = p.txs
  assert.equal(a.offLedger, true)
  assert.deepEqual(a.lines, [])
  assert.equal(a.sub!.row.claim_status, 'unclaimed')
  assert.equal(a.sub!.row.advancer_id, 2)
  assert.ok(p.warns.includes('row 3: claimed tag but zero delta'))
  assert.equal(b.offLedger, true)
  assert.equal(b.sub!.row.claim_status, 'waived')
})

test('loan row and a later repayment matched to the planned loan', () => {
  const p = planImport([
    opening({ 不凍結零用金: 0, 郵局: 0 }),
    mk({
      row: 3, kind: '收入', date: '2026/1/13\n（特別結算）', title: '巢穴人 嚴昕 借款\n***巢穴緊急紓困借款***', voucher: '#已回填每月奉納紀錄\n#匯款帳號末五碼10324',
      amountCell: '20000', note: '#巢穴共同體成員奉納\n#巢穴緊急紓困借款（一階結算與巢穴債務整合）\n#嚴昕 #匯入 #存放郵局\n',
      snapshotCell: snap({ 不凍結零用金: 20000, 郵局: 20000 }),
    }),
    mk({
      row: 4, kind: '支出', date: '2026/1/20', title: '共同體共同債務\n償還巢穴人嚴昕所提供的紓困借貸', amountCell: '-1000\n-12',
      note: '#巢穴 #共同債務 #紓困借貸\n#嚴昕 #匯出 #郵局支出', snapshotCell: snap({ 不凍結零用金: 18988, 郵局: 18988 }),
    }),
  ], refs)
  const [, loan, rep] = p.txs
  assert.equal(loan.type, 'loan')
  assert.deepEqual(loan.sub, {
    table: 'fund_loans',
    row: { lender_name: '嚴昕', lender_member_id: 6, principal: 20000, started_on: '2026-01-13', status: 'open', note: null },
  })
  assert.equal(rep.type, 'repayment')
  assert.deepEqual(rep.sub!.row, { loan_id: null, amount: 1000, fee: 12, loan_ref: { import_row: 3 } })
  assert.deepEqual(p.preLoans, [])
})

test('non-advancer row with an amount but zero snapshot delta warns (row 325 Ruby)', () => {
  const s = snap({ 不凍結零用金: 1000, 郵局: 1000 })
  const p = planImport([
    opening({ 不凍結零用金: 1000, 郵局: 1000 }, '1000'),
    mk({ row: 3, kind: '收入', date: '2025/10/3', title: '巢穴人 Ruby（洪瑞綺） 奉納', amountCell: '1000', note: '#巢穴共同體成員奉納\n#Ruby #匯入 #存放郵局', snapshotCell: s }),
  ], refs)
  assert.deepEqual(p.txs[1].lines, [])
  assert.equal(p.txs[1].offLedger, false)
  assert.ok(p.warns.includes('row 3: amount 1000 but zero snapshot delta: no lines'))
})

test('transfer row without a parseable transfer tag and no checkpoint warns (row 421)', () => {
  const p = planImport([
    opening({ 不凍結零用金: 46, 郵局: 46 }, '46'),
    mk({ row: 3, kind: '轉帳', date: '2026/1/15', title: '【巢穴OG沙龍 專款】\n1月份', voucher: '#', amountCell: '～5000', note: '#巢穴 #OG #力行路40號 #沙龍\n#郵局轉入「巢穴OG沙龍專款」' }),
    opening({ 不凍結零用金: 46, 郵局: 46 }, '0'),
  ].map((r, i) => ({ ...r, row: i + 2 })), refs)
  const t = p.txs.find((x) => x.type === 'transfer')!
  assert.equal(t.amount, 0)
  assert.deepEqual(t.lines, [])
  assert.ok(p.warns.includes('row 3: transfer with no resolvable lines'))
})

test('歸零清算 zone: rows from after the last snapshot to before the opening occur on the reset date', () => {
  const exp = (row: number, date: string, snapshotCell = '') =>
    mk({ row, kind: '支出', date, title: '【某店】\n東西', amountCell: '-10', note: '#現金袋支付', snapshotCell })
  const p = planImport([
    opening({ 不凍結零用金: 1000, 郵局: 0, 現金: 1000 }, '1000'),
    exp(3, '2026/1/13'),
    mk({ row: 4, kind: '歸零清算', date: '2026/1/15\n（歸零清算）', title: '***總結算***', amountCell: '歸零清算', snapshotCell: '122200元' }),
    exp(5, '2026/1/28', '#已繳納\n剩餘：100元\n'),
    exp(6, '2025/7/0\n（延後結算）'),
    mk({ row: 7, kind: '二階實踐\n初始金額', date: '2026/1/15', title: '***二階***', amountCell: '***一階歸零***', snapshotCell: snap({ 不凍結零用金: 0, 郵局: 0, 現金: 0 }) }),
    mk({ row: 8, kind: '收入', date: '2026/1/5', title: '巢穴人 嚴昕 奉納', amountCell: '1000', note: '#巢穴共同體成員奉納\n#嚴昕 #匯入 #存放郵局', snapshotCell: snap({ 不凍結零用金: 1000, 郵局: 1000, 現金: 0 }) }),
  ], refs)
  const on = Object.fromEntries(p.txs.map((t) => [t.importRow, [t.occurredOn, t.statedOn]]))
  assert.deepEqual(on[3], ['2026-01-15', '2026-01-13'])
  assert.deepEqual(on[4], ['2026-01-15', '2026-01-15'])
  assert.deepEqual(on[5], ['2026-01-15', '2026-01-28'])
  assert.deepEqual(on[6], ['2026-01-15', null])
  assert.deepEqual(on[7], ['2026-01-15', '2026-01-15'])
  assert.deepEqual(on[8], ['2026-01-15', '2026-01-05']) // monotonic again after the zone
  assert.deepEqual(p.mismatches, [])
})
