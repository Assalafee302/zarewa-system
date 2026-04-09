import { useCallback, useEffect, useMemo, useState } from 'react';

/** Max rows rendered at once — keeps lists light for re-renders. */
export const APP_DATA_TABLE_PAGE_SIZE = 20;

/**
 * @template T
 * @param {T[]} items
 * @param {number} [pageSize]
 * @param {...unknown} resetDeps when any value changes vs last render, page resets to 0 (pass primitives, e.g. filter string)
 */
export function useAppTablePaging(items, pageSize = APP_DATA_TABLE_PAGE_SIZE, ...resetDeps) {
  const [page, setPage] = useState(0);
  const total = items?.length ?? 0;

  useEffect(() => {
    setPage(0);
  }, resetDeps);

  const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);
  const safePage = Math.min(page, Math.max(0, totalPages - 1));
  const start = safePage * pageSize;
  const slice = useMemo(() => (items || []).slice(start, start + pageSize), [items, start, pageSize]);

  useEffect(() => {
    setPage((p) => Math.min(p, Math.max(0, totalPages - 1)));
  }, [totalPages]);

  const setSafePage = useCallback(
    (p) => {
      setPage(Math.max(0, Math.min(p, totalPages - 1)));
    },
    [totalPages]
  );

  const goPrev = useCallback(() => setSafePage(safePage - 1), [safePage, setSafePage]);
  const goNext = useCallback(() => setSafePage(safePage + 1), [safePage, setSafePage]);

  const showingFrom = total === 0 ? 0 : start + 1;
  const showingTo = Math.min(start + pageSize, total);

  return {
    page: safePage,
    pageSize,
    slice,
    total,
    totalPages,
    showingFrom,
    showingTo,
    goPrev,
    goNext,
    hasPrev: safePage > 0,
    hasNext: start + pageSize < total,
  };
}
