import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCsv } from './csv.ts'

test('parseCsv handles BOM, quoted newlines and escaped quotes', () => {
  const text =
    '﻿金流類型,日期,品項說明,憑證,金額,備註,結算,留言與其他備註\r\n' +
    '收入,2024/11/6,奉納,,1000,"#巢穴共同體成員奉納\n#林承翰 #現金 #存放現金袋",,\r\n' +
    '支出,2024/11/7,"買 ""菜""",,-50,,,'
  const rows = parseCsv(text)
  assert.equal(rows.length, 3)
  assert.equal(rows[0][0], '金流類型')
  assert.equal(rows[1][5], '#巢穴共同體成員奉納\n#林承翰 #現金 #存放現金袋')
  assert.equal(rows[2][2], '買 "菜"')
  assert.equal(rows[2].length, 8)
})
