"use client";

import Link from 'next/link';

export const inputCls = 'w-full px-4 py-3 bg-[#0a0a0a] border border-[#333333] rounded text-white placeholder-gray-600 focus:outline-none focus:border-[#00FF41] transition-colors font-mono';
export const labelCls = 'block text-sm text-gray-400 mb-2 font-mono';
export const chipCls = (on: boolean, danger = false) =>
  `px-3 py-2 rounded border font-mono text-sm transition-colors ${
    on ? (danger ? 'border-[#FF0055] text-[#FF0055] bg-[rgba(255,0,85,0.1)]' : 'border-[#00FF41] text-[#00FF41] bg-[rgba(0,255,65,0.1)]')
       : 'border-[#333333] text-gray-400 hover:border-[#555555]'}`;
export const primaryBtnCls = 'w-full py-4 rounded border border-[#00FF41] text-[#00FF41] font-semibold bg-gradient-to-br from-[rgba(0,255,65,0.1)] to-transparent hover:from-[rgba(0,255,65,0.2)] active:scale-[0.98] transition-all disabled:opacity-50';

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-600 font-mono mt-1">{hint}</p>}
    </div>
  );
}

export function PageHeader({ title, code, back = '/fund', backLabel = '← 流水帳' }: { title: string; code: string; back?: string; backLabel?: string }) {
  return (
    <header className="mb-6 max-w-2xl mx-auto w-full">
      <Link href={back} className="inline-block text-sm text-gray-500 hover:text-[#00FF41] font-mono mb-4">{backLabel}</Link>
      <h1 className="text-2xl font-bold text-[#00FF41]" style={{ textShadow: '0 0 10px rgba(0,255,65,0.3)' }}>{title}</h1>
      <p className="text-sm text-gray-500 font-mono mt-1">{`// ${code}`}</p>
    </header>
  );
}

export function Loading() {
  return <div className="flex min-h-screen items-center justify-center"><div className="text-[#00FF41] font-mono">載入中...</div></div>;
}

export function ErrorBox({ message }: { message: string }) {
  return <div className="flex min-h-screen items-center justify-center px-6"><div className="text-[#FF0055] font-mono">{message}</div></div>;
}

export function FundNav({ current }: { current: string }) {
  const items = [
    ['/fund', '流水帳'], ['/fund/new', '登錄'], ['/fund/settle', '月結算'], ['/fund/monthly', '每月一覽'], ['/fund/manage', '管理'],
  ];
  return (
    <nav className="flex flex-wrap gap-2 mt-4 text-sm font-mono">
      {items.map(([href, label]) => (
        <Link key={href} href={href} className={`px-3 py-2 border rounded ${current === href ? 'border-[#00FF41] text-[#00FF41]' : 'border-[#333333] text-gray-300 hover:border-[#00FF41]'}`}>{label}</Link>
      ))}
    </nav>
  );
}
