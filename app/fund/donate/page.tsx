"use client";

import { useState } from 'react';
import toast from 'react-hot-toast';
import { STANDARD_AMOUNT, todayISO, type FundAccount, type FundHandler, type FundMember } from '@/lib/fund';

const inputCls = 'w-full px-4 py-3 bg-[#0a0a0a] border border-[#333333] rounded text-white placeholder-gray-600 focus:outline-none focus:border-[#00FF41] transition-colors font-mono';
const labelCls = 'block text-sm text-gray-400 mb-2 font-mono';
const chip = (on: boolean) =>
  `px-3 py-2 rounded border font-mono text-sm transition-colors ${on ? 'border-[#00FF41] text-[#00FF41] bg-[rgba(0,255,65,0.1)]' : 'border-[#333333] text-gray-400 hover:border-[#555555]'}`;

interface Allocation { accountId: number | ''; amount: string }

export default function DonatePage() {
  const [members, setMembers] = useState<FundMember[]>([]);
  const [handlers, setHandlers] = useState<FundHandler[]>([]);
  const [accounts, setAccounts] = useState<FundAccount[]>([]);
  const [unlocked, setUnlocked] = useState(false);
  const [checking, setChecking] = useState(false);

  const [memberId, setMemberId] = useState<number | ''>('');
  const [payerId, setPayerId] = useState<number | ''>('');
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState<'transfer' | 'cash'>('transfer');
  const [last5, setLast5] = useState('');
  const [handlerId, setHandlerId] = useState<number | ''>('');
  const [amount, setAmount] = useState('');
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [message, setMessage] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  // 先驗通關密語，通過才拿到成員名單並顯示表單
  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphrase.trim()) return toast.error('請輸入通關密語');
    setChecking(true);
    try {
      const r = await fetch('/api/fund/donate', { headers: { 'x-fund-passphrase': passphrase.trim() } });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? '驗證失敗');
      setMembers(j.members); setHandlers(j.handlers); setAccounts(j.accounts);
      setUnlocked(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '驗證失敗');
    } finally {
      setChecking(false);
    }
  };

  const selectMember = (id: number | '') => {
    setMemberId(id);
    const m = members.find((x) => x.id === id);
    if (m?.default_last5) setLast5(m.default_last5);
  };

  const amountNum = Math.round(Number(amount)) || 0;
  const allocated = allocations.reduce((s, a) => s + (Math.round(Number(a.amount)) || 0), 0);
  const remainder = amountNum - allocated;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberId) return toast.error('請選擇你的名字');
    if (amountNum <= 0) return toast.error('請填金額');
    if (method === 'transfer' && !/^\d{5}$/.test(last5)) return toast.error('末五碼要 5 位數字');
    if (method === 'cash' && !handlerId) return toast.error('請選經手人');
    if (remainder < 0) return toast.error('專款分配超過金額');

    setSubmitting(true);
    try {
      const r = await fetch('/api/fund/donate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passphrase, memberId, payerMemberId: payerId || null, date, paymentMethod: method,
          last5: method === 'transfer' ? last5 : undefined, handlerId: method === 'cash' ? handlerId : null,
          amount: amountNum,
          allocations: allocations.filter((a) => a.accountId && Number(a.amount) > 0),
          message,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? '送出失敗');
      setDone(j.title);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '送出失敗');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <div className="text-[#00FF41] text-2xl font-bold mb-3" style={{ textShadow: '0 0 10px rgba(0,255,65,0.3)' }}>已收到 🫶</div>
        <pre className="text-gray-400 font-mono text-sm whitespace-pre-wrap mb-6">{done}</pre>
        <button onClick={() => window.location.reload()} className="text-sm text-gray-500 hover:text-[#00FF41] font-mono">再填一筆</button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col px-6 py-8">
      <header className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-white" style={{ textShadow: '0 0 10px rgba(255,255,255,0.4)' }}>巢穴共同體 公基金</h1>
        <p className="text-sm text-gray-500 font-mono mt-1">{'// 每月奉納紀錄'}</p>
      </header>

      {!unlocked ? (
        <form onSubmit={unlock} className="w-full max-w-md mx-auto space-y-6">
          <div>
            <label className={labelCls}>通關密語：</label>
            <input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} autoComplete="off" autoFocus className={inputCls} />
          </div>
          <button type="submit" disabled={checking}
            className="w-full py-4 rounded border border-[#00FF41] text-[#00FF41] font-semibold bg-gradient-to-br from-[rgba(0,255,65,0.1)] to-transparent hover:from-[rgba(0,255,65,0.2)] active:scale-[0.98] transition-all disabled:opacity-50"
            style={{ boxShadow: '0 0 5px rgba(0,255,65,0.3)' }}>
            {checking ? '驗證中…' : '> 進入'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleSubmit} className="w-full max-w-md mx-auto space-y-6">
          <div>
            <label className={labelCls}>你的名字：</label>
            <select value={memberId} onChange={(e) => selectMember(Number(e.target.value) || '')} className={inputCls}>
              <option value="">— 請選擇 —</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.nickname}{m.real_name ? `（${m.real_name}）` : ''}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>奉納日期：</label>
            <input type="date" value={date} min="2024-11-01" max={todayISO()} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>挹注方式：</label>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setMethod('transfer')} className={chip(method === 'transfer')}>匯款</button>
              <button type="button" onClick={() => setMethod('cash')} className={chip(method === 'cash')}>現金</button>
            </div>
          </div>

          {method === 'transfer' ? (
            <div>
              <label className={labelCls}>你的帳號末五碼：</label>
              <input inputMode="numeric" maxLength={5} value={last5}
                onChange={(e) => setLast5(e.target.value.replace(/\D/g, '').slice(0, 5))}
                placeholder="12345" className={`${inputCls} tracking-widest`} />
              <p className="text-xs text-gray-600 font-mono mt-1">若是借用別人的帳戶轉帳，請改成實際轉出帳戶的末五碼</p>
            </div>
          ) : (
            <div>
              <label className={labelCls}>現金交給誰：</label>
              <select value={handlerId} onChange={(e) => setHandlerId(Number(e.target.value) || '')} className={inputCls}>
                <option value="">— 請選擇 —</option>
                {handlers.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className={labelCls}>金額：</label>
            <div className="flex gap-3">
              <input type="number" inputMode="numeric" min={1} step={1} value={amount} onChange={(e) => setAmount(e.target.value)}
                placeholder="0" className={`${inputCls} text-center text-2xl font-bold`} style={{ caretColor: '#00FF41' }} />
              <button type="button" onClick={() => setAmount(String(STANDARD_AMOUNT))} className={`${chip(amountNum === STANDARD_AMOUNT)} whitespace-nowrap`}>
                標準 {STANDARD_AMOUNT}
              </button>
            </div>
          </div>

          <details className="border border-[#333333] rounded">
            <summary className="px-4 py-3 text-sm text-gray-400 font-mono cursor-pointer">進階：代繳／特殊專款</summary>
            <div className="px-4 pb-4 space-y-4">
              <div>
                <label className={labelCls}>由誰代繳（非必填）：</label>
                <select value={payerId} onChange={(e) => setPayerId(Number(e.target.value) || '')} className={inputCls}>
                  <option value="">本人繳納</option>
                  {members.filter((m) => m.id !== memberId).map((m) => <option key={m.id} value={m.id}>{m.nickname}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>特殊專款分配（非必填）：</label>
                <div className="space-y-2">
                  {allocations.map((a, idx) => (
                    <div key={idx} className="flex gap-2">
                      <select value={a.accountId} className={inputCls}
                        onChange={(e) => setAllocations((p) => p.map((x, i) => (i === idx ? { ...x, accountId: Number(e.target.value) || '' } : x)))}>
                        <option value="">— 科目 —</option>
                        {accounts.map((ac) => <option key={ac.id} value={ac.id}>{ac.name}</option>)}
                      </select>
                      <input type="number" inputMode="numeric" min={1} value={a.amount} placeholder="金額" className={`${inputCls} w-28`}
                        onChange={(e) => setAllocations((p) => p.map((x, i) => (i === idx ? { ...x, amount: e.target.value } : x)))} />
                      <button type="button" className="text-[#FF0055] font-mono px-2" onClick={() => setAllocations((p) => p.filter((_, i) => i !== idx))}>×</button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setAllocations((p) => [...p, { accountId: '', amount: '' }])}
                    className="text-sm text-gray-500 hover:text-[#00FF41] font-mono">+ 新增一列</button>
                  {allocations.length > 0 && (
                    <p className={`text-xs font-mono ${remainder < 0 ? 'text-[#FF0055]' : 'text-gray-500'}`}>
                      其餘 {remainder} 元進不凍結零用金
                    </p>
                  )}
                </div>
              </div>
            </div>
          </details>

          <div>
            <label className={labelCls}>感想或建議（非必填）：</label>
            <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} className={`${inputCls} text-sm resize-none`} />
          </div>

          <button type="submit" disabled={submitting}
            className="w-full py-4 rounded border border-[#00FF41] text-[#00FF41] font-semibold bg-gradient-to-br from-[rgba(0,255,65,0.1)] to-transparent hover:from-[rgba(0,255,65,0.2)] active:scale-[0.98] transition-all disabled:opacity-50"
            style={{ boxShadow: '0 0 5px rgba(0,255,65,0.3)' }}>
            {submitting ? '送出中…' : '> 送出'}
          </button>
        </form>
      )}
    </div>
  );
}
