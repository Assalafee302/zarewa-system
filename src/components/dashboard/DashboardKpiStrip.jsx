import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight, Landmark } from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { formatNgn } from '../../Data/mockData';
import {
  liveLiquidityBreakdown,
  liveMetersSeries,
  liveProductionAttributedSalesSeriesByMonth,
  productionAttributedRevenueNgn,
  productionOutputDateISO,
  totalLiquidityNgn,
} from '../../lib/liveAnalytics';

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** Align period chips: `2026-03` → `Mar ’26` */
function shortPeriodLabel(isoKey) {
  const parts = String(isoKey).split('-');
  const y = parts[0];
  const m = parseInt(parts[1], 10);
  if (y && m >= 1 && m <= 12) return `${MONTH_SHORT[m - 1]} ’${y.slice(-2)}`;
  return isoKey;
}

function attrsForProduct(p) {
  return (
    p.dashboardAttrs ?? {
      gauge: '—',
      colour: '—',
      materialType: p.name,
    }
  );
}

function KpiCard({ title, value, sub, onClick, titleAttr, highlight, children }) {
  const accent =
    highlight === 'danger'
      ? 'border-l-4 border-l-rose-600'
      : highlight === 'success'
        ? 'border-l-4 border-l-[#134e4a]'
        : 'border-l-4 border-l-transparent';
  return (
    <motion.button
      type="button"
      whileHover={{ scale: 1.015 }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      onClick={onClick}
      title={titleAttr ?? title}
      className={`z-kpi-card text-left h-full min-h-[8.5rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/20 focus-visible:ring-offset-2 w-full flex flex-col ${accent}`}
    >
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">{title}</p>
      <p className="text-2xl font-bold text-[#134e4a] tracking-tight tabular-nums leading-tight">
        {value}
      </p>
      {children ? <div className="mt-3 flex-1 min-h-0">{children}</div> : null}
      {sub ? (
        <p
          className={`text-[10px] font-medium text-slate-500 mt-3 flex items-center gap-1 tabular-nums ${children ? 'border-t border-slate-100 pt-3' : 'pt-1'}`}
        >
          {sub}
          <ChevronRight size={12} className="opacity-40 shrink-0 text-slate-400" />
        </p>
      ) : null}
    </motion.button>
  );
}

/**
 * Same four KPI cards as Operations dashboard: metres produced, MTD sales (production basis), treasury, low stock.
 * Uses workspace snapshot + inventory — aligned with Dashboard.jsx.
 * @param {{ startISO: string; label: string } | null | undefined} [metricsWindow] — When set (e.g. Manager dashboard), metres & sales cards use sums from that date onward.
 */
export function DashboardKpiStrip({ sectionClassName = 'mb-8', metricsWindow }) {
  const navigate = useNavigate();
  const { products: invProducts } = useInventory();
  const ws = useWorkspace();

  const lowStockSkus = useMemo(
    () => invProducts.filter((p) => p.stockLevel < p.lowStockThreshold),
    [invProducts]
  );
  const liveLowStockCount = lowStockSkus.length;

  const quotations = useMemo(
    () =>
      ws?.hasWorkspaceData
        ? Array.isArray(ws?.snapshot?.quotations)
          ? ws.snapshot.quotations
          : []
        : [],
    [ws]
  );
  const productionJobs = useMemo(
    () =>
      ws?.hasWorkspaceData
        ? Array.isArray(ws?.snapshot?.productionJobs)
          ? ws.snapshot.productionJobs
          : []
        : [],
    [ws]
  );
  const treasuryAccounts = useMemo(
    () =>
      ws?.hasWorkspaceData
        ? Array.isArray(ws?.snapshot?.treasuryAccounts)
          ? ws.snapshot.treasuryAccounts
          : []
        : [],
    [ws]
  );

  const metersSeries = useMemo(() => liveMetersSeries(productionJobs, 6), [productionJobs]);
  const metersCurrent = metersSeries[metersSeries.length - 1];
  const metersPrev = metersSeries[metersSeries.length - 2];
  const metersDeltaPct = useMemo(() => {
    if (!metersPrev?.meters) return null;
    return ((metersCurrent.meters - metersPrev.meters) / metersPrev.meters) * 100;
  }, [metersCurrent, metersPrev]);

  const windowStart = metricsWindow?.startISO ? String(metricsWindow.startISO).slice(0, 10) : '';
  const metersInWindow = useMemo(() => {
    if (!windowStart) return null;
    return productionJobs.reduce((s, j) => {
      if (String(j.status || '').trim() !== 'Completed') return s;
      const d = productionOutputDateISO(j);
      if (!d || d < windowStart) return s;
      return s + (Number(j.actualMeters) || 0);
    }, 0);
  }, [productionJobs, windowStart]);

  const salesInWindow = useMemo(() => {
    if (!windowStart) return null;
    return productionAttributedRevenueNgn(quotations, productionJobs, windowStart, '');
  }, [quotations, productionJobs, windowStart]);

  const useWindow = Boolean(metricsWindow && windowStart);

  const liquidityBreakdown = useMemo(() => liveLiquidityBreakdown(treasuryAccounts), [treasuryAccounts]);
  const liquidityTotal = useMemo(() => totalLiquidityNgn(treasuryAccounts), [treasuryAccounts]);
  const salesByMonth = useMemo(
    () => liveProductionAttributedSalesSeriesByMonth(quotations, productionJobs, 6),
    [quotations, productionJobs]
  );
  const salesMonthRevenue = salesByMonth[salesByMonth.length - 1]?.amountNgn || 0;

  const stockAlerts = useMemo(() => {
    return lowStockSkus.slice(0, 6).map((p) => {
      const a = attrsForProduct(p);
      return {
        id: p.productID,
        gauge: a.gauge,
        colour: a.colour,
        materialType: a.materialType,
        status: p.stockLevel <= 0 ? 'Critical' : 'Low',
        qty: `${p.stockLevel.toLocaleString()} ${p.unit}`,
      };
    });
  }, [lowStockSkus]);

  return (
    <section className={sectionClassName}>
      <h2 className="sr-only">Key performance indicators</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          title={useWindow ? `Metres (${metricsWindow.label})` : 'Metres produced (this month)'}
          value={`${(useWindow ? metersInWindow ?? 0 : metersCurrent.meters).toLocaleString()} m`}
          sub={
            useWindow
              ? 'Completed jobs · production completion date'
              : metersDeltaPct == null
                ? metersCurrent.label
                : `${metersDeltaPct >= 0 ? '+' : ''}${metersDeltaPct.toFixed(1)}% vs ${metersPrev?.label ?? 'prior month'}`
          }
          titleAttr="Actual metres from completed production jobs (dated when production finished)."
          onClick={() => navigate('/operations')}
          highlight={
            useWindow
              ? undefined
              : metersDeltaPct != null && metersDeltaPct < 0
                ? 'danger'
                : 'success'
          }
        >
          {!useWindow ? (
            <div className="grid grid-cols-3 gap-x-3 gap-y-3">
              {metersSeries.slice(-4, -1).map((m) => (
                <div
                  key={m.key}
                  className="min-w-0 border-b border-slate-100 pb-2 last:border-0 sm:border-0 sm:pb-0"
                  title={`${m.label}: ${m.meters.toLocaleString()} m`}
                >
                  <p className="text-[9px] font-semibold text-slate-500 truncate">
                    {shortPeriodLabel(m.key)}
                  </p>
                  <p className="text-[12px] font-bold text-[#134e4a] tabular-nums text-right sm:text-left">
                    {(m.meters / 1000).toFixed(0)}
                    <span className="text-[9px] font-semibold text-slate-400 ml-0.5">k m</span>
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </KpiCard>

        <KpiCard
          title={useWindow ? `Sales (${metricsWindow.label})` : 'Sales (produced, MTD)'}
          value={formatNgn(useWindow ? salesInWindow ?? 0 : salesMonthRevenue)}
          sub={
            useWindow
              ? 'Quote total × actual-metre share · jobs completed in range'
              : 'Production completions this month · not quotation date'
          }
          titleAttr="Sales value from quotations when jobs complete; split by actual metres across completed jobs per quote."
          onClick={() => navigate('/sales')}
        />

        <button
          type="button"
          onClick={() => navigate('/accounts')}
          title="Open Finance for treasury detail"
          className="z-kpi-card text-left h-full min-h-[8.5rem] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/20 focus-visible:ring-offset-2 flex flex-col border-l-4 border-l-transparent"
        >
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
            <Landmark size={14} className="text-[#134e4a]" />
            Cash & bank (total)
          </p>
          <p className="text-2xl font-bold text-[#134e4a] tracking-tight tabular-nums leading-tight">
            {formatNgn(liquidityTotal)}
          </p>
          <ul className="mt-3 flex-1 space-y-0 border-t border-slate-100 pt-3">
            {liquidityBreakdown.map((row) => (
              <li
                key={row.label}
                className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 py-2 border-b border-slate-50 last:border-0 text-[10px] font-medium text-slate-600"
              >
                <span className="truncate text-left">{row.label}</span>
                <span className="tabular-nums text-right text-[#134e4a] font-semibold shrink-0">
                  {formatNgn(row.amountNgn)}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[10px] font-medium text-slate-400 mt-3 pt-2 border-t border-slate-100 flex items-center gap-1">
            Treasury detail <ChevronRight size={12} className="opacity-50" />
          </p>
        </button>

        <KpiCard
          title="Low stock (by gauge · type · colour)"
          value={String(liveLowStockCount)}
          sub="Open inventory to reorder / GRN"
          titleAttr="SKUs below minimum — detail lists material shape."
          onClick={() => navigate('/operations')}
          highlight={liveLowStockCount > 0 ? 'danger' : undefined}
        >
          {stockAlerts.length > 0 ? (
            <ul className="mt-2 space-y-2 border-t border-slate-100 pt-3">
              {stockAlerts.slice(0, 3).map((s) => (
                <li key={s.id} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 items-start text-left">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold text-[#134e4a] leading-snug">
                      <span className="tabular-nums">{s.gauge}</span>
                      <span className="text-slate-400 font-medium"> mm</span>
                      <span className="text-slate-600"> · {s.materialType}</span>
                    </p>
                    <p className="text-[9px] text-slate-500 truncate">{s.colour}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[9px] font-semibold uppercase text-slate-400">{s.status}</p>
                    <p className="text-[10px] font-bold text-slate-700 tabular-nums">{s.qty}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[10px] font-medium text-slate-500 border-t border-slate-100 pt-3">
              All tracked SKUs above reorder.
            </p>
          )}
        </KpiCard>
      </div>
    </section>
  );
}
