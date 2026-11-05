"use client";

import toast from 'react-hot-toast';
import { Card } from '../../../ui';
import { StepNav } from '../shared';

export default function PublishStep({ text, busy, onBack, onFinish }: {
  text: string; busy: boolean; onBack: () => void; onFinish: () => void;
}) {
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); toast.success('已複製公布文字'); }
    catch { toast.error('複製失敗'); }
  };
  return (
    <div>
      <p className="text-sm text-gray-400 mb-3">步驟 4／4：公布</p>
      <Card>
        <pre className="whitespace-pre-wrap break-words text-sm text-white font-sans tabular-nums">{text}</pre>
      </Card>
      <button type="button" onClick={copy}
        className="w-full mt-3 py-3 rounded border border-[#333333] text-gray-200 text-base hover:border-[#00FF41]">
        複製
      </button>
      <StepNav onBack={onBack} onNext={onFinish} nextLabel="完成結算" busy={busy} primary />
    </div>
  );
}
