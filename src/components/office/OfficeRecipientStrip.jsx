import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';

/**
 * Gmail-style recipient row: chips + typeahead into directory users.
 */
export function OfficeRecipientStrip({ label, selectedIds, onChange, directory, branchNameById, placeholder }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => directory.filter((u) => selectedIds.includes(u.id)),
    [directory, selectedIds]
  );

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return directory.slice(0, 14);
    return directory
      .filter((u) => {
        const name = String(u.displayName || '').toLowerCase();
        const un = String(u.username || '').toLowerCase();
        const rk = String(u.roleKey || '').toLowerCase();
        const bn = String(branchNameById?.[u.branchId] || u.branchId || '').toLowerCase();
        return name.includes(t) || un.includes(t) || rk.includes(t) || bn.includes(t);
      })
      .slice(0, 24);
  }, [directory, q, branchNameById]);

  const add = (id) => {
    if (selectedIds.includes(id)) return;
    onChange([...selectedIds, id]);
    setQ('');
    setOpen(false);
  };
  const remove = (id) => onChange(selectedIds.filter((x) => x !== id));

  return (
    <div className="border-b border-slate-200/90 py-2.5">
      <div className="flex items-start gap-3">
        <span className="w-12 shrink-0 text-right text-[13px] font-medium text-slate-500 pt-2">{label}</span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
            {selected.map((u) => (
              <span
                key={u.id}
                className="inline-flex items-center gap-0.5 rounded-full border border-slate-200 bg-slate-100 pl-2.5 pr-1 py-0.5 text-[12px] font-medium text-slate-800"
              >
                {u.displayName || u.username}
                <button
                  type="button"
                  onClick={() => remove(u.id)}
                  className="p-0.5 rounded-full hover:bg-slate-200/80 text-slate-500"
                  aria-label={`Remove ${u.displayName}`}
                >
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
          <div className="relative">
            <input
              type="text"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => {
                setTimeout(() => setOpen(false), 200);
              }}
              placeholder={placeholder}
              className="w-full rounded-md border-0 border-b border-transparent bg-transparent px-1 py-1.5 text-[13px] outline-none focus:border-b focus:border-teal-600/50 placeholder:text-slate-400"
            />
            {open && filtered.length > 0 ? (
              <ul className="absolute z-30 mt-0.5 max-h-52 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg text-[13px]">
                {filtered.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-slate-50"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => add(u.id)}
                    >
                      <span className="font-medium text-slate-900">{u.displayName || u.username}</span>
                      <span className="text-slate-500 text-[11px] ml-2">
                        {u.roleKey || '—'}
                        {branchNameById?.[u.branchId] ? ` · ${branchNameById[u.branchId]}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
