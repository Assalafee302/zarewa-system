/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/apiBase';
import { useWorkspace } from './WorkspaceContext';

const AiAssistantContext = createContext(null);

function defaultStatus() {
  return {
    ready: false,
    enabled: false,
    allowedModes: [],
  };
}

export function AiAssistantProvider({ children }) {
  const ws = useWorkspace();
  const user = ws?.session?.user;
  const [status, setStatus] = useState(() => defaultStatus());
  const [request, setRequest] = useState(null);

  useEffect(() => {
    if (!user || String(user.roleKey || '').toLowerCase() === 'ceo') {
      setStatus({
        ready: true,
        enabled: false,
        allowedModes: [],
      });
      return undefined;
    }

    let cancelled = false;
    setStatus((prev) => ({
      ...prev,
      ready: false,
    }));
    (async () => {
      const { ok, data } = await apiFetch('/api/ai/status');
      if (cancelled) return;
      if (ok && data?.ok) {
        setStatus({
          ready: true,
          enabled: Boolean(data.enabled),
          allowedModes: Array.isArray(data.allowedModes) ? data.allowedModes : [],
        });
        return;
      }
      setStatus({
        ready: true,
        enabled: false,
        allowedModes: [],
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const openAssistant = useCallback((opts = {}) => {
    setRequest({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      autoSend: opts.autoSend !== false,
      resetConversation: Boolean(opts.resetConversation),
      mode: opts.mode || 'search',
      prompt: String(opts.prompt || ''),
      pageContext: opts.pageContext && typeof opts.pageContext === 'object' ? opts.pageContext : {},
    });
  }, []);

  const clearRequest = useCallback(() => {
    setRequest(null);
  }, []);

  const canUseMode = useCallback(
    (mode) => {
      if (!mode) return false;
      if (!status.enabled) return false;
      return status.allowedModes.includes(mode);
    },
    [status.allowedModes, status.enabled]
  );

  const value = useMemo(
    () => ({
      status,
      available: Boolean(user && status.enabled),
      allowedModes: status.allowedModes,
      canUseMode,
      request,
      openAssistant,
      clearRequest,
    }),
    [canUseMode, clearRequest, openAssistant, request, status, user]
  );

  return <AiAssistantContext.Provider value={value}>{children}</AiAssistantContext.Provider>;
}

export function useAiAssistant() {
  return useContext(AiAssistantContext);
}
