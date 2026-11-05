"use client";

import { useEffect } from 'react';
import { fmtAmount } from '@/lib/fund';

export function Amount({ value, kind, size = 'base' }: {
  value: number; kind?: 'in' | 'out' | 'neutral'; size?: 'sm' | 'base' | 'lg' | 'xl';
}) {
  const color = value < 0 ? 'text-[#FF0055]' : kind === 'in' ? 'text-[#00FF41]' : kind === 'neutral' ? 'text-gray-400' : 'text-white';
  const sz = { sm: 'text-sm', base: 'text-base', lg: 'text-xl font-semibold', xl: 'text-3xl font-bold' }[size];
  return <span className={`font-mono tabular-nums ${sz} ${color}`}>{fmtAmount(value)}</span>;
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded border border-[#333333] bg-[#0a0a0a] p-4 ${className}`}>{children}</div>;
}

export function Chip({ on, onClick, children }: { on?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on === undefined ? undefined : on}
      className={`px-3 py-2 rounded border text-sm transition-colors ${
        on ? 'border-[#00FF41] text-[#00FF41] bg-[rgba(0,255,65,0.1)]' : 'border-[#333333] text-gray-400 hover:border-[#555555]'}`}>
      {children}
    </button>
  );
}

/** 手機底部抽屜；桌面置中顯示。Escape 或「關閉」關閉。 */
export function Sheet({ open, onClose, title, 'aria-label': ariaLabel, children }: {
  open: boolean; onClose: () => void; title?: string; 'aria-label'?: string; children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={ariaLabel ?? title}
        className="relative w-full md:max-w-lg max-h-[85vh] overflow-y-auto rounded-t-xl md:rounded-xl border border-[#333333] bg-[#0a0a0a] p-4 pb-8">
        <div className="flex items-start justify-between gap-3 mb-3">
          {title ? <h2 className="text-base font-semibold text-white">{title}</h2> : <span />}
          <button type="button" onClick={onClose} autoFocus
            className="shrink-0 px-3 py-1 rounded border border-[#333333] text-sm text-gray-400 hover:text-white">關閉</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-gray-500 mb-2 mt-4">{children}</div>;
}
