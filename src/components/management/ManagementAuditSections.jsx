import React, { Fragment } from 'react';
import { RefreshCw } from 'lucide-react';
import { flattenQuotationLineItems, ledgerTypeStyle } from '../../lib/managerDashboardCore';

function auditUi(appearance) {
  const L = appearance === 'light';
  return {
    L,
    spin: L ? 'text-[#134e4a]' : 'text-teal-400',
    err: L ? 'text-xs text-rose-600' : 'text-xs text-rose-300/90',
    sec: L ? 'mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500' : 'mb-2 text-[10px] font-black uppercase tracking-widest text-white/40',
    secTeal: L
      ? 'mb-2 text-[10px] font-black uppercase tracking-widest text-[#134e4a]'
      : 'mb-2 text-[10px] font-black uppercase tracking-widest text-teal-300/90',
    card: L ? 'rounded-lg border border-slate-200 bg-white px-2.5 py-2 shadow-sm' : 'rounded-xl border border-white/10 bg-white/[0.07] p-3',
    cardSoft: L ? 'rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2' : 'rounded-xl border border-white/10 bg-white/[0.06] p-3',
    divide: L ? 'divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden bg-white' : 'divide-y divide-white/10 rounded-xl border border-white/10 overflow-hidden',
    lineRow: L ? 'flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-[11px]' : 'flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-[11px]',
    cat: L ? 'mr-2 text-[8px] font-black uppercase text-slate-400' : 'mr-2 text-[8px] font-black uppercase text-white/30',
    name: L ? 'font-semibold text-slate-900' : 'font-semibold text-white',
    qty: L ? 'ml-1 text-slate-500' : 'ml-1 text-white/45',
    amt: L ? 'shrink-0 text-right tabular-nums text-slate-700' : 'shrink-0 text-right tabular-nums text-white/80',
    empty: L ? 'py-2 text-xs text-slate-500' : 'py-2 text-xs text-white/35',
    ledgerMeta: L ? 'mt-1 text-[10px] text-slate-600' : 'mt-1 text-[10px] text-white/45',
    ledgerSub: L ? 'mt-0.5 font-mono text-[9px] text-slate-400' : 'mt-0.5 font-mono text-[9px] text-white/30',
    ledgerNote: L ? 'mt-1 text-[9px] leading-snug text-slate-500' : 'mt-1 text-[9px] leading-snug text-white/35',
    ledgerWhen: L ? 'mt-1 text-[9px] text-slate-400' : 'mt-1 text-[9px] text-white/25',
    refundCard: L
      ? 'rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-[11px]'
      : 'rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-[11px]',
    refundId: L ? 'font-mono font-bold text-amber-950' : 'font-mono font-bold text-amber-100',
    refundAmt: L ? 'font-black tabular-nums text-amber-900' : 'font-black tabular-nums text-amber-200',
    refundMeta: L ? 'mt-1 text-slate-700' : 'mt-1 text-white/60',
    refundWhen: L ? 'mt-1 text-[10px] text-slate-500' : 'mt-1 text-[10px] text-white/40',
    refundReason: L ? 'mt-2 text-[10px] leading-snug text-slate-600' : 'mt-2 text-[10px] leading-snug text-white/45',
    meterPaid: L
      ? 'rounded-lg border border-emerald-200 bg-emerald-50/60 px-2.5 py-2'
      : 'rounded-xl border border-teal-500/20 bg-teal-500/10 p-3',
    meterLabel: L ? 'text-[8px] font-bold uppercase text-emerald-900/80' : 'text-[9px] font-bold uppercase text-teal-200/80',
    meterValue: L ? 'mt-0.5 text-sm font-bold tabular-nums text-slate-900' : 'mt-1 text-lg font-black tabular-nums text-white',
    meterNeutral: L ? 'rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2' : 'rounded-xl border border-white/10 bg-white/[0.06] p-3',
    meterLabelN: L ? 'text-[9px] font-bold uppercase text-slate-500' : 'text-[9px] font-bold uppercase text-white/35',
    meterValueN: L ? 'mt-0.5 text-sm font-bold tabular-nums text-slate-800' : 'mt-1 text-lg font-black tabular-nums text-white/90',
    clStatusDraft: L ? 'rounded-md bg-amber-100 px-2 py-0.5 text-[8px] font-black uppercase text-amber-900' : 'rounded-md bg-amber-500/20 px-2 py-0.5 text-[8px] font-black uppercase text-amber-300',
    clStatusOk: L ? 'rounded-md bg-emerald-100 px-2 py-0.5 text-[8px] font-black uppercase text-emerald-800' : 'rounded-md bg-emerald-500/20 px-2 py-0.5 text-[8px] font-black uppercase text-emerald-300',
    clDate: L ? 'text-[9px] text-slate-400' : 'text-[9px] text-white/35',
    clId: L ? 'text-xs font-bold text-slate-900' : 'text-xs font-bold text-white',
    clM: L ? 'mt-1 tabular-nums text-[10px] text-slate-500' : 'mt-1 tabular-nums text-[10px] text-white/40',
    jobWrap: L ? 'overflow-hidden rounded-xl border border-slate-200 bg-slate-50' : 'overflow-hidden rounded-xl border border-white/10 bg-white/[0.05]',
    jobHead: L ? 'border-b border-slate-200 p-3' : 'border-b border-white/10 p-3',
    jobId: L ? 'font-mono text-xs font-black text-slate-900' : 'font-mono text-xs font-black text-white',
    jobStatus: L
      ? 'rounded-md bg-slate-200 px-2 py-0.5 text-[8px] font-black uppercase text-slate-700'
      : 'rounded-md bg-white/10 px-2 py-0.5 text-[8px] font-black uppercase text-white/70',
    jobProduct: L ? 'mt-1 text-[11px] font-bold text-slate-800' : 'mt-1 text-[11px] font-bold text-white/90',
    jobSub: L ? 'mt-1 text-[10px] text-slate-500' : 'mt-1 text-[10px] text-white/40',
    jobNums: L ? 'mt-2 flex flex-wrap gap-3 text-[10px] tabular-nums text-slate-600' : 'mt-2 flex flex-wrap gap-3 text-[10px] tabular-nums text-white/70',
    convAlert: L ? 'mt-2 text-[9px] text-violet-800' : 'mt-2 text-[9px] text-violet-300/90',
    done: L ? 'mt-1 text-[9px] text-slate-400' : 'mt-1 text-[9px] text-white/30',
    sign: L ? 'mt-1 text-[9px] text-emerald-800' : 'mt-1 text-[9px] text-emerald-300/80',
    coilBox: L ? 'border-b border-slate-100 bg-slate-100/60 px-3 py-2' : 'border-b border-white/5 bg-black/20 px-3 py-2',
    coilTitle: L ? 'mb-1 text-[9px] font-black uppercase text-slate-500' : 'mb-1 text-[9px] font-black uppercase text-white/35',
    coilLi: L ? 'flex justify-between gap-2 text-[10px] text-slate-600' : 'flex justify-between gap-2 text-[10px] text-white/60',
    coilMono: L ? 'truncate font-mono text-slate-800' : 'truncate font-mono text-white/70',
    chkBox: L ? 'bg-slate-100/80 px-3 py-2' : 'bg-black/25 px-3 py-2',
    chkLi: L ? 'text-[10px] text-slate-600' : 'text-[10px] text-white/55',
    chkMono: L ? 'font-mono text-slate-800' : 'font-mono text-white/70',
    mgrRow: L ? 'mt-2 flex flex-wrap gap-2 text-[9px] text-slate-500' : 'mt-2 flex flex-wrap gap-2 text-[9px] text-white/40',
    mgrFlag: L ? 'text-rose-600' : 'text-rose-300/90',
    project: L ? 'text-[11px] text-slate-600' : 'text-[11px] text-white/50',
    projectB: L ? 'font-bold text-slate-800' : 'font-bold text-white/70',
  };
}

