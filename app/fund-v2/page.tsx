"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import { getLatestSnapshot, type Snapshot } from '@/lib/fund-v2/api';
import { Amount, Card } from './ui';

export default function LedgerPage() {
  const [snap, setSnap] = useState<Snapshot | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getLatestSnapshot(supabase).then(setSnap).catch((e) => setErr(String(e?.message ?? e)));
  }, []);

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">帳</h1>
      {err && <p className="text-[#FF0055] text-sm">{err}</p>}
      {snap === undefined && !err && <p className="text-gray-500 text-sm">載入中...</p>}
      {snap !== undefined && (
        <Card className="flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-500">零用金</div>
            <Amount value={snap?.main ?? 0} size="xl" />
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500">小結</div>
            <Amount value={snap?.total ?? 0} size="lg" kind="neutral" />
          </div>
        </Card>
      )}
    </div>
  );
}
