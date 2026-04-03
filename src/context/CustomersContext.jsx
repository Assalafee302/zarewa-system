/* eslint-disable react-refresh/only-export-components -- context + hook pair */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/apiBase';
import { useToast } from './ToastContext';
import { useWorkspace } from './WorkspaceContext';

const CustomersContext = createContext(null);

export function CustomersProvider({ children }) {
  const ws = useWorkspace();
  const { show: showToast } = useToast();
  const [customers, setCustomers] = useState([]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const s = ws?.snapshot;
    if (!s) {
      setCustomers([]);
      return;
    }
    const list = s.customers;
    setCustomers(Array.isArray(list) ? list.map((c) => ({ ...c })) : []);
  }, [ws?.snapshot]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const addCustomer = useCallback(
    async (record) => {
      if (!ws?.canMutate) {
        showToast('Reconnect to save customers — read-only workspace.', { variant: 'info' });
        throw new Error('Read-only workspace.');
      }
      const { ok, data } = await apiFetch('/api/customers', {
        method: 'POST',
        body: JSON.stringify(record),
      });
      if (!ok || !data?.ok) throw new Error(data?.error || 'Create customer API failed');
      await ws.refresh();
      return data?.customerID || record.customerID;
    },
    [showToast, ws]
  );

  const deleteCustomer = useCallback(
    async (customerID) => {
      const id = String(customerID ?? '').trim();
      if (!id) throw new Error('Customer id required.');
      if (!ws?.canMutate) {
        showToast('Reconnect to delete customers — read-only workspace.', { variant: 'info' });
        throw new Error('Read-only workspace.');
      }
      const { ok, data } = await apiFetch(`/api/customers/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!ok || !data?.ok) {
        const err = new Error(data?.error || 'Delete customer failed');
        err.blockers = data?.blockers;
        throw err;
      }
      await ws.refresh();
    },
    [showToast, ws]
  );

  const value = useMemo(
    () => ({
      customers,
      setCustomers,
      addCustomer,
      deleteCustomer,
    }),
    [customers, addCustomer, deleteCustomer]
  );

  return <CustomersContext.Provider value={value}>{children}</CustomersContext.Provider>;
}

export function useCustomers() {
  const ctx = useContext(CustomersContext);
  if (!ctx) {
    throw new Error('useCustomers must be used within CustomersProvider');
  }
  return ctx;
}