/**
 * Rich audit body for quotation-linked management intel.
 * @param {{ appearance?: 'dark' | 'light' }} props — `light` matches workspace / Office slide-overs; Manager uses default `dark`.
 */
export function ManagementAuditSections({ auditData, loadingAudit, formatNgn, appearance = 'dark' }) {
  const u = auditUi(appearance);
  const ledgerTheme = u.L ? 'light' : 'dark';

  if (loadingAudit) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className={`${u.spin} animate-spin`} size={28} />
      </div>
    );
  }
  if (!auditData || auditData.ok === false) {
    return <p className={u.err}>{auditData?.error || 'Could not load quotation audit.'}</p>;
  }

  const sum = auditData.summary;
  const lines = flattenQuotationLineItems(auditData.quotation);
  const ledger = Array.isArray(auditData.ledgerEntries) ? auditData.ledgerEntries : [];
  const refunds = Array.isArray(auditData.refunds) ? auditData.refunds : [];
  const totals = auditData.totals || {};
  const checks = Array.isArray(auditData.conversionChecks) ? auditData.conversionChecks : [];
  const coils = Array.isArray(auditData.jobCoils) ? auditData.jobCoils : [];

  const checksByJob = new Map();
  for (const c of checks) {
    const jid = String(c.job_id || '');
    if (!jid) continue;
    if (!checksByJob.has(jid)) checksByJob.set(jid, []);
    checksByJob.get(jid).push(c);
  }
  const coilsByJob = new Map();
  for (const c of coils) {
    const jid = String(c.job_id || '');
    if (!jid) continue;
    if (!coilsByJob.has(jid)) coilsByJob.set(jid, []);
    coilsByJob.get(jid).push(c);
  }

  const cuttingLists = Array.isArray(auditData.cuttingLists) ? auditData.cuttingLists : [];
  const productionLogs = Array.isArray(auditData.productionLogs) ? auditData.productionLogs : [];

  return (
    <Fragment>
      {sum ? (
        <section>
          <p className={u.sec}>Order &amp; balance</p>
          <div className={`grid grid-cols-1 sm:grid-cols-3 ${u.L ? 'gap-1.5' : 'gap-2'}`}>
            <div className={u.card}>
              <p className={u.meterLabelN}>Order total</p>
              <p className={u.meterValue}>{formatNgn(sum.orderTotalNgn)}</p>
            </div>
            <div className={u.meterPaid}>
              <p className={u.meterLabel}>Paid in</p>
              <p
                className={
                  u.L
                    ? 'mt-0.5 text-sm font-bold tabular-nums text-emerald-800'
                    : 'mt-1 text-lg font-black tabular-nums text-emerald-300'
                }
              >
                {formatNgn(sum.paidNgn)}
              </p>
              {sum.percentPaid != null ? (
                <p className={`mt-1 text-[9px] tabular-nums ${u.L ? 'text-slate-500' : 'text-white/40'}`}>
                  {sum.percentPaid}% of order
                </p>
              ) : null}
            </div>
            <div
              className={
                u.L
                  ? 'rounded-lg border border-amber-200 bg-amber-50/70 px-2.5 py-2 shadow-sm'
                  : 'rounded-xl border border-amber-500/20 bg-white/[0.07] p-3'
              }
            >
              <p className={u.meterLabelN}>Outstanding</p>
              <p className={`mt-0.5 text-sm font-bold tabular-nums ${u.L ? 'text-amber-900' : 'text-amber-200'}`}>
                {formatNgn(sum.outstandingNgn)}
              </p>
            </div>
          </div>
          {(sum.managerClearedAtIso || sum.managerFlaggedAtIso || sum.managerProductionApprovedAtIso) && (
            <div className={u.mgrRow}>
              {sum.managerClearedAtIso ? <span>Cleared {sum.managerClearedAtIso.slice(0, 10)}</span> : null}
              {sum.managerProductionApprovedAtIso ? (
                <span>Prod override {sum.managerProductionApprovedAtIso.slice(0, 10)}</span>
              ) : null}
              {sum.managerFlaggedAtIso ? (
                <span className={u.mgrFlag}>Flagged {sum.managerFlaggedAtIso.slice(0, 10)}</span>
              ) : null}
            </div>
          )}
        </section>
      ) : null}

      {auditData.quotation?.projectName ? (
        <p className={u.project}>
          <span className={u.projectB}>Project:</span> {auditData.quotation.projectName}
        </p>
      ) : null}

      <section>
        <p className={u.sec}>Order lines</p>
        {lines.length === 0 ? (
          <p className={u.empty}>No structured line items on file (check Sales for full quote).</p>
        ) : (
          <div className={u.divide}>
            {lines.map((ln, idx) => (
              <div key={`${ln.category}-${idx}`} className={u.lineRow}>
                <div className="min-w-0">
                  <span className={u.cat}>{ln.category}</span>
                  <span className={u.name}>{ln.name}</span>
                  <span className={u.qty}>
                    {ln.qty !== '' && ln.qty != null ? `${ln.qty}${ln.unit ? ` ${ln.unit}` : ''}` : ''}
                  </span>
                </div>
                <div className={u.amt}>
                  {ln.lineTotal !== '' && ln.lineTotal != null
                    ? formatNgn(ln.lineTotal)
                    : ln.unitPrice
                      ? `@ ${formatNgn(ln.unitPrice)}`
                      : '—'}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <p className={u.sec}>Ledger &amp; payments ({ledger.length})</p>
        <div className="custom-scrollbar max-h-[min(40vh,280px)] overflow-y-auto pr-1">
          {ledger.length === 0 ? (
            <p className={u.empty}>No ledger rows for this quotation.</p>
          ) : u.L ? (
            <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
              {ledger.map((e, idx) => {
                const hint = [e.payment_method, e.purpose, e.bank_reference, e.note].filter(Boolean).join(' · ');
                return (
                  <div
                    key={e.id || idx}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5"
                    title={hint || undefined}
                  >
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[7px] font-black uppercase ${ledgerTypeStyle(e.type, ledgerTheme)}`}
                    >
                      {(e.type || '—').slice(0, 12)}
                    </span>
                    <p className="min-w-0 flex-1 truncate text-right text-xs font-semibold tabular-nums text-slate-900">
                      {formatNgn(e.amount_ngn)}
                    </p>
                    <span className="shrink-0 font-mono text-[9px] text-slate-400">
                      {e.at_iso?.slice(0, 10) || '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">
              {ledger.map((e, idx) => (
                <div key={e.id || idx} className={u.cardSoft}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-md px-2 py-0.5 text-[8px] font-black uppercase ${ledgerTypeStyle(e.type, ledgerTheme)}`}>
                        {e.type || '—'}
                      </span>
                      <p className={`text-sm font-black tabular-nums ${u.L ? 'text-slate-900' : 'text-white'}`}>
                        {formatNgn(e.amount_ngn)}
                      </p>
                    </div>
                    <p className={u.ledgerMeta}>{e.payment_method || e.purpose || '—'}</p>
                    {e.bank_reference ? <p className={u.ledgerSub}>Ref: {e.bank_reference}</p> : null}
                    {e.note ? <p className={u.ledgerNote}>{e.note}</p> : null}
                    <p className={u.ledgerWhen}>
                      {e.at_iso?.slice(0, 16)?.replace('T', ' ')} · {e.created_by_name || '—'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {refunds.length ? (
        <section>
          <p className={u.sec}>Refunds on this quote</p>
          <div className="space-y-2">
            {refunds.map((r) => (
              <div key={r.refund_id} className={u.refundCard}>
                <div className="flex justify-between gap-2">
                  <span className={u.refundId}>{r.refund_id}</span>
                  <span className={u.refundAmt}>{formatNgn(r.amount_ngn)}</span>
                </div>
                <p className={u.refundMeta}>
                  {r.status} · {r.product || '—'}
                </p>
                <p className={u.refundWhen}>{r.requested_at_iso?.slice(0, 16)?.replace('T', ' ')}</p>
                {r.reason ? <p className={u.refundReason}>{r.reason}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <p className={u.secTeal}>Metres &amp; production totals</p>
        <div className={`grid grid-cols-1 sm:grid-cols-3 ${u.L ? 'gap-1.5' : 'gap-2'}`}>
          <div className={u.meterPaid}>
            <p className={u.meterLabel}>Cutting lists (planned)</p>
            <p className={u.meterValue}>{Number(totals.cuttingListMetersSum || 0).toLocaleString()} m</p>
          </div>
          <div className={u.meterPaid}>
            <p className={u.meterLabel}>Produced (completed jobs)</p>
            <p className={u.meterValue}>{Number(totals.completedProductionMetersSum || 0).toLocaleString()} m</p>
          </div>
          <div className={u.meterNeutral}>
            <p className={u.meterLabelN}>All job actuals</p>
            <p className={u.meterValueN}>{Number(totals.productionJobsMetersSum || 0).toLocaleString()} m</p>
          </div>
        </div>
      </section>

      <section>
        <p className={u.sec}>Cutting lists</p>
        <div className="space-y-2">
          {!cuttingLists.length ? (
            <p className={u.empty}>None linked.</p>
          ) : (
            cuttingLists.map((cl, idx) => (
              <div key={cl.id || idx} className={u.cardSoft}>
                <div className="mb-1 flex items-start justify-between gap-2">
                  <span className={cl.status === 'Draft' ? u.clStatusDraft : u.clStatusOk}>{cl.status}</span>
                  <span className={u.clDate}>{cl.date_iso}</span>
                </div>
                <p className={u.clId}>{cl.id}</p>
                <p className={u.clM}>{Number(cl.total_meters || 0).toLocaleString()} m</p>
              </div>
            ))
          )}
        </div>
      </section>

      <section>
        <p className={u.sec}>Production &amp; conversion</p>
        <div className="space-y-3">
          {!productionLogs.length ? (
            <p className={u.empty}>No production jobs for this quotation.</p>
          ) : (
            productionLogs.map((job, idx) => {
              const jid = String(job.job_id || idx);
              const jobChecks = checksByJob.get(job.job_id) || [];
              const jobCoilRows = coilsByJob.get(job.job_id) || [];
              return (
                <div key={job.job_id || idx} className={u.jobWrap}>
                  <div className={u.jobHead}>
                    <div className="flex flex-wrap justify-between gap-2">
                      <p className={u.jobId}>{job.job_id}</p>
                      <span className={u.jobStatus}>{job.status}</span>
                    </div>
                    <p className={u.jobProduct}>{job.product_name || '—'}</p>
                    <p className={u.jobSub}>
                      List {job.cutting_list_id || '—'} · {job.machine_name || '—'}
                    </p>
                    <div className={u.jobNums}>
                      <span>Planned {Number(job.planned_meters || 0).toLocaleString()} m</span>
                      <span>Actual {Number(job.actual_meters || 0).toLocaleString()} m</span>
                      <span>{Number(job.actual_weight_kg || 0).toLocaleString()} kg</span>
                    </div>
                    <p className={u.convAlert}>
                      Conversion alert: {job.conversion_alert_state || '—'}
                      {job.manager_review_required ? ' · manager review' : ''}
                    </p>
                    {job.completed_at_iso ? (
                      <p className={u.done}>Done {job.completed_at_iso.slice(0, 16).replace('T', ' ')}</p>
                    ) : null}
                    {job.manager_review_signed_at_iso ? (
                      <p className={u.sign}>Signed off {job.manager_review_signed_at_iso.slice(0, 10)}</p>
                    ) : null}
                  </div>
                  {jobCoilRows.length ? (
                    <div className={u.coilBox}>
                      <p className={u.coilTitle}>Coils / meters</p>
                      <ul className="space-y-1">
                        {jobCoilRows.map((co) => (
                          <li key={`${jid}-${co.coil_no}`} className={u.coilLi}>
                            <span className={u.coilMono}>{co.coil_no}</span>
                            <span className="shrink-0 tabular-nums">{Number(co.meters_produced || 0).toLocaleString()} m</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {jobChecks.length ? (
                    <div className={u.chkBox}>
                      <p className={u.coilTitle}>Conversion checks</p>
                      <ul className="space-y-1.5">
                        {jobChecks.map((ch, i) => (
                          <li key={`${ch.job_id}-${ch.coil_no}-${i}`} className={u.chkLi}>
                            <span className={u.chkMono}>{ch.coil_no}</span> · {ch.alert_state} · actual{' '}
                            {ch.actual_conversion_kg_per_m != null ? Number(ch.actual_conversion_kg_per_m).toFixed(3) : '—'} kg/m
                            {ch.standard_conversion_kg_per_m != null
                              ? ` · std ${Number(ch.standard_conversion_kg_per_m).toFixed(3)}`
                              : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </section>
    </Fragment>
  );
}
