import React from 'react';
import { MainPanel, PageHeader } from '../../components/layout';

export default function HrTalent() {
  return (
    <MainPanel>
      <PageHeader title="Talent & requests" subtitle="HR requests and workflows." />
      <p className="text-sm text-slate-600">Use the main workspace or future screens to submit and track HR requests.</p>
    </MainPanel>
  );
}
