import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, Save, Shield, User } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { WORKSPACE_DEPARTMENT_LABELS } from '../../lib/departmentWorkspace';

/** Match server `MAX_AVATAR_URL_LEN` — base64 data URLs count as string length. */
const MAX_AVATAR_CHARS = 180_000;

export default function SettingsProfilePanel() {
  const { show: showToast } = useToast();
  const ws = useWorkspace();
  const currentUser = ws?.session?.user;
  const permissions = ws?.permissions ?? [];
  const canMutate = ws?.canMutate !== false;
  const showTeamTab = Boolean(ws?.hasPermission?.('settings.view'));

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDisplayName(currentUser?.displayName ?? '');
    setEmail(currentUser?.email ?? '');
    setAvatarUrl(currentUser?.avatarUrl ?? '');
  }, [
    currentUser?.id,
    currentUser?.displayName,
    currentUser?.email,
    currentUser?.avatarUrl,
    ws?.refreshEpoch,
  ]);

  const onAvatarFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!/^image\/(png|jpeg|jpg|webp)$/i.test(f.type)) {
      showToast('Use PNG, JPEG, or WebP.', { variant: 'error' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result || '');
      if (s.length > MAX_AVATAR_CHARS) {
        showToast('Image is too large. Use a smaller file or an https image URL.', { variant: 'error' });
        return;
      }
      setAvatarUrl(s);
    };
    reader.readAsDataURL(f);
  };

  const submitProfile = async (e) => {
    e.preventDefault();
    const name = displayName.trim();
    if (name.length < 1) {
      showToast('Display name is required.', { variant: 'error' });
      return;
    }
    if (!canMutate) {
      showToast('Reconnect to the server before saving.', { variant: 'error' });
      return;
    }
    setSaving(true);
    try {
      const r = await ws?.updateProfile?.({
        displayName: name,
        email: email.trim() ? email.trim().toLowerCase() : null,
        avatarUrl: avatarUrl.trim() ? avatarUrl.trim() : null,
      });
      if (!r?.ok) {
        showToast(r?.error || 'Could not save profile.', { variant: 'error' });
        return;
      }
      showToast('Profile saved.');
    } finally {
      setSaving(false);
    }
  };

  const showAvatarPreview = Boolean(avatarUrl && (avatarUrl.startsWith('https://') || avatarUrl.startsWith('data:image/')));

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm">
        <h3 className="z-section-title flex items-center gap-2">
          <User size={14} /> Your profile
        </h3>
        <p className="text-xs text-gray-500 mb-4 leading-relaxed">
          How you appear in the app. This is separate from HR employment records. Password changes are under{' '}
          <Link to="/settings/security" className="font-semibold text-[#134e4a] underline-offset-2 hover:underline">
            Security
          </Link>
          .
        </p>

        <form className="space-y-4 max-w-xl" onSubmit={submitProfile}>
          <div>
            <label className="z-field-label">Display name</label>
            <input
              className="z-input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={120}
              autoComplete="name"
              disabled={!canMutate}
            />
          </div>
          <div>
            <label className="z-field-label">Email (optional)</label>
            <input
              type="email"
              className="z-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@company.com"
              disabled={!canMutate}
            />
          </div>

          <div>
            <label className="z-field-label">Profile image</label>
            <p className="text-[11px] text-slate-500 mb-2">
              Paste an <span className="font-medium">https</span> URL, or upload a small PNG, JPEG, or WebP.
            </p>
            <div className="flex flex-wrap items-start gap-4">
              {showAvatarPreview ? (
                <img
                  src={avatarUrl}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-2xl border border-slate-200 object-cover bg-slate-100"
                />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-[10px] text-slate-400">
                  No image
                </div>
              )}
              <div className="min-w-0 flex-1 space-y-2">
                <input
                  type="url"
                  className="z-input"
                  value={avatarUrl.startsWith('data:') ? '' : avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://…"
                  disabled={!canMutate}
                />
                <div className="flex flex-wrap gap-2">
                  <label className="z-btn-secondary !px-3 !py-1.5 !text-[11px] cursor-pointer">
                    Upload file
                    <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" className="hidden" onChange={onAvatarFile} disabled={!canMutate} />
                  </label>
                  {avatarUrl ? (
                    <button
                      type="button"
                      className="z-btn-secondary !px-3 !py-1.5 !text-[11px]"
                      disabled={!canMutate}
                      onClick={() => setAvatarUrl('')}
                    >
                      Remove image
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button type="submit" className="z-btn-primary gap-2" disabled={saving || !canMutate}>
              <Save size={16} /> {saving ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm">
        <h3 className="z-section-title flex items-center gap-2">
          <Shield size={14} /> Access (read-only)
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Role and permissions are assigned by an administrator. Workspace department affects shortcuts and the
          team guide.
        </p>
        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-1">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Role</p>
          <p className="text-sm font-black text-[#134e4a]">{currentUser?.roleLabel || 'No active role'}</p>
          {currentUser?.department ? (
            <p className="text-[11px] font-bold uppercase tracking-wide text-teal-800/90 pt-1">
              Workspace dept:{' '}
              {WORKSPACE_DEPARTMENT_LABELS[currentUser.department] || currentUser.department}
            </p>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {permissions.map((perm) => (
            <span
              key={perm}
              className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-[#134e4a]"
            >
              {perm}
            </span>
          ))}
        </div>
        <p className="mt-5 text-[11px] text-slate-500 leading-relaxed">
          For payroll and HR compliance, use{' '}
          <Link to="/hr" className="font-semibold text-[#134e4a] underline-offset-2 hover:underline">
            HR
          </Link>
          .{' '}
          {showTeamTab ? (
            <>
              Manage app logins under{' '}
              <Link
                to="/settings/team"
                className="font-semibold text-[#134e4a] underline-offset-2 hover:underline"
              >
                Team & access
              </Link>
              .
            </>
          ) : (
            <>Team directory is available to administrators.</>
          )}
        </p>
        <div className="mt-4">
          <Link
            to="/settings/security"
            className="inline-flex items-center gap-2 text-xs font-semibold text-[#134e4a] hover:underline"
          >
            <Lock size={14} /> Change password
          </Link>
        </div>
      </div>
    </div>
  );
}
