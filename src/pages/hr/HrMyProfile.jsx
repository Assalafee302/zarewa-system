import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarRange, UserCircle2, Wallet, FileText, ExternalLink } from 'lucide-react';
import { MainPanel, PageHeader } from '../../components/layout';
import { useHrWorkspace } from '../../context/HrWorkspaceContext';
import { apiFetch } from '../../lib/apiBase';
import { formatNgn } from '../../hr/hrFormat';
import HrCapsLoading from './hrCapsLoading';
import { HrSectionCard } from './hrUx';

export default function HrMyProfile() {
  const { caps } = useHrWorkspace();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState({ user: null, hr: null });

  const load = useCallback(async () => {
    setLoading(true);
    const { ok, data } = await apiFetch('/api/hr/me');
    setLoading(false);
    if (ok && data?.ok) {
      setMe({ user: data.user || null, hr: data.hr || null });
    } else {
      setMe({ user: null, hr: null });
    }
  }, []);

  useEffect(() => {
    if (caps === null || caps.enabled === false) return;
    const t = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(t);
  }, [caps, load]);

  const openLeave = () => {
    navigate('/hr/talent', { state: { openLeaveForm: true } });
  };

  const openLoan = () => {
    navigate('/hr/talent', { state: { openLoanForm: true } });
  };

  if (caps === null) return <HrCapsLoading />;

  if (caps.enabled === false) {
    return (
      <MainPanel>
        <PageHeader eyebrow="Human resources" title="My profile" subtitle="HR data is not initialised on this server." />
      </MainPanel>
    );
  }

  const u = me.user;
  const h = me.hr;

  return (
    <MainPanel>
      <PageHeader
        eyebrow="Human resources"
        title="My profile"
        subtitle="Your sign-in identity and HR file summary. Apply for leave or a staff loan from here."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openLeave}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[11px] font-black uppercase text-[#134e4a]"
            >
              <CalendarRange size={16} />
              Leave application
            </button>
            <button
              type="button"
              onClick={openLoan}
              className="inline-flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-2.5 text-[11px] font-black uppercase text-[#134e4a]"
            >
              <Wallet size={16} />
              Loan application
            </button>
          </div>
        }
      />

      {loading ? (
        <p className="text-sm text-slate-500">Loading your profile…</p>
      ) : !u ? (
        <p className="text-sm text-rose-700">Could not load your account.</p>
      ) : (
        <div className="space-y-6">
          <HrSectionCard title="Account" subtitle="How you sign in">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                <UserCircle2 className="h-10 w-10 shrink-0 text-[#134e4a]/70" />
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Name</p>
                  <p className="font-bold text-slate-900">{u.displayName || u.username}</p>
                  <p className="mt-1 text-xs text-slate-600">{u.email || '—'}</p>
                  <p className="mt-2 text-[10px] font-bold uppercase text-slate-500">
                    {u.roleLabel || u.roleKey || '—'}
                  </p>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-4 text-sm text-slate-600">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Username</p>
                <p className="font-mono text-slate-900">{u.username}</p>
              </div>
            </div>
          </HrSectionCard>

          {!h ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              No HR staff file is linked to your user yet. You can still submit leave and loan requests; HR will match
              them to your record when your file exists.
            </div>
          ) : (
            <HrSectionCard title="HR file" subtitle="On-file details (read-only here)">
              <dl className="grid gap-3 sm:grid-cols-2 text-sm">
                <div>
                  <dt className="text-[10px] font-black uppercase text-slate-400">Job title</dt>
                  <dd className="font-semibold text-slate-800">{h.jobTitle || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-black uppercase text-slate-400">Department</dt>
                  <dd className="font-semibold text-slate-800">{h.department || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-black uppercase text-slate-400">Employee no.</dt>
                  <dd className="font-semibold text-slate-800">{h.employeeNo || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-black uppercase text-slate-400">Employment</dt>
                  <dd className="font-semibold text-slate-800">{h.employmentType || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-black uppercase text-slate-400">Date joined</dt>
                  <dd className="font-semibold text-slate-800">{h.dateJoinedIso || '—'}</dd>
                </div>
                {caps?.canViewSensitiveHr ? (
                  <div className="sm:col-span-2">
                    <dt className="text-[10px] font-black uppercase text-slate-400">Package (monthly)</dt>
                    <dd className="font-semibold text-slate-800">
                      Base {formatNgn(h.baseSalaryNgn)} · Housing {formatNgn(h.housingAllowanceNgn)} · Transport{' '}
                      {formatNgn(h.transportAllowanceNgn)}
                    </dd>
                  </div>
                ) : null}
              </dl>
              <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                <Link
                  to="/hr/staff/me"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[11px] font-black uppercase text-[#134e4a] no-underline shadow-sm"
                >
                  <FileText size={16} />
                  Open full HR file
                  <ExternalLink size={14} className="opacity-60" />
                </Link>
              </div>
            </HrSectionCard>
          )}

          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600">Need something else? All request types live under Requests.</p>
            <Link
              to="/hr/talent"
              className="inline-flex items-center justify-center rounded-xl bg-[#134e4a] px-4 py-2.5 text-[11px] font-black uppercase text-white no-underline"
            >
              Go to requests
            </Link>
          </div>
        </div>
      )}
    </MainPanel>
  );
}
