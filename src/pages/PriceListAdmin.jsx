import React from 'react';
import { Navigate } from 'react-router-dom';
import { MainPanel, PageHeader } from '../components/layout';
import { PriceListPanel } from '../components/procurement/PriceListPanel';
import { useWorkspace } from '../context/WorkspaceContext';

/** Standalone price list page (sidebar entry removed; primary UI is Procurement → Conversion). */
export default function PriceListAdmin() {
  const ws = useWorkspace();
  const canView = ws?.hasPermission?.('pricing.manage') || ws?.hasPermission?.('md.price_exception.approve');

  if (!canView) {
    return <Navigate to="/" replace />;
  }

  return (
    <MainPanel>
      <PageHeader
        title="Price list"
        subtitle="Floor prices (₦/m) in price_list_items: validated effective dates, duplicate detection, optional material/colour/profile keys, and CSV export. Also available under Procurement → Conversion."
      />
      <PriceListPanel />
    </MainPanel>
  );
}
