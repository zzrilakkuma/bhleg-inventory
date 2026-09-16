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
    ['/fund', '流水帳'], ['/fund/new', '登錄'], ['/fund/transfer', '轉帳'], ['/fund/settle', '月結算'], ['/fund/monthly', '每月一覽'], ['/fund/manage', '管理'],
  ];
  return (
    <nav className="flex flex-wrap gap-2 mt-4 text-sm font-mono">
      {items.map(([href, label]) => (
        <Link key={href} href={href} className={`px-3 py-2 border rounded ${current === href ? 'border-[#00FF41] text-[#00FF41]' : 'border-[#333333] text-gray-300 hover:border-[#00FF41]'}`}>{label}</Link>
      ))}
    </nav>
  );
}

// ---- 目前結算卡片 ----
import { fmtAmount, type BalanceSnapshot, type FundAccount, type FundStorage } from '@/lib/fund';

function Amount({ value, strong = false }: { value: number; strong?: boolean }) {
  const cls = value < 0 ? 'text-[#FF0055]' : value === 0 ? 'text-gray-600' : strong ? 'text-[#00FF41]' : 'text-white';
  return <span className={`font-mono tabular-nums ${cls}`}>{fmtAmount(value)}</span>;
}

export function BalanceCard({ snapshot, accounts, storages, title = '目前結算', asOf }: {
  snapshot: BalanceSnapshot; accounts: FundAccount[]; storages: FundStorage[]; title?: string; asOf?: string;
}) {
  const acc = accounts.filter((a) => a.active || (snapshot.accounts[a.id] ?? 0) !== 0);
  const sto = storages.filter((s) => s.active || (snapshot.storages[s.id] ?? 0) !== 0);
  const main = acc.filter((a) => a.kind === 'main');
  const reserve = acc.filter((a) => a.kind === 'reserve');
  const others = acc.filter((a) => a.kind !== 'main' && a.kind !== 'reserve');
  const frozen = reserve.reduce((s, a) => s + (snapshot.accounts[a.id] ?? 0), 0);

  const Row = ({ name, value, sub }: { name: string; value: number; sub?: string }) => (
    <div className="flex items-baseline justify-between py-1.5 border-b border-[#1a1a1a] last:border-0">
      <span className="text-sm text-gray-300">{name}{sub && <span className="text-xs text-gray-600 ml-2">{sub}</span>}</span>
      <Amount value={value} />
    </div>
  );
  // 金額為 0 的項目預設收合，點一下展開
  const zeroBlock = (items: { id: number; name: string }[]) =>
    items.length ? (
      <details className="mt-2 group">
        <summary className="text-xs text-gray-600 font-mono cursor-pointer select-none list-none hover:text-gray-400">
          <span className="inline-block w-3 transition-transform group-open:rotate-90">▸</span> 為 0 的 {items.length} 項
        </summary>
        <div className="opacity-50">
          {items.map((x) => <Row key={x.id} name={x.name} value={0} />)}
        </div>
      </details>
    ) : null;

  const othersShown = others.filter((a) => (snapshot.accounts[a.id] ?? 0) !== 0);
  const othersZero = others.filter((a) => (snapshot.accounts[a.id] ?? 0) === 0);
  const coreStorage = (n: string) => n === '郵局' || n === '現金';
  const stoShown = sto.filter((x) => coreStorage(x.name) || (snapshot.storages[x.id] ?? 0) !== 0);
  const stoZero = sto.filter((x) => !coreStorage(x.name) && (snapshot.storages[x.id] ?? 0) === 0);

  return (
    <section className="rounded border border-[#00FF41] bg-gradient-to-br from-[rgba(0,255,65,0.08)] to-transparent" style={{ boxShadow: '0 0 8px rgba(0,255,65,0.15)' }}>
      <div className="p-4 border-b border-[rgba(0,255,65,0.25)]">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-gray-500 font-mono">{title}{asOf && `　${asOf}`}</span>
          <span className="text-xs text-gray-500 font-mono">小結</span>
        </div>
        <div className="text-3xl font-bold text-right mt-1"><Amount value={snapshot.total} strong /></div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          {main.map((a) => (
            <div key={a.id} className="p-3 rounded bg-[#0a0a0a] border border-[#333333]">
              <div className="text-xs text-gray-500 mb-1">{a.name}</div>
              <div className="text-xl font-bold"><Amount value={snapshot.accounts[a.id] ?? 0} strong /></div>
              <div className="text-[10px] text-gray-600 font-mono mt-1">可動用</div>
            </div>
          ))}
          <div className="p-3 rounded bg-[#0a0a0a] border border-[#333333]">
            <div className="text-xs text-gray-500 mb-1">凍存合計</div>
            <div className="text-xl font-bold"><Amount value={frozen} /></div>
            <div className="text-[10px] text-gray-600 font-mono mt-1">{reserve.map((a) => a.name.slice(0, 4)).join(' + ')}</div>
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2">
        <div className="p-4 sm:border-r border-b sm:border-b-0 border-[rgba(0,255,65,0.25)]">
          <div className="text-xs text-gray-500 font-mono mb-2">科目</div>
          {reserve.map((a) => <Row key={a.id} name={a.name} value={snapshot.accounts[a.id] ?? 0} sub="凍存" />)}
          {othersShown.map((a) => <Row key={a.id} name={a.name} value={snapshot.accounts[a.id] ?? 0} />)}
          {zeroBlock(othersZero)}
        </div>
        <div className="p-4">
          <div className="text-xs text-gray-500 font-mono mb-2">存放位置</div>
          {stoShown.map((x) => (
            <Row key={x.id} name={x.name} value={snapshot.storages[x.id] ?? 0}
              sub={x.name.startsWith('代墊') && (snapshot.storages[x.id] ?? 0) < 0 ? '欠代墊者' : undefined} />
          ))}
          {zeroBlock(stoZero)}
        </div>
      </div>
    </section>
  );
}
