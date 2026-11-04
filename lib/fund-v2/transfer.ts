// 記 — 轉帳：純函式（位置清單、寫入組裝、驗證、搬完預覽）。
import { buildTransferTexts } from '../fund.ts';
import type { NewTransaction, NewLine } from '../fund-db.ts';
import type { Refs, Snapshot } from './api.ts';

export interface Slot {
  accountId: number; storageId: number; label: string; balance: number;
  kind: 'main' | 'reserve' | 'group' | 'special';
}

const isPending = (name: string) => /待清償/.test(name);
const isBag = (name: string) => name.startsWith('現金（');

/**
 * 可轉帳的位置。
 * main：郵局、現金各一格，加上餘額≠0 的其他存放（排除待清償、小組現金袋）。
 *   快照沒有 (科目, 存放) 餘額，故 main 的格子餘額 = 該存放總額 − 預設存放在該處的非 main 科目餘額之和（近似）。
 * reserve／group／special：餘額≠0 或 active 者，在其預設存放一格，餘額 = 科目餘額。
 */
export const slotsFrom = (snapshot: Snapshot | null, refs: Pick<Refs, 'accounts' | 'storages'>): Slot[] => {
  const main = refs.accounts.find((a) => a.kind === 'main');
  const others = refs.accounts.filter((a) => a.kind !== 'main');
  const accBal = (id: number) => snapshot?.accounts[id] ?? 0;
  const stBal = (id: number) => snapshot?.storages[id] ?? 0;
  const out: Slot[] = [];
  if (main) {
    for (const s of refs.storages) {
      if (isPending(s.name) || isBag(s.name)) continue;
      const core = s.name === '郵局' || s.name === '現金';
      if (core ? !s.active : stBal(s.id) === 0) continue;
      const share = others.filter((a) => a.default_storage_id === s.id).reduce((t, a) => t + accBal(a.id), 0);
      out.push({ accountId: main.id, storageId: s.id, label: s.name, balance: stBal(s.id) - share, kind: 'main' });
    }
  }
  for (const a of others) {
    if (isPending(a.name) || a.default_storage_id == null) continue;
    const dst = refs.storages.find((s) => s.id === a.default_storage_id);
    if (dst && isPending(dst.name)) continue;
    if (accBal(a.id) === 0 && !a.active) continue;
    out.push({ accountId: a.id, storageId: a.default_storage_id, label: a.name, balance: accBal(a.id), kind: a.kind as Slot['kind'] });
  }
  return out;
};

export const buildTransferWrite = (
  from: Slot, to: Slot, amount: number, date: string, decisionRef?: string, seq?: number,
): { tx: NewTransaction; lines: NewLine[] } => {
  const t = buildTransferTexts({ fromName: from.label, toName: to.label, amount });
  return {
    tx: {
      type: 'transfer', occurred_on: date, amount: 0, seq, title: t.title, voucher: t.voucher, note: t.note,
      decision_ref: decisionRef?.trim() ? decisionRef.trim() : null,
    },
    lines: [
      { account_id: from.accountId, storage_id: from.storageId, amount: -amount },
      { account_id: to.accountId, storage_id: to.storageId, amount },
    ],
  };
};

export const validateTransfer = (from: Slot, to: Slot, amount: number, decisionRef: string): string | null => {
  if (!(amount > 0)) return '金額必須大於 0';
  if (from.accountId === to.accountId && from.storageId === to.storageId) return '來源與目的相同';
  if (amount > from.balance) return '來源餘額不足';
  if (from.kind === 'reserve' && !decisionRef.trim()) return '從緊急應變／前瞻搬出需填依據（第幾次會議）';
  return null;
};

/** 搬完之後：受影響的存放、非 main 科目；main 有變動時最後多一列。 */
export const afterTransfer = (
  snapshot: Snapshot | null, write: { lines: NewLine[] }, refs: Pick<Refs, 'accounts' | 'storages'>,
): { label: string; before: number; after: number }[] => {
  const main = refs.accounts.find((a) => a.kind === 'main');
  const stDelta = new Map<number, number>();
  const accDelta = new Map<number, number>();
  for (const l of write.lines) {
    stDelta.set(l.storage_id, (stDelta.get(l.storage_id) ?? 0) + l.amount);
    accDelta.set(l.account_id, (accDelta.get(l.account_id) ?? 0) + l.amount);
  }
  const out: { label: string; before: number; after: number }[] = [];
  for (const [id, d] of stDelta) {
    const b = snapshot?.storages[id] ?? 0;
    out.push({ label: refs.storages.find((s) => s.id === id)?.name ?? String(id), before: b, after: b + d });
  }
  for (const [id, d] of accDelta) {
    if (id === main?.id) continue;
    const b = snapshot?.accounts[id] ?? 0;
    out.push({ label: refs.accounts.find((a) => a.id === id)?.name ?? String(id), before: b, after: b + d });
  }
  const md = main ? accDelta.get(main.id) ?? 0 : 0;
  if (main && md !== 0) out.push({ label: main.name, before: snapshot?.main ?? 0, after: (snapshot?.main ?? 0) + md });
  return out;
};
