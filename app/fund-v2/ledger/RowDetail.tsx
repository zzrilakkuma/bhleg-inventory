"use client";

import { useState } from 'react';
import toast from 'react-hot-toast';
import { formatSnapshot, SUBTYPE_LABEL } from '@/lib/fund';
import { updateTransaction, deleteTransaction } from '@/lib/fund-db';
import type { LedgerRow, Refs } from '@/lib/fund-v2/api';
import { Chip } from '../ui';

const CLAIM_LABEL: Record<string, string> = { unclaimed: '待請款', claimed: '已請款', waived: '放棄請款' };

export default function RowDetail({ row, refs, isAccountant, onChanged }: {
  row: LedgerRow; refs: Refs | null; isAccountant: boolean; onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(row.title);
  const [occurredOn, setOccurredOn] = useState(row.occurred_on);
  const [note, setNote] = useState(row.note ?? '');
  const [comment, setComment] = useState(row.comment ?? '');
  const [busy, setBusy] = useState(false);

  const snapText = formatSnapshot({ accounts: row.accounts, storages: row.storages, total: row.total }, refs?.accounts ?? [], refs?.storages ?? []);

  const save = async () => {
    setBusy(true);
    try {
      await updateTransaction(row.id, { title, occurred_on: occurredOn, note: note || null, comment: comment || null });
      toast.success('已更新');
      setEditing(false);
      onChanged();
    } catch (e) { toast.error(String((e as Error).message ?? e)); } finally { setBusy(false); }
  };
  const del = async () => {
    if (!window.confirm(`確定刪除「${row.title.split('\n')[0]}」？此操作無法復原。`)) return;
    setBusy(true);
    try { await deleteTransaction(row.id); toast.success('已刪除'); onChanged(); }
    catch (e) { toast.error(String((e as Error).message ?? e)); } finally { setBusy(false); }
  };

  const inp = 'w-full bg-black border border-[#333333] rounded px-2 py-2 text-sm text-white';
  return (
    <div className="bg-[#111111] border-t border-[#222222] px-3 py-3 text-sm space-y-2">
      <div className="flex flex-wrap gap-2 text-xs text-gray-400 items-center">
        <span>{SUBTYPE_LABEL[row.type]}</span>
        {row.vendor && <span>｜{row.vendor}</span>}
        {row.voucher && <span>｜憑證 {row.voucher}</span>}
        {row.claim_status && row.claim_status !== 'none' && (
          <span className="px-2 py-0.5 rounded border border-amber-500/50 text-amber-400">{CLAIM_LABEL[row.claim_status] ?? row.claim_status}</span>
        )}
      </div>
      {row.tags && row.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">{row.tags.map((t) => <span key={t} className="text-xs text-[#00FF41]">#{t}</span>)}</div>
      )}
      {!editing && (
        <>
          {row.title.includes('\n') && <div className="whitespace-pre-wrap text-gray-300">{row.title}</div>}
          {row.note && <div className="text-gray-300 whitespace-pre-wrap">備註：{row.note}</div>}
          {row.comment && <div className="text-gray-400 whitespace-pre-wrap">說明：{row.comment}</div>}
          {row.date_note && <div className="text-gray-500 text-xs">{row.date_note}</div>}
        </>
      )}
      <pre className="text-xs text-gray-400 whitespace-pre-wrap font-mono tabular-nums">{snapText}</pre>
      {isAccountant && !editing && (
        <div className="flex gap-2 pt-1">
          <Chip onClick={() => setEditing(true)}>編輯</Chip>
          <button type="button" disabled={busy} onClick={del}
            className="px-3 py-2 rounded border border-[#FF0055]/50 text-[#FF0055] text-sm disabled:opacity-50">刪除</button>
        </div>
      )}
      {isAccountant && editing && (
        <div className="space-y-2">
          <label className="block text-xs text-gray-500">標題<textarea className={inp} rows={2} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <label className="block text-xs text-gray-500">發生日<input type="date" className={inp} value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} /></label>
          <label className="block text-xs text-gray-500">備註<input className={inp} value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <label className="block text-xs text-gray-500">說明<input className={inp} value={comment} onChange={(e) => setComment(e.target.value)} /></label>
          <div className="flex gap-2">
            <button type="button" disabled={busy || !title.trim()} onClick={save}
              className="px-4 py-2 rounded border border-[#00FF41] text-[#00FF41] text-sm disabled:opacity-50">儲存</button>
            <Chip onClick={() => setEditing(false)}>取消</Chip>
          </div>
        </div>
      )}
    </div>
  );
}
