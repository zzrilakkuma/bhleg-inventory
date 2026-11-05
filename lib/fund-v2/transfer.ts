// 記 — 轉帳：純函式（位置清單、寫入組裝、驗證、搬完預覽）。
import { buildTransferTexts } from '../fund.ts';
import type { NewTransaction, NewLine } from '../fund-db.ts';
import type { Refs, Snapshot } from './api.ts';

export interface Slot {
  kind: 'storage' | 'account'; id: number; label: string; balance: number;
  accountKind?: 'main' | 'reserve' | 'group' | 'special';
}

const isPending = (name: string) => /待清償/.test(name);
const isBag = (name: string) => name.startsWith('現金（');

/**
 * 可轉帳的 chip，兩種：
 * - 存放：郵局、現金、餘額≠0 的小組現金袋（不含待清償）；餘額 = 快照的存放總額。
 * - 科目：active 的 reserve／group／special（加上餘額≠0 的停用者）；餘額 = 快照的科目總額。
 * （快照沒有 (科目, 存放) 逐格餘額，故不以那個粒度建模。）
 */
export const slotsFrom = (snapshot: Snapshot | null, refs: Pick<Refs, 'accounts' | 'storages'>): Slot[] => {
  const out: Slot[] = [];
  for (const s of refs.storages) {
    if (isPending(s.name)) continue;
    const bal = snapshot?.storages[s.id] ?? 0;
    const core = s.name === '郵局' || s.name === '現金';
    if (core ? !s.active : !(isBag(s.name) && bal !== 0)) continue;
    out.push({ kind: 'storage', id: s.id, label: s.name, balance: bal });
  }
  for (const a of refs.accounts) {
    if (a.kind === 'main' || isPending(a.name)) continue;
    const bal = snapshot?.accounts[a.id] ?? 0;
    if (!a.active && bal === 0) continue;
    out.push({ kind: 'account', id: a.id, label: a.name, balance: bal, accountKind: a.kind });
  }
  return out;
};

const sameSlot = (a: Slot, b: Slot) => a.kind === b.kind && a.id === b.id;

export const buildTransferWrite = (
  from: Slot, to: Slot, amount: number, date: string, refs: Pick<Refs, 'accounts' | 'storages'>,
  decisionRef?: string, seq?: number,
): { tx: NewTransaction; lines: NewLine[] } => {
  const main = refs.accounts.find((a) => a.kind === 'main');
  if (!main) throw new Error('找不到主科目');
  const postId = refs.storages.find((s) => s.name === '郵局')?.id;
  const defSt = (accId: number) => {
    const d = refs.accounts.find((a) => a.id === accId)?.default_storage_id ?? postId;
    if (d == null) throw new Error('找不到存放位置');
    return d;
  };
  let a: NewLine; let b: NewLine;
  if (from.kind === 'storage' && to.kind === 'storage') {
    a = { account_id: main.id, storage_id: from.id, amount: -amount };
    b = { account_id: main.id, storage_id: to.id, amount };
  } else if (from.kind === 'account' && to.kind === 'account') {
    a = { account_id: from.id, storage_id: defSt(from.id), amount: -amount };
    b = { account_id: to.id, storage_id: defSt(to.id), amount };
  } else if (from.kind === 'storage') {
    a = { account_id: main.id, storage_id: from.id, amount: -amount };
    b = { account_id: to.id, storage_id: from.id, amount };
  } else {
    a = { account_id: from.id, storage_id: to.id, amount: -amount };
    b = { account_id: main.id, storage_id: to.id, amount };
  }
  const t = buildTransferTexts({ fromName: from.label, toName: to.label, amount });
  return {
    tx: {
      type: 'transfer', occurred_on: date, amount: 0, seq, title: t.title, voucher: t.voucher, note: t.note,
      decision_ref: decisionRef?.trim() ? decisionRef.trim() : null,
    },
    lines: [a, b],
  };
};

export const validateTransfer = (
  from: Slot, to: Slot, amount: number, decisionRef: string, mainBalance = Infinity,
): string | null => {
  if (!(amount > 0)) return '金額必須大於 0';
  if (sameSlot(from, to)) return '來源與目的相同';
  if (amount > from.balance) return '來源餘額不足';
  if (from.kind === 'storage' && to.kind === 'account' && amount > mainBalance) return '不凍結零用金不足';
  if (from.kind === 'account' && from.accountKind === 'reserve' && !decisionRef.trim()) {
    return '從緊急應變／前瞻搬出需填依據（第幾次會議）';
  }
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
