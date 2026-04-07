import React, { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Settings2, UserPlus } from 'lucide-react';
import { ModalFrame } from '../layout';
import { apiFetch } from '../../lib/apiBase';
import { useToast } from '../../context/ToastContext';
import { WORKSPACE_DEPARTMENT_IDS, WORKSPACE_DEPARTMENT_LABELS } from '../../lib/departmentWorkspace';
import { APP_DATA_TABLE_PAGE_SIZE, useAppTablePaging } from '../../lib/appDataTable';
import { AppTablePager } from '../ui/AppDataTable';
import { EditSecondApprovalInline } from '../EditSecondApprovalInline';

/**
 * Admin UI: assign role, status, and granular permissions (settings.view).
 * @param {{ appUsers: object[]; currentUserId?: string; onRefresh?: () => Promise<unknown> }} props
 */
export default function TeamAccessPanel({ appUsers, currentUserId, onRefresh }) {
  const { show: showToast } = useToast();
  const [rolesMeta, setRolesMeta] = useState([]);
  const [permissionKeys, setPermissionKeys] = useState([]);
  const [metaLoading, setMetaLoading] = useState(true);
  const [rowBusyId, setRowBusyId] = useState('');

  const [permModalUser, setPermModalUser] = useState(null);
  const [draftPerms, setDraftPerms] = useState([]);
  const [fullAccess, setFullAccess] = useState(false);
  const [permSaving, setPermSaving] = useState(false);
  const [userEditAidById, setUserEditAidById] = useState({});
  const [permModalEditApprovalId, setPermModalEditApprovalId] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createForm, setCreateForm] = useState({
    username: '',
    displayName: '',
    password: '',
    roleKey: 'viewer',
    department: 'general',
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setMetaLoading(true);
      const { ok, data } = await apiFetch('/api/roles');
      if (cancelled) return;
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Could not load roles.', { variant: 'error' });
        setMetaLoading(false);
        return;
      }
      setRolesMeta(Array.isArray(data.roles) ? data.roles : []);
      setPermissionKeys(Array.isArray(data.permissionKeys) ? data.permissionKeys : []);
      setMetaLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  const roleOptions = useMemo(() => {
    if (rolesMeta.length) return rolesMeta;
    const keys = [...new Set(appUsers.map((u) => String(u.roleKey || '')))].filter(Boolean).sort();
    return keys.map((key) => ({ key, label: key, permissions: [] }));
  }, [rolesMeta, appUsers]);

  const roleLabelByKey = useMemo(() => {
    const m = new Map();
    for (const r of roleOptions) {
      m.set(r.key, r.label || r.key);
    }
    return m;
  }, [roleOptions]);

  const permissionsForRoleKey = useCallback(
    (roleKey) => {
      const r = roleOptions.find((x) => x.key === roleKey);
      return r?.permissions ? [...r.permissions] : [];
    },
    [roleOptions]
  );

  const sortedKeysForUi = useMemo(() => {
    return [...permissionKeys].sort((a, b) => {
      if (a === '*') return -1;
      if (b === '*') return 1;
      return a.localeCompare(b);
    });
  }, [permissionKeys]);

  const userPage = useAppTablePaging(
    Array.isArray(appUsers) ? appUsers : [],
    APP_DATA_TABLE_PAGE_SIZE,
    appUsers?.length
  );
  const pagedUsers = userPage.slice;

  const refresh = async () => {
    try {
      await onRefresh?.();
    } catch {
      /* ignore */
    }
  };

  const patchRole = async (user, nextRoleKey) => {
    if (!user?.id || nextRoleKey === user.roleKey) return;
    setRowBusyId(user.id);
    try {
      const aid = String(userEditAidById[user.id] || '').trim();
      const { ok, data } = await apiFetch(`/api/users/${encodeURIComponent(user.id)}/role`, {
        method: 'PATCH',
        body: JSON.stringify({
          roleKey: nextRoleKey,
          ...(aid ? { editApprovalId: aid } : {}),
        }),
      });
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Could not update role.', { variant: 'error' });
        return;
      }
      showToast('Role updated. Custom permission overrides were cleared; the user’s access now follows the role.');
      await refresh();
    } finally {
      setRowBusyId('');
    }
  };

  const patchDepartment = async (user, nextDepartment) => {
    if (!user?.id || nextDepartment === user.department) return;
    setRowBusyId(user.id);
    try {
      const { ok, data } = await apiFetch(
        `/api/workspace/app-users/${encodeURIComponent(user.id)}/department`,
        {
          method: 'PATCH',
          body: JSON.stringify({ department: nextDepartment }),
        }
      );
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Could not update workspace department.', { variant: 'error' });
        return;
      }
      showToast('Workspace department updated.');
      await refresh();
    } finally {
      setRowBusyId('');
    }
  };

  const patchStatus = async (user, nextStatus) => {
    if (!user?.id || nextStatus === user.status) return;
    setRowBusyId(user.id);
    try {
      const aid = String(userEditAidById[user.id] || '').trim();
      const { ok, data } = await apiFetch(`/api/users/${encodeURIComponent(user.id)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: nextStatus,
          ...(aid ? { editApprovalId: aid } : {}),
        }),
      });
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Could not update status.', { variant: 'error' });
        return;
      }
      showToast(
        nextStatus === 'suspended'
          ? 'User suspended. Active sessions for this account were ended.'
          : 'User reactivated.'
      );
      await refresh();
    } finally {
      setRowBusyId('');
    }
  };

  const openPermModal = (user) => {
    setPermModalEditApprovalId('');
    const perms = Array.isArray(user.permissions) ? [...user.permissions] : [];
    const isStar = perms.includes('*');
    setPermModalUser(user);
    setFullAccess(isStar);
    setDraftPerms(isStar ? ['*'] : perms.length ? perms : permissionsForRoleKey(user.roleKey));
  };

  const closePermModal = () => {
    setPermModalUser(null);
    setPermModalEditApprovalId('');
    setDraftPerms([]);
    setFullAccess(false);
    setPermSaving(false);
  };

  const applyRoleTemplate = () => {
    if (!permModalUser) return;
    const next = permissionsForRoleKey(permModalUser.roleKey);
    setFullAccess(next.includes('*'));
    setDraftPerms(next.includes('*') ? ['*'] : [...next]);
  };

  const togglePermKey = (key) => {
    if (fullAccess) return;
    setDraftPerms((prev) => {
      const set = new Set(prev.filter((p) => p !== '*'));
      if (set.has(key)) set.delete(key);
      else set.add(key);
      return [...set].sort((a, b) => a.localeCompare(b));
    });
  };

  const savePermissions = async () => {
    if (!permModalUser?.id) return;
    const next = fullAccess ? ['*'] : draftPerms.filter(Boolean);
    if (next.length === 0) {
      showToast('Choose full access or at least one permission.', { variant: 'error' });
      return;
    }
    setPermSaving(true);
    try {
      const aid = String(permModalEditApprovalId || '').trim();
      const { ok, data } = await apiFetch(
        `/api/users/${encodeURIComponent(permModalUser.id)}/permissions`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            permissions: next,
            ...(aid ? { editApprovalId: aid } : {}),
          }),
        }
      );
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Could not save permissions.', { variant: 'error' });
        return;
      }
      showToast('Permissions saved. The user may need to refresh the app or sign in again to see all changes.');
      closePermModal();
      await refresh();
    } finally {
      setPermSaving(false);
    }
  };

  const isSelf = (id) => Boolean(currentUserId && id === currentUserId);

  const submitCreateUser = async (e) => {
    e.preventDefault();
    const username = createForm.username.trim().toLowerCase();
    const displayName = createForm.displayName.trim();
    if (!username || !displayName || !createForm.password) {
      showToast('Username, display name, and password are required.', { variant: 'error' });
      return;
    }
    setCreateBusy(true);
    try {
      const { ok, data } = await apiFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          username,
          displayName,
          password: createForm.password,
          roleKey: createForm.roleKey,
          department: createForm.department,
        }),
      });
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Could not create user.', { variant: 'error' });
        return;
      }
      showToast('User created. Share the password securely with them.');
      setCreateOpen(false);
      setCreateForm({
        username: '',
        displayName: '',
        password: '',
        roleKey: 'viewer',
        department: 'general',
      });
      await refresh();
    } finally {
      setCreateBusy(false);
    }
  };

  if (metaLoading) {
    return (
      <div className="rounded-3xl border border-slate-200/90 bg-white p-8 text-center text-sm text-slate-500">
        Loading roles…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm">
        <h3 className="z-section-title flex items-center gap-2">
          <Settings2 size={14} /> Team & access
        </h3>
        <p className="text-xs text-gray-500 mb-4 leading-relaxed">
          Assign roles and status, and fine-tune permissions when needed. Changing a role clears custom
          permission overrides and applies that role’s template. Employment and payroll data stay in HR.
        </p>

        <div className="mb-4">
          <button
            type="button"
            onClick={() => {
              setCreateForm((f) => ({
                ...f,
                roleKey: roleOptions[0]?.key || f.roleKey,
              }));
              setCreateOpen(true);
            }}
            className="z-btn-primary gap-2 !text-[11px]"
          >
            <UserPlus size={16} /> Create user
          </button>
        </div>

        {appUsers.length === 0 ? (
          <p className="text-sm text-slate-500">No users in the directory snapshot.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200/90">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-xs font-bold uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2.5">User</th>
                  <th className="px-3 py-2.5">Dept</th>
                  <th className="px-3 py-2.5">Role</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Permissions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedUsers.map((user) => {
                  const busy = rowBusyId === user.id;
                  const who = `${user.displayName} · ${user.username}${user.hasCustomPermissions ? ' · custom perms' : ''}`;
                  return (
                    <Fragment key={user.id}>
                      <tr className="bg-white/90 hover:bg-teal-50/30">
                      <td className="px-3 py-3 align-middle max-w-[14rem] whitespace-nowrap truncate" title={who}>
                        <span className="font-bold text-slate-800">{user.displayName}</span>
                        <span className="text-slate-500"> · </span>
                        <span className="font-mono text-xs text-slate-600">{user.username}</span>
                        {user.hasCustomPermissions ? (
                          <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                            Custom
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <select
                          className="z-input !py-1.5 !text-[11px] max-w-[12rem]"
                          value={user.department || 'general'}
                          disabled={busy}
                          onChange={(e) => void patchDepartment(user, e.target.value)}
                        >
                          {WORKSPACE_DEPARTMENT_IDS.map((id) => (
                            <option key={id} value={id}>
                              {WORKSPACE_DEPARTMENT_LABELS[id] || id}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <select
                          className="z-input !py-1.5 !text-[11px] max-w-[11rem]"
                          value={user.roleKey}
                          disabled={busy}
                          onChange={(e) => void patchRole(user, e.target.value)}
                        >
                          {roleOptions.map((r) => (
                            <option key={r.key} value={r.key}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <select
                          className="z-input !py-1.5 !text-[11px] max-w-[9rem]"
                          value={user.status}
                          disabled={busy || isSelf(user.id)}
                          title={isSelf(user.id) ? 'Use another administrator to suspend your account.' : ''}
                          onChange={(e) => void patchStatus(user, e.target.value)}
                        >
                          <option value="active">active</option>
                          <option value="suspended">suspended</option>
                        </select>
                      </td>
                      <td className="px-3 py-3 align-middle whitespace-nowrap">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => openPermModal(user)}
                          className="z-btn-secondary !px-3 !py-1.5 !text-[10px] gap-1"
                        >
                          <Settings2 size={14} /> Edit
                        </button>
                      </td>
                      </tr>
                      <tr className="bg-slate-50/80">
                        <td colSpan={5} className="px-3 py-2 border-b border-slate-100">
                          <EditSecondApprovalInline
                            entityKind="user"
                            entityId={user.id}
                            value={userEditAidById[user.id] || ''}
                            onChange={(v) => setUserEditAidById((prev) => ({ ...prev, [user.id]: v }))}
                            className="!p-2"
                          />
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {appUsers.length > 0 ? (
          <AppTablePager
            showingFrom={userPage.showingFrom}
            showingTo={userPage.showingTo}
            total={userPage.total}
            hasPrev={userPage.hasPrev}
            hasNext={userPage.hasNext}
            onPrev={userPage.goPrev}
            onNext={userPage.goNext}
          />
        ) : null}
      </div>

      <ModalFrame
        isOpen={createOpen}
        onClose={() => !createBusy && setCreateOpen(false)}
        title="Create app user"
        description="Creates a login with a temporary password. User must meet password rules: 12+ characters with mixed case, number, and special character."
      >
        <form
          onSubmit={submitCreateUser}
          className="w-full max-w-md rounded-[28px] border border-slate-200/90 bg-white p-6 shadow-xl space-y-3"
        >
          <div>
            <label className="z-field-label">Username</label>
            <input
              className="z-input"
              value={createForm.username}
              onChange={(e) => setCreateForm((f) => ({ ...f, username: e.target.value }))}
              autoComplete="off"
              disabled={createBusy}
            />
          </div>
          <div>
            <label className="z-field-label">Display name</label>
            <input
              className="z-input"
              value={createForm.displayName}
              onChange={(e) => setCreateForm((f) => ({ ...f, displayName: e.target.value }))}
              autoComplete="off"
              disabled={createBusy}
            />
          </div>
          <div>
            <label className="z-field-label">Initial password</label>
            <input
              type="password"
              className="z-input"
              value={createForm.password}
              onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
              autoComplete="new-password"
              disabled={createBusy}
            />
          </div>
          <div>
            <label className="z-field-label">Role</label>
            <select
              className="z-input"
              value={createForm.roleKey}
              onChange={(e) => setCreateForm((f) => ({ ...f, roleKey: e.target.value }))}
              disabled={createBusy}
            >
              {roleOptions.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="z-field-label">Workspace department</label>
            <select
              className="z-input"
              value={createForm.department}
              onChange={(e) => setCreateForm((f) => ({ ...f, department: e.target.value }))}
              disabled={createBusy}
            >
              {WORKSPACE_DEPARTMENT_IDS.map((id) => (
                <option key={id} value={id}>
                  {WORKSPACE_DEPARTMENT_LABELS[id] || id}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2 justify-end pt-2">
            <button
              type="button"
              className="z-btn-secondary !text-[11px]"
              disabled={createBusy}
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </button>
            <button type="submit" className="z-btn-primary !text-[11px]" disabled={createBusy}>
              {createBusy ? 'Creating…' : 'Create user'}
            </button>
          </div>
        </form>
      </ModalFrame>

      <ModalFrame
        isOpen={Boolean(permModalUser)}
        onClose={closePermModal}
        title={permModalUser ? `Permissions — ${permModalUser.displayName}` : 'Permissions'}
        description="Choose full access or individual permissions. Save applies to this login only."
      >
        <div className="w-full max-w-lg rounded-[28px] border border-slate-200/90 bg-white p-6 shadow-xl">
          <p className="text-[11px] text-slate-500 mb-4">
            Role:{' '}
            <span className="font-semibold text-slate-800">
              {permModalUser ? roleLabelByKey.get(permModalUser.roleKey) || permModalUser.roleKey : ''}
            </span>
          </p>

          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-[11px] font-medium text-slate-700 mb-3">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#134e4a]"
              checked={fullAccess}
              onChange={(e) => {
                const on = e.target.checked;
                setFullAccess(on);
                if (on) setDraftPerms(['*']);
                else if (permModalUser)
                  setDraftPerms(permissionsForRoleKey(permModalUser.roleKey).filter((p) => p !== '*'));
              }}
            />
            Full access (all modules) — <code className="text-[10px]">*</code>
          </label>

          {!fullAccess ? (
            <div className="max-h-[min(52vh,420px)] overflow-y-auto rounded-xl border border-slate-200/90 bg-slate-50/50 p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                {sortedKeysForUi
                  .filter((k) => k !== '*')
                  .map((key) => (
                    <label
                      key={key}
                      className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[10px] text-slate-700"
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-3.5 w-3.5 accent-[#134e4a] shrink-0"
                        checked={draftPerms.includes(key)}
                        onChange={() => togglePermKey(key)}
                      />
                      <span className="font-mono leading-snug break-all">{key}</span>
                    </label>
                  ))}
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500 mb-3">All other permission toggles are ignored while full access is on.</p>
          )}

          {permModalUser?.id ? (
            <EditSecondApprovalInline
              entityKind="user"
              entityId={permModalUser.id}
              value={permModalEditApprovalId}
              onChange={setPermModalEditApprovalId}
              className="mt-4"
            />
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2 justify-end">
            <button type="button" onClick={applyRoleTemplate} className="z-btn-secondary !text-[11px]">
              Apply role template
            </button>
            <button type="button" onClick={closePermModal} className="z-btn-secondary !text-[11px]">
              Cancel
            </button>
            <button
              type="button"
              disabled={permSaving}
              onClick={() => void savePermissions()}
              className="z-btn-primary !text-[11px]"
            >
              {permSaving ? 'Saving…' : 'Save permissions'}
            </button>
          </div>
        </div>
      </ModalFrame>
    </div>
  );
}
