// 同一天的下一個 seq（同日最大 seq + 1，無則 1）。
export const nextSeq = (existing: { occurred_on: string; seq: number }[], date: string): number =>
  existing.reduce((max, r) => (r.occurred_on === date && r.seq > max ? r.seq : max), 0) + 1;
