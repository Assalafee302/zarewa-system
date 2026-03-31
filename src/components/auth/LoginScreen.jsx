import React, { useState } from 'react';
import { ShieldCheck, LockKeyhole, Building2, ArrowRight, AlertTriangle } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { ZAREWA_LOGO_SRC } from '../../Data/companyQuotation';

export default function LoginScreen() {
  const ws = useWorkspace();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('Admin@123');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await ws.login(username, password);
      if (!r.ok) {
        setError(r.error || 'Could not sign in.');
      }
    } catch (err) {
      setError(String(err?.message || err || 'Could not sign in.'));
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen z-app-bg px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl grid-cols-1 gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-[32px] border border-white/70 bg-white/80 p-8 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)] backdrop-blur-xl sm:p-10">
          <img
            src={ZAREWA_LOGO_SRC}
            alt=""
            className="h-14 w-auto max-w-[220px] object-contain object-left sm:h-[4.25rem]"
            width={220}
            height={68}
          />
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-teal-200/70 bg-teal-50/80 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-[#134e4a]">
            <ShieldCheck size={14} />
            Production-safe workspace
          </div>
          <h1 className="mt-6 text-3xl font-black tracking-tight text-[#134e4a] sm:text-5xl">
            Zarewa operating system
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
            Sign in to continue with live treasury controls, approval workflows, audit visibility, and the
            unified production dashboard.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              {
                title: 'Controlled postings',
                detail: 'Treasury, reversals, and payouts now require signed-in roles.',
              },
              {
                title: 'Audit visibility',
                detail: 'Sensitive actions leave an append-only trace for review.',
              },
              {
                title: 'Period protection',
                detail: 'Locked accounting periods block late postings and cash edits.',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm"
              >
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{item.title}</p>
                <p className="mt-3 text-sm font-semibold leading-6 text-slate-700">{item.detail}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-[28px] border border-slate-200/80 bg-slate-950 p-6 text-white shadow-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-400/15 text-teal-300">
                <Building2 size={22} />
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/45">
                  Initial admin access
                </p>
                <p className="mt-1 text-sm font-semibold text-white/90">
                  Use the seeded administrator account for first sign-in, then change the password in
                  Settings.
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/45">Username</p>
                <p className="mt-1 text-lg font-black tracking-tight">admin</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/45">Password</p>
                <p className="mt-1 text-lg font-black tracking-tight">Admin@123</p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[32px] border border-slate-200/80 bg-white/92 p-8 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.3)] backdrop-blur-xl sm:p-10">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#134e4a] text-[#8ef0dc] shadow-lg shadow-teal-950/20">
              <LockKeyhole size={22} />
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Secure sign in</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-[#134e4a]">Open your workspace</h2>
            </div>
          </div>

          <form className="mt-8 space-y-5" onSubmit={submit}>
            <div>
              <label className="z-field-label" htmlFor="login-username">
                Username
              </label>
              <input
                id="login-username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="z-input"
                placeholder="Enter your username"
              />
            </div>
            <div>
              <label className="z-field-label" htmlFor="login-password">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="z-input"
                placeholder="Enter your password"
              />
            </div>

            {error ? (
              <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}

            {ws.status === 'offline' ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                API server is offline. Start the backend to sign in to the live database.
              </div>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#134e4a] px-5 py-3.5 text-sm font-black text-white shadow-lg shadow-teal-950/15 transition hover:brightness-105 disabled:cursor-wait disabled:opacity-70"
            >
              {busy ? 'Signing in…' : 'Enter workspace'}
              <ArrowRight size={17} />
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
