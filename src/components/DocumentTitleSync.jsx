import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useWorkspace } from '../context/WorkspaceContext';
import { DOCUMENT_TITLE_BASE, documentTitleForPath } from '../lib/documentTitle';

/**
 * Keeps document.title in sync with route and auth state (inside Router + WorkspaceProvider).
 */
export default function DocumentTitleSync() {
  const { pathname } = useLocation();
  const ws = useWorkspace();
  const hasWs = Boolean(ws);
  const authRequired = ws?.authRequired;
  const status = ws?.status;
  const snapshot = ws?.snapshot;

  useEffect(() => {
    if (!hasWs) {
      document.title = `Loading | ${DOCUMENT_TITLE_BASE}`;
      return;
    }
    if (status === 'checking') {
      document.title = `Preparing workspace | ${DOCUMENT_TITLE_BASE}`;
      return;
    }
    if (status === 'bootstrap_starting') {
      document.title = `Sign in | ${DOCUMENT_TITLE_BASE}`;
      return;
    }
    if (authRequired || (status === 'offline' && !snapshot)) {
      document.title = `Sign in | ${DOCUMENT_TITLE_BASE}`;
      return;
    }
    document.title = documentTitleForPath(pathname);
  }, [pathname, hasWs, authRequired, status, snapshot]);

  return null;
}
