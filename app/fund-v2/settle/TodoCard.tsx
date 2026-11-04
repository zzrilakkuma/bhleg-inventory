"use client";

import Link from 'next/link';
import toast from 'react-hot-toast';
import { fmtAmount } from '@/lib/fund';
import { Amount, Card } from '../ui';
import type { TodoItem } from '@/lib/fund-v2/todo';

export default function TodoCard({ items, isAccountant, copyText }: {
  items: TodoItem[]; isAccountant: boolean; copyText: string;
}) {
  if (!items.length) return null;
  const copy = async () => {
    try { await navigator.clipboard.writeText(copyText); toast.success('已複製名單'); }
    catch { toast.error('複製失敗'); }
  };
  return (
    <Card className="mb-4">
      <div className="text-xs text-gray-500 mb-2">要做的事</div>
      <ul className="divide-y divide-[#222222]">
        {items.map((it, i) => {
          if (it.kind === 'payable') {
            return (
              <li key={`p${it.payable.id}`}>
                <Link href="/fund-v2/payables" className="flex items-center justify-between py-2 gap-3">
                  <span className={`text-sm ${it.overdue ? 'text-[#FF0055]' : 'text-white'}`}>
                    {it.payable.title}
                    {it.payable.due_on && <span className="text-xs text-gray-500 ml-2">{it.payable.due_on.slice(5).replace('-', '/')}{it.overdue ? ' 逾期' : ''}</span>}
                  </span>
                  <span className={it.overdue ? 'text-[#FF0055]' : ''}>
                    <Amount value={it.payable.amount} size="sm" kind="neutral" />
                  </span>
                </Link>
              </li>
            );
          }
          if (it.kind === 'unclaimed') {
            return (
              <li key={`u${i}`} className="py-2 text-sm text-white">
                待請款代墊 {it.count} 筆 ｜ <span className="font-mono tabular-nums">{fmtAmount(it.sum)}</span>
              </li>
            );
          }
          return (
            <li key={`n${i}`} className="flex items-center justify-between py-2 text-sm text-white">
              <span>未繳 {it.count} 人</span>
              {isAccountant && (
                <button type="button" onClick={copy} className="px-3 py-2 rounded border border-[#333333] text-xs text-gray-300 hover:border-[#00FF41]">
                  複製名單
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
