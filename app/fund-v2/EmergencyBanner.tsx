"use client";

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import { bannerText, getEmergencies, openEmergency, type Emergency } from '@/lib/fund-v2/emergency';

export const EMERGENCY_CHANGED = 'fund-emergency-changed';

export default function EmergencyBanner() {
  const [open, setOpen] = useState<Emergency | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    let alive = true;
    const load = () => {
      getEmergencies(supabase)
        .then((list) => { if (alive) setOpen(openEmergency(list)); })
        .catch(() => { if (alive) setOpen(null); });
    };
    load();
    window.addEventListener(EMERGENCY_CHANGED, load);
    return () => { alive = false; window.removeEventListener(EMERGENCY_CHANGED, load); };
  }, [pathname]);

  if (!open) return null;
  return (
    <div role="status" className="mx-4 mt-4 border border-[#FF0055] bg-[#FF0055]/10 text-[#FF0055] text-sm rounded px-3 py-2">
      {bannerText(open)}
    </div>
  );
}
