import React from 'react';
import { Loader2 } from 'lucide-react';
import { MainPanel } from '../../components/layout';

export default function HrCapsLoading() {
  return (
    <MainPanel>
      <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-violet-600" aria-hidden />
        <span>Loading HR…</span>
      </div>
    </MainPanel>
  );
}
