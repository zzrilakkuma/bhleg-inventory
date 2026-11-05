"use client";

import { fmtAmount, type FundAccount, type FundStorage } from '@/lib/fund';
import type { Snapshot } from '@/lib/fund-v2/api';
import { Amount, Card, SectionLabel } from '../../../ui';
import { inputCls, signedDigits, StepNav } from '../shared';

export function SnapshotList({ snap, accounts, storages }: { snap: Snapshot; accounts: FundAccount[]; storages: FundStorage[] }) {
  const accs = accounts.filter((a) => a.active || (snap.accounts[a.id] ?? 0) !== 0);
  const sts = storages.filter((s) => s.active || (snap.storages[s.id] ?? 0) !== 0);
  const row = (k: string, label: string, v: number, strong = false) => (
    <li key={k} className="flex justify-between py-1 gap-3 text-sm">
      <span className={strong ? 'text-white' : 'text-gray-400'}>{label}</span>
      <Amount value={v} size={strong ? 'base' : 'sm'} />
    </li>
  );
  return (
    <ul>
      {accs.map((a) => row(`a${a.id}`, a.name, snap.accounts[a.id] ?? 0, a.kind === 'main'))}
      <li className="border-t border-[#222222] my-1" />
      {sts.map((s) => row(`s${s.id}`, s.name, snap.storages[s.id] ?? 0))}
      <li className="border-t border-[#222222] my-1" />
      {row('total', '小結', snap.total, true)}
    </ul>
  );
}

export default function ReconcileStep({
  systemPost, systemCash, actualPost, actualCash, onPost, onCash, preview, accounts, storages, onBack, onNext,
}: {
  systemPost: number; systemCash: number; actualPost: string; actualCash: string;
  onPost: (v: string) => void; onCash: (v: string) => void;
  preview: Snapshot; accounts: FundAccount[]; storages: FundStorage[]; onBack: () => void; onNext: () => void;
}) {
  const dPost = (Number(actualPost) || 0) - systemPost;
  const dCash = (Number(actualCash) || 0) - systemCash;
  const valid = /^-?\d+$/.test(actualPost) && /^-?\d+$/.test(actualCash);
  const diff = (d: number) => d === 0
    ? <span className="text-xs text-gray-500">相符</span>
    : <span className="text-xs text-yellow-400">差 <span className="tabular-nums">{d > 0 ? '+' : ''}{fmtAmount(d)}</span> → 矯正回歸</span>;
  return (
    <div>
      <p className="text-sm text-gray-400 mb-3">步驟 3／4：核對實際餘額</p>
      <SectionLabel>郵局實際餘額（系統 {fmtAmount(systemPost)}）</SectionLabel>
      <input inputMode="numeric" value={actualPost} onChange={(e) => onPost(signedDigits(e.target.value))} className={inputCls} />
      <div className="mt-1">{diff(dPost)}</div>
      <SectionLabel>現金袋實際餘額（系統 {fmtAmount(systemCash)}）</SectionLabel>
      <input inputMode="numeric" value={actualCash} onChange={(e) => onCash(signedDigits(e.target.value))} className={inputCls} />
      <div className="mt-1">{diff(dCash)}</div>
      <Card className="mt-4">
        <div className="text-xs text-gray-500 mb-2">凍存與矯正後</div>
        <SnapshotList snap={preview} accounts={accounts} storages={storages} />
      </Card>
      <StepNav onBack={onBack} onNext={onNext} disabled={!valid} />
    </div>
  );
}
