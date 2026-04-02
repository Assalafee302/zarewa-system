import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Filter, Sparkles, RefreshCcw, Users, CreditCard, ShieldCheck, ListChecks } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MainPanel, PageHeader } from '../../components/layout';
import { useHrWorkspace } from '../../context/HrWorkspaceContext';
import { apiFetch } from '../../lib/apiBase';
import { formatNgn } from '../../hr/hrFormat';
import { HrOpsToolbar, HrSectionCard } from './hrUx';

function valueOrAll(v) {
  return v || 'all';
}

const containerVars = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05
    }
  }
};

const itemVars = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
};

export default function HrNextDirectory() {
  const { caps } = useHrWorkspace();
  const [staff, setStaff] = useState([]);
  const [insights, setInsights] = useState(null);
  const [queue, setQueue] = useState([]);
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState({
    branchId: 'all',
    orgNode: 'all',
    roleFamily: 'all',
    gradeBand: 'all',
    status: 'all',
    quality: 'all',
  });

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [s, c, q] = await Promise.all([
        apiFetch('/api/hr/staff'),
        apiFetch('/api/hr/compensation-insights'),
        apiFetch('/api/hr/data-cleanup-queue'),
      ]);
      if (s.ok && s.data?.ok) setStaff(Array.isArray(s.data.staff) ? s.data.staff : []);
      if (c.ok && c.data?.ok) setInsights(c.data);
      if (q.ok && q.data?.ok) setQueue(Array.isArray(q.data.queue) ? q.data.queue : []);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!caps?.canViewDirectory) return;
    queueMicrotask(() => {
      void load();
    });
  }, [caps?.canViewDirectory, load]);

  const options = useMemo(() => {
    const pick = (fn) => Array.from(new Set(staff.map(fn).filter(Boolean))).sort();
    return {
      branches: pick((s) => s.normalized?.branchId || s.branchId),
      orgNodes: pick((s) => s.normalized?.orgNode),
      roleFamilies: pick((s) => s.normalized?.taxonomy?.roleFamily),
      grades: pick((s) => s.normalized?.taxonomy?.gradeBand),
      statuses: pick((s) => s.normalized?.taxonomy?.status),
    };
  }, [staff]);

  const filtered = useMemo(
    () =>
      staff.filter((s) => {
        if (filters.branchId !== 'all' && valueOrAll(s.normalized?.branchId || s.branchId) !== filters.branchId) return false;
        if (filters.orgNode !== 'all' && valueOrAll(s.normalized?.orgNode) !== filters.orgNode) return false;
        if (filters.roleFamily !== 'all' && valueOrAll(s.normalized?.taxonomy?.roleFamily) !== filters.roleFamily) return false;
        if (filters.gradeBand !== 'all' && valueOrAll(s.normalized?.taxonomy?.gradeBand) !== filters.gradeBand) return false;
        if (filters.status !== 'all' && valueOrAll(s.normalized?.taxonomy?.status) !== filters.status) return false;
        if (filters.quality === 'issues' && !Object.values(s.qualityFlags || {}).some(Boolean)) return false;
        return true;
      }),
    [staff, filters]
  );

  const resolveCleanup = async (item, action, targetValue) => {
    const { ok, data } = await apiFetch('/api/hr/data-cleanup-queue/resolve', {
      method: 'POST',
      body: JSON.stringify({ userId: item.userId, action, targetValue }),
    });
    if (ok && data?.ok) void load();
  };

  if (!caps?.canViewDirectory) {
    return (
      <MainPanel>
        <PageHeader title="Directory data quality" subtitle="No access." />
      </MainPanel>
    );
  }

  return (
    <MainPanel className="z-app-bg min-h-screen">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <PageHeader
          title="Directory Intelligence"
          subtitle="Enterprise-grade observability into staff normalization, salary benchmarks, and data health."
          actions={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void load()}
                disabled={busy}
                className="z-btn-secondary !px-4 py-2"
              >
                <RefreshCcw size={14} className={busy ? 'animate-spin' : ''} />
                <span className="hidden sm:inline">Reload</span>
              </button>
              <Link to="/hr/staff" className="z-btn-primary !px-4 py-2">
                <Users size={14} />
                <span className="hidden sm:inline">Advanced List</span>
              </Link>
            </div>
          }
        />
      </motion.div>

      {/* KPI Cards Section */}
      <motion.div 
        variants={containerVars}
        initial="hidden"
        animate="show"
        className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <motion.div variants={itemVars} className="z-kpi-card relative overflow-hidden">
          <div className="absolute top-0 right-0 p-2 opacity-5 text-[#134e4a]">
            <Users size={64} />
          </div>
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Active Headcount</p>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-black text-[#134e4a]">{insights?.summary?.headcount || 0}</p>
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">Live</span>
          </div>
        </motion.div>

        <motion.div variants={itemVars} className="z-kpi-card relative overflow-hidden">
          <div className="absolute top-0 right-0 p-2 opacity-5 text-[#134e4a]">
            <CreditCard size={64} />
          </div>
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Median Base Comp</p>
          <p className="text-3xl font-black text-[#134e4a]">₦{formatNgn(insights?.summary?.medianBaseSalaryNgn || 0)}</p>
        </motion.div>

        <motion.div variants={itemVars} className="z-kpi-card relative overflow-hidden border-orange-100 bg-orange-50/30">
          <div className="absolute top-0 right-0 p-2 opacity-5 text-orange-600">
            <AlertTriangle size={64} />
          </div>
          <p className="text-[10px] font-black uppercase tracking-wider text-orange-700">Integrity Risks</p>
          <p className="text-3xl font-black text-orange-900">{insights?.summary?.qualityIssues || 0}</p>
        </motion.div>

        <motion.div variants={itemVars} className="z-kpi-card relative overflow-hidden border-rose-100 bg-rose-50/30">
          <div className="absolute top-0 right-0 p-2 opacity-5 text-rose-600">
            <ListChecks size={64} />
          </div>
          <p className="text-[10px] font-black uppercase tracking-wider text-rose-700">Cleanup Backlog</p>
          <p className="text-3xl font-black text-rose-900">{queue.length}</p>
        </motion.div>
      </motion.div>

      {/* Filters Toolbar */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ delay: 0.2 }}
        className="z-toolbar-shell mb-6 p-4"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {[
              ['Branch', 'branchId', options.branches],
              ['Department', 'orgNode', options.orgNodes],
              ['Role Family', 'roleFamily', options.roleFamilies],
              ['Level', 'gradeBand', options.grades],
              ['Status', 'status', options.statuses],
            ].map(([label, key, vals]) => (
              <div key={key} className="space-y-1">
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block px-1">{label}</label>
                <select
                  value={filters[key]}
                  onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200/60 bg-white/50 px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#134e4a]/10 appearance-none shadow-sm"
                >
                  <option value="all">All {label}s</option>
                  {vals.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          
          <div className="flex items-end lg:h-full">
            <button
              type="button"
              onClick={() => setFilters((f) => ({ ...f, quality: f.quality === 'issues' ? 'all' : 'issues' }))}
              className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-black transition-all shadow-sm ${
                filters.quality === 'issues' 
                  ? 'bg-rose-50 border-rose-200 text-rose-700' 
                  : 'bg-white border-slate-200/60 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Filter size={14} className={filters.quality === 'issues' ? 'fill-rose-700/10' : ''} />
              {filters.quality === 'issues' ? 'Viewing Risks' : 'Filter Health'}
            </button>
          </div>
        </div>
      </motion.div>

      {/* Main Staff Table */}
      <HrSectionCard 
        title="Workforce Map" 
        subtitle="Data-dense normalized view with cross-functional compliance signals"
        className="!p-0 overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left font-pj">
            <thead>
              <tr className="bg-slate-50/50 text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">
                <th className="px-6 py-4">Employee</th>
                <th className="px-6 py-4 hidden md:table-cell">Structural Unit</th>
                <th className="px-6 py-4 hidden lg:table-cell">Professional Track</th>
                <th className="px-6 py-4">Comp Architecture</th>
                <th className="px-6 py-4 hidden sm:table-cell">Compliance</th>
                <th className="px-6 py-4 text-center">Data Health</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <AnimatePresence>
                {filtered.map((s, idx) => (
                  <motion.tr 
                    key={s.userId}
                    variants={itemVars}
                    initial="hidden"
                    animate="show"
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ delay: idx * 0.02 }}
                    className="hover:bg-slate-50/80 transition-colors group"
                  >
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm font-bold text-slate-900 group-hover:text-[#134e4a] transition-colors">{s.displayName || s.username}</p>
                        <p className="text-[10px] font-black font-mono text-slate-400 uppercase tracking-tighter">{s.employeeNo || s.userId}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 hidden md:table-cell">
                      <div className="flex flex-col">
                        <span className="text-[11px] font-bold text-slate-700">{s.normalized?.branchId || 'HQ'}</span>
                        <span className="text-[10px] font-medium text-slate-500">{s.normalized?.orgNode || 'Unassigned'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 hidden lg:table-cell">
                      <div className="flex flex-col">
                        <span className="text-[11px] font-bold text-slate-700">{s.normalized?.taxonomy?.roleFamily || 'Generalist'}</span>
                        <span className="text-[10px] font-medium text-slate-500">Level: {s.normalized?.taxonomy?.gradeBand || 'Standard'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-pj font-black text-[#134e4a] text-sm tabular-nums">₦{formatNgn(s.baseSalaryNgn || 0)}</span>
                    </td>
                    <td className="px-6 py-4 hidden sm:table-cell">
                      {s.complianceBadges?.handbookAcknowledged ? (
                        <div className="flex items-center gap-1.5 text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full w-fit">
                          <CheckCircle2 size={12} strokeWidth={3} />
                          <span className="text-[9px] font-black uppercase">Standard OK</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-orange-600 bg-orange-50 px-2 py-1 rounded-full w-fit">
                          <AlertTriangle size={12} strokeWidth={3} />
                          <span className="text-[9px] font-black uppercase">Review Pend.</span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center">
                        {Object.values(s.qualityFlags || {}).some(Boolean) ? (
                          <span className="inline-flex rounded-lg px-3 py-1 text-[10px] font-black uppercase tracking-wider bg-orange-100 text-orange-900 border border-orange-200">
                            Action Reqd
                          </span>
                        ) : (
                          <span className="inline-flex rounded-lg px-3 py-1 text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-900 border border-emerald-200">
                            Validated
                          </span>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="z-empty-state !border-none !shadow-none">
              <p className="text-slate-400 font-bold italic">No matching records for current high-density filter criteria</p>
            </div>
          )}
        </div>
      </HrSectionCard>

      {/* Data Cleanup Queue Section */}
      <motion.section 
        initial={{ opacity: 0 }} 
        whileInView={{ opacity: 1 }} 
        viewport={{ once: true }}
        className="mt-8 z-soft-panel p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="inline-flex items-center gap-2 text-sm font-black text-[#134e4a]">
            <Sparkles size={16} className="text-orange-500" />
            Remediation Queue
          </h3>
          <span className="px-2 py-0.5 rounded-full bg-[#134e4a]/10 text-[#134e4a] text-[10px] font-black uppercase">
            {queue.length} Pending Actions
          </span>
        </div>
        
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence>
            {queue.slice(0, 12).map((item) => (
              <motion.div 
                key={item.userId}
                variants={itemVars}
                initial="hidden"
                animate="show"
                className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-white/50 p-3 hover:border-slate-200 hover:bg-white transition-all group"
              >
                <div className="min-w-0">
                  <p className="text-xs font-black text-slate-800 truncate">{item.displayName}</p>
                  <p className="text-[10px] font-bold text-slate-400">{(item.suggestedActions || []).join(' • ') || 'Manual Review'}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  {item.qualityFlags?.needsBranchMapping && (
                    <button
                      type="button"
                      onClick={() => resolveCleanup(item, 'map_branch_alias', 'BR-KAD')}
                      className="rounded-lg bg-slate-900 px-3 py-1.5 text-[9px] font-black text-white hover:scale-105 active:scale-95 transition-transform"
                    >
                      Map
                    </button>
                  )}
                  {item.qualityFlags?.invalidCategory && (
                    <button
                      type="button"
                      onClick={() => resolveCleanup(item, 'normalize_employment_type', 'permanent')}
                      className="rounded-lg bg-[#134e4a] px-3 py-1.5 text-[9px] font-black text-white hover:scale-105 active:scale-95 transition-transform"
                    >
                      Norm.
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {queue.length === 0 && !busy && (
            <div className="col-span-full py-8 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
              <ShieldCheck size={24} className="mx-auto mb-2 text-emerald-500 opacity-40" />
              <p className="text-xs font-bold text-slate-400">Data integrity metrics are within enterprise tolerance levels.</p>
            </div>
          )}
        </div>
      </motion.section>
    </MainPanel>
  );
}
