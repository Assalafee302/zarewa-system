import React, { useEffect, useMemo, useState } from 'react';
import { useToast } from '../../context/ToastContext';
import {
  Search,
  Package,
  MapPin,
  Truck,
  Calendar,
  Hash,
  MoreVertical,
  X,
  CheckCircle2,
  Upload,
} from 'lucide-react';
import { PageTabs, ModalFrame } from '../layout';
import { EditSecondApprovalInline } from '../EditSecondApprovalInline';
import { useWorkspace } from '../../context/WorkspaceContext';
import { apiFetch } from '../../lib/apiBase';
import { WORKSPACE_TABLE_HEAD } from '../../lib/workspaceListStyle';

const STATUS_STYLES = {
  Scheduled: 'bg-slate-100 text-slate-700',
  Loading: 'bg-amber-100 text-amber-800',
  'In transit': 'bg-blue-100 text-blue-800',
  Delivered: 'bg-emerald-100 text-emerald-700',
  Exception: 'bg-red-100 text-red-700',
};

/**
 * Deliveries board embedded under Production.
 * @param {{ onShellBlur?: (open: boolean) => void }} props
 */
export default function ProductionDeliveriesTab({ onShellBlur }) {
  const { show: showToast } = useToast();
  const ws = useWorkspace();
  const [shipments, setShipments] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [createForm, setCreateForm] = useState({
    cuttingListId: '',
    destination: '',
    method: 'Company truck',
    trackingNo: '',
    shipDate: new Date().toISOString().slice(0, 10),
    eta: new Date().toISOString().slice(0, 10),
  });

  const [confirmForm, setConfirmForm] = useState({
    deliveryDate: '',
    courierName: '',
    deliveryStatus: 'Confirmed',
    customerSigned: false,
    notes: '',
  });
  const [deliveryConfirmEditApprovalId, setDeliveryConfirmEditApprovalId] = useState('');

  useEffect(() => {
    onShellBlur?.(confirmOpen || createOpen);
  }, [confirmOpen, createOpen, onShellBlur]);

   
  useEffect(() => {
    const s = ws?.snapshot;
    if (!s) {
      setShipments([]);
      return;
    }
    const list = s.deliveries;
    setShipments(Array.isArray(list) ? list.map((d) => ({ ...d })) : []);
  }, [ws?.snapshot, ws?.refreshEpoch]);
   

  const handleStatusTab = (id) => {
    setStatusFilter(id);
    setSearchQuery('');
  };

  const tabs = useMemo(
    () => [
      { id: 'all', label: 'All' },
      { id: 'Scheduled', label: 'Scheduled' },
      { id: 'In transit', label: 'In transit' },
      { id: 'Delivered', label: 'Delivered' },
    ],
    []
  );

  const availableCuttingLists = useMemo(
    () =>
      ws?.hasWorkspaceData && Array.isArray(ws?.snapshot?.cuttingLists)
        ? ws.snapshot.cuttingLists.filter((row) => row.productionRegistered)
        : [],
    [ws]
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return shipments.filter((d) => {
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      if (!q) return true;
      const blob = [
        d.id,
        d.quotationRef,
        d.customer,
        d.destination,
        d.method,
        d.trackingNo,
        d.status,
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [shipments, searchQuery, statusFilter]);

  const openConfirm = (row) => {
    setSelected(row);
    setDeliveryConfirmEditApprovalId('');
    setConfirmForm({
      deliveryDate: '',
      courierName: row.method ?? '',
      deliveryStatus: 'Confirmed',
      customerSigned: false,
      notes: '',
    });
    setConfirmOpen(true);
  };

  const openCreate = () => {
    setCreateForm({
      cuttingListId: availableCuttingLists[0]?.id ?? '',
      destination: '',
      method: 'Company truck',
      trackingNo: '',
      shipDate: new Date().toISOString().slice(0, 10),
      eta: new Date().toISOString().slice(0, 10),
    });
    setCreateOpen(true);
  };

  const submitConfirm = async (e) => {
    e.preventDefault();
    if (!selected) return;
    const nextStatus =
      confirmForm.deliveryStatus === 'Confirmed' ? 'Delivered' : selected.status;
    const id = selected.id;
    const patch = {
      ...(deliveryConfirmEditApprovalId.trim() ? { editApprovalId: deliveryConfirmEditApprovalId.trim() } : {}),
      status: nextStatus,
      deliveredDateISO: confirmForm.deliveryDate || new Date().toISOString().slice(0, 10),
      podNotes: [
        confirmForm.notes?.trim(),
        confirmForm.courierName?.trim() ? `Courier: ${confirmForm.courierName.trim()}` : '',
      ]
        .filter(Boolean)
        .join(' | '),
      courierConfirmed: Boolean(confirmForm.courierName?.trim() || selected.method),
      customerSignedPod: confirmForm.customerSigned,
    };
    if (!ws?.canMutate) {
      showToast('Reconnect to save delivery updates — read-only workspace.', { variant: 'info' });
      return;
    }
    const { ok, data } = await apiFetch(`/api/deliveries/${encodeURIComponent(id)}/confirm`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    if (!ok || !data?.ok) {
      showToast(data?.error || 'Could not save delivery confirmation.', { variant: 'error' });
      return;
    }
    await ws.refresh();
    setDeliveryConfirmEditApprovalId('');
    setConfirmOpen(false);
    setSelected(null);
    showToast(
      nextStatus === 'Delivered'
        ? `${id} marked delivered — POD saved on record.`
        : `${id} confirmation saved.`
    );
  };

  const submitCreate = async (e) => {
    e.preventDefault();
    const cuttingList = availableCuttingLists.find((row) => row.id === createForm.cuttingListId);
    if (!cuttingList) {
      showToast('Select a cutting list for dispatch.', { variant: 'error' });
      return;
    }
    if (!createForm.destination.trim()) {
      showToast('Enter the delivery destination.', { variant: 'error' });
      return;
    }
    const body = {
      cuttingListId: cuttingList.id,
      quotationRef: cuttingList.quotationRef,
      customerID: cuttingList.customerID,
      customerName: cuttingList.customer,
      destination: createForm.destination.trim(),
      method: createForm.method.trim() || 'Company truck',
      trackingNo: createForm.trackingNo.trim(),
      shipDate: createForm.shipDate,
      eta: createForm.eta,
    };
    if (!ws?.canMutate) {
      showToast('Reconnect to create dispatches — read-only workspace.', { variant: 'info' });
      return;
    }
    const { ok, data } = await apiFetch('/api/deliveries', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (!ok || !data?.ok) {
      showToast(data?.error || 'Could not create dispatch.', { variant: 'error' });
      return;
    }
    await ws.refresh();
    showToast(`Dispatch ${data.id} created from ${cuttingList.id}.`);
    setCreateOpen(false);
  };

  return (
    <>
      <div className="mb-6 space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Deliveries</p>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed max-w-xl">
              Dispatch, tracking, and proof of delivery from the live deliveries register.
            </p>
          </div>
          <div className="shrink-0 w-full lg:w-auto flex justify-start lg:justify-end">
            <PageTabs tabs={tabs} value={statusFilter} onChange={handleStatusTab} />
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-3 border-t border-slate-100">
          <div className="relative flex-1 sm:max-w-md w-full">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              size={16}
            />
            <input
              type="search"
              placeholder="Search dispatch, quote, customer, tracking…"
              className="z-input-search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 justify-end shrink-0">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              {filtered.length} shipment{filtered.length !== 1 ? 's' : ''}
            </p>
            <button
              type="button"
              onClick={openCreate}
              disabled={ws?.hasWorkspaceData && availableCuttingLists.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-[#134e4a] px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm disabled:opacity-40"
            >
              <Package size={14} /> New dispatch
            </button>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="z-empty-state">
          <Package size={48} className="mx-auto text-gray-200 mb-4" />
          <p className="text-gray-400 font-bold uppercase text-xs tracking-widest">
            No deliveries match filters
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className={WORKSPACE_TABLE_HEAD}>
            <div className="col-span-2">Dispatch</div>
            <div className="col-span-2">Quotation</div>
            <div className="col-span-2">Customer</div>
            <div className="col-span-3">Destination</div>
            <div className="col-span-2">ETA / ship</div>
            <div className="col-span-1 text-right"> </div>
          </div>
          {filtered.map((d) => (
            <div
              key={d.id}
              className="z-list-row grid grid-cols-1 sm:grid-cols-12 gap-4 sm:gap-2 items-start sm:items-center"
            >
              <div className="col-span-12 sm:col-span-2 flex sm:block items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-black text-[#134e4a]">{d.id}</p>
                  <span
                    className={`inline-flex mt-1 px-2 py-0.5 rounded-full text-[9px] font-bold ${STATUS_STYLES[d.status] ?? 'bg-gray-100 text-gray-600'}`}
                  >
                    {d.status}
                  </span>
                </div>
              </div>
              <div className="col-span-12 sm:col-span-2 text-xs font-bold text-gray-700">{d.quotationRef}</div>
              <div className="col-span-12 sm:col-span-2 text-sm font-bold text-gray-800">{d.customer}</div>
              <div className="col-span-12 sm:col-span-3">
                <p className="flex items-start gap-2 text-xs text-gray-600">
                  <MapPin size={14} className="text-gray-400 shrink-0 mt-0.5" />
                  {d.destination}
                </p>
                <p className="flex items-center gap-2 text-[10px] font-bold text-gray-500 mt-1 ml-5">
                  <Truck size={12} />
                  {d.method}
                </p>
                <p className="flex items-center gap-2 text-[10px] font-bold text-gray-400 mt-0.5 ml-5">
                  <Hash size={12} />
                  {d.trackingNo}
                </p>
                <p className="ml-5 mt-0.5 text-[10px] font-bold text-slate-400">
                  {d.lineCount || 0} line(s) · {(d.totalQty || 0).toLocaleString()} m
                </p>
              </div>
              <div className="col-span-12 sm:col-span-2 text-xs text-gray-500">
                <p className="flex items-center gap-1.5 font-medium">
                  <Calendar size={12} />
                  Ship {d.shipDate}
                </p>
                <p className="mt-1 font-bold text-[#134e4a]">ETA {d.eta}</p>
              </div>
              <div className="col-span-12 sm:col-span-1 flex sm:justify-end gap-1">
                <button
                  type="button"
                  onClick={() => openConfirm(d)}
                  className="p-2 text-gray-300 hover:text-[#134e4a] rounded-lg border border-transparent hover:border-gray-100 hover:bg-white transition-all"
                  title="Delivery confirmation"
                >
                  <CheckCircle2 size={18} />
                </button>
                <button
                  type="button"
                  className="p-2 text-gray-300 hover:text-[#134e4a] rounded-lg border border-transparent hover:border-gray-100 hover:bg-white transition-all"
                  title="Actions"
                >
                  <MoreVertical size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ModalFrame
        isOpen={createOpen}
        onClose={() => {
          setCreateOpen(false);
        }}
      >
        <div className="z-modal-panel max-w-lg p-8 overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-[#134e4a]">Create dispatch</h3>
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="p-2 text-gray-400 hover:text-red-500 rounded-xl"
            >
              <X size={22} />
            </button>
          </div>
          <form className="space-y-4" onSubmit={submitCreate}>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                Cutting list
              </label>
              <select
                required
                value={createForm.cuttingListId}
                onChange={(e) => setCreateForm((f) => ({ ...f, cuttingListId: e.target.value }))}
                className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
              >
                <option value="">Select cutting list…</option>
                {availableCuttingLists.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.id} · {row.customer} · {row.total}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                Destination
              </label>
              <input
                required
                value={createForm.destination}
                onChange={(e) => setCreateForm((f) => ({ ...f, destination: e.target.value }))}
                className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                placeholder="Customer site / depot"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                  Method
                </label>
                <input
                  value={createForm.method}
                  onChange={(e) => setCreateForm((f) => ({ ...f, method: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                  Tracking no.
                </label>
                <input
                  value={createForm.trackingNo}
                  onChange={(e) => setCreateForm((f) => ({ ...f, trackingNo: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                  placeholder="Optional"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                  Ship date
                </label>
                <input
                  type="date"
                  value={createForm.shipDate}
                  onChange={(e) => setCreateForm((f) => ({ ...f, shipDate: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                  ETA
                </label>
                <input
                  type="date"
                  value={createForm.eta}
                  onChange={(e) => setCreateForm((f) => ({ ...f, eta: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                />
              </div>
            </div>
            <button type="submit" className="z-btn-primary w-full justify-center py-3">
              Save dispatch
            </button>
          </form>
        </div>
      </ModalFrame>

      <ModalFrame
        isOpen={confirmOpen && Boolean(selected)}
        onClose={() => {
          setConfirmOpen(false);
          setSelected(null);
          setDeliveryConfirmEditApprovalId('');
        }}
      >
        <div className="z-modal-panel max-w-lg p-8 overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-[#134e4a]">Delivery confirmation</h3>
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              className="p-2 text-gray-400 hover:text-red-500 rounded-xl"
            >
              <X size={22} />
            </button>
          </div>
          {selected ? (
            <>
              <p className="text-[10px] font-bold text-gray-400 uppercase mb-4">
                {selected.id} · Order / quote {selected.quotationRef}
              </p>
              <form className="space-y-4" onSubmit={submitConfirm}>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                    Delivery ID
                  </label>
                  <input
                    readOnly
                    value={selected.id}
                    className="w-full bg-gray-100 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold text-gray-600 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                    Order ID (quotation link)
                  </label>
                  <input
                    readOnly
                    value={selected.quotationRef}
                    className="w-full bg-gray-100 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold text-gray-600 outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                      Delivery date
                    </label>
                    <input
                      type="date"
                      value={confirmForm.deliveryDate}
                      onChange={(e) =>
                        setConfirmForm((f) => ({ ...f, deliveryDate: e.target.value }))
                      }
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                      Courier name
                    </label>
                    <input
                      value={confirmForm.courierName}
                      onChange={(e) =>
                        setConfirmForm((f) => ({ ...f, courierName: e.target.value }))
                      }
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                    Delivery status
                  </label>
                  <select
                    value={confirmForm.deliveryStatus}
                    onChange={(e) =>
                      setConfirmForm((f) => ({ ...f, deliveryStatus: e.target.value }))
                    }
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                  >
                    <option value="Confirmed">Confirmed</option>
                    <option value="Pending">Pending</option>
                  </select>
                </div>
                <label className="flex items-center gap-3 text-xs font-bold text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmForm.customerSigned}
                    onChange={(e) =>
                      setConfirmForm((f) => ({ ...f, customerSigned: e.target.checked }))
                    }
                    className="rounded border-gray-300 text-[#134e4a] focus:ring-[#134e4a]"
                  />
                  Customer signature obtained (optional)
                </label>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                    Proof of delivery (file)
                  </label>
                  <label className="flex items-center gap-3 px-4 py-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 cursor-pointer hover:border-teal-200 transition-colors">
                    <Upload size={18} className="text-gray-400" />
                    <span className="text-xs font-bold text-gray-500">Upload POD image / PDF</span>
                    <input type="file" accept="image/*,.pdf" className="hidden" />
                  </label>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                    Notes
                  </label>
                  <textarea
                    rows={2}
                    value={confirmForm.notes}
                    onChange={(e) =>
                      setConfirmForm((f) => ({ ...f, notes: e.target.value }))
                    }
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-medium outline-none resize-none"
                  />
                </div>
                {selected?.id ? (
                  <EditSecondApprovalInline
                    entityKind="delivery"
                    entityId={selected.id}
                    value={deliveryConfirmEditApprovalId}
                    onChange={setDeliveryConfirmEditApprovalId}
                  />
                ) : null}
                <button type="submit" className="z-btn-primary w-full justify-center py-3">
                  Save confirmation
                </button>
              </form>
            </>
          ) : null}
        </div>
      </ModalFrame>
    </>
  );
}
