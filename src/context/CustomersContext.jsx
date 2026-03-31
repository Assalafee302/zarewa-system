/* eslint-disable react-refresh/only-export-components -- context + hook pair */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CUSTOMERS_MOCK } from '../Data/mockData';
import { apiFetch } from '../lib/apiBase';
import { useWorkspace } from './WorkspaceContext';

const CustomersContext = createContext(null);

export function CustomersProvider({ children }) {
  const ws = useWorkspace();
  const [customers, setCustomers] = useState(() =>
    ws?.hasWorkspaceData ? [] : [...CUSTOMERS_MOCK]
  );

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const list = ws?.snapshot?.customers;
    const fromServer = ws?.hasWorkspaceData;
    if (fromServer) {
      setCustomers(Array.isArray(list) ? list.map((c) => ({ ...c })) : []);
      return;
    }
    if (!list && !fromServer) {
      setCustomers((prev) => (prev.length ? prev : [...CUSTOMERS_MOCK]));
    }
  }, [ws?.hasWorkspaceData, ws?.snapshot]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const addCustomer = useCallback(
    async (record) => {
      if (ws?.canMutate) {
        const { ok, data } = await apiFetch('/api/customers', {
          method: 'POST',
          body: JSON.stringify(record),
        });
        if (!ok || !data?.ok) throw new Error(data?.error || 'Create customer API failed');
        await ws.refresh();
        return data?.customerID || record.customerID;
      }
      setCustomers((prev) => [record, ...prev]);
      return record.customerID;
    },
    [ws?.canMutate, ws?.refresh]
  );

  const deleteCustomer = useCallback(
    async (customerID) => {
      const id = String(customerID ?? '').trim();
      if (!id) throw new Error('Customer id required.');
      if (ws?.canMutate) {
        const { ok, data } = await apiFetch(`/api/customers/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        if (!ok || !data?.ok) {
          const err = new Error(data?.error || 'Delete customer failed');
          err.blockers = data?.blockers;
          throw err;
        }
        await ws.refresh();
        return;
      }
      setCustomers((prev) => prev.filter((c) => c.customerID !== id));
    },
    [ws?.canMutate, ws?.refresh]
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
