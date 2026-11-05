"use client";

import { useState } from 'react';
import type { Refs, Snapshot } from '@/lib/fund-v2/api';
import { Amount, Card } from '../ui';

export default function BalanceCard({ snap, refs }: { snap: Snapshot; refs: Refs | null }) {
  const [open, setOpen] = useState(false);
  const accounts = refs?.accounts ?? [];
  const storages = refs?.storages ?? [];
  const reserve = accounts.filter((a) => a.kind === 'reserve').reduce((s, a) => s + (snap.accounts[a.id] ?? 0), 0);
  const specials = accounts.filter((a) => (a.kind === 'group' || a.kind === 'special') && (snap.accounts[a.id] ?? 0) !== 0);
  const stos = storages.filter((s) => (snap.storages[s.id] ?? 0) !== 0);
  const line = (label: string, v: number) => (
    <div className="flex justify-between items-baseline gap-3"><span className="text-xs text-gray-500">{label}</span><Amount value={v} size="sm" /></div>
  );

  return (
    <Card>
      <div className="md:grid md:grid-cols-2 md:gap-6">
        <div>
          <div className="text-xs text-gray-500">不凍結零用金</div>
          <div className="mt-1"><Amount value={snap.main} size="xl" /></div>
        </div>
        <div className="mt-3 md:mt-0 space-y-1">
          {line('小結', snap.total)}
          {line('凍存（緊急＋前瞻）', reserve)}
          <div className="hidden md:block space-y-1">
            {storages.filter((s) => s.name.includes('郵局') || s.name.includes('現金')).map((s) => (
              <div key={s.id}>{line(s.name, snap.storages[s.id] ?? 0)}</div>
            ))}
          </div>
        </div>
      </div>
      <button type="button" onClick={() => setOpen(!open)} className="mt-3 text-xs text-gray-400 hover:text-white py-1">
        {open ? '▾ 收合' : '▸ 展開：各專款、存放位置'}
      </button>
      {open && (
        <div className="mt-2 grid gap-x-6 gap-y-1 md:grid-cols-2 border-t border-[#333333] pt-3">
          <div className="space-y-1">
            {specials.length === 0 && <div className="text-xs text-gray-600">無專款餘額</div>}
            {specials.map((a) => <div key={a.id}>{line(a.name, snap.accounts[a.id] ?? 0)}</div>)}
          </div>
          <div className="space-y-1">
            {stos.map((s) => <div key={s.id}>{line(s.name, snap.storages[s.id] ?? 0)}</div>)}
          </div>
        </div>
      )}
    </Card>
  );
}
