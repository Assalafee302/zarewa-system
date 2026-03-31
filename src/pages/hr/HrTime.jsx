import React from 'react';
import { MainPanel, PageHeader } from '../../components/layout';

export default function HrTime() {
  return (
    <MainPanel>
      <PageHeader title="Time & attendance" subtitle="Uploads and period history will appear here." />
      <p className="text-sm text-slate-600">This section is available from the HR API; UI can be extended as needed.</p>
    </MainPanel>
  );
}
