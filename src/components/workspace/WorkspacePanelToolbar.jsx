import React from 'react';
import { Search } from 'lucide-react';

/**
 * Standard panel toolbar: title + search (left group), optional actions (right).
 * Matches the target layout for Sales / Operations list pages.
 */
export function WorkspacePanelToolbar({
  title,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search…',
  actions = null,
  className = '',
}) {
  return (
    <div
      className={`flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6 ${className}`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center min-w-0 w-full sm:flex-1">
        {title ? (
          <h2 className="text-xl font-bold text-[#134e4a] shrink-0 tracking-tight">{title}</h2>
        ) : null}
        {onSearchChange != null ? (
          <div className="relative flex-1 sm:max-w-xs min-w-0">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              size={16}
              aria-hidden
            />
            <input
              type="search"
              className="z-input-search"
              autoComplete="off"
              value={searchValue ?? ''}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
            />
          </div>
        ) : null}
      </div>
      {actions ? (
        <div className="shrink-0 flex flex-wrap items-center gap-2 lg:justify-end">{actions}</div>
      ) : null}
    </div>
  );
}
