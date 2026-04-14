/** Default empty rows for supplier registration (client). */

export const SUPPLIER_BANK_ROW_TEMPLATE = () => ({
  bankName: '',
  accountName: '',
  accountNumber: '',
  sortCode: '',
  currency: 'NGN',
});

export const SUPPLIER_CONTACT_ROW_TEMPLATE = () => ({
  name: '',
  role: '',
  email: '',
  phone: '',
});

export function defaultSupplierExtendedForm() {
  return {
    companyEmail: '',
    website: '',
    vatTin: '',
    rcNumber: '',
    registeredAddress: '',
    billingAddress: '',
    phoneMain: '',
    whatsapp: '',
    notesCommercial: '',
    bankAccounts: [SUPPLIER_BANK_ROW_TEMPLATE(), SUPPLIER_BANK_ROW_TEMPLATE()],
    contacts: [
      SUPPLIER_CONTACT_ROW_TEMPLATE(),
      SUPPLIER_CONTACT_ROW_TEMPLATE(),
      SUPPLIER_CONTACT_ROW_TEMPLATE(),
    ],
    /** @type {Array<{ id: string; fileName: string; mimeType: string; uploadedAtIso: string; hasFile?: boolean }>} */
    agreementMeta: [],
    /** @type {string[]} */
    removedAgreementIds: [],
  };
}

export function padBankAccounts(rows, min = 2, max = 6) {
  const base = Array.isArray(rows) ? rows.map((r) => ({ ...SUPPLIER_BANK_ROW_TEMPLATE(), ...r })) : [];
  while (base.length < min) base.push(SUPPLIER_BANK_ROW_TEMPLATE());
  return base.slice(0, max);
}

export function padContacts(rows, min = 3, max = 6) {
  const base = Array.isArray(rows) ? rows.map((r) => ({ ...SUPPLIER_CONTACT_ROW_TEMPLATE(), ...r })) : [];
  while (base.length < min) base.push(SUPPLIER_CONTACT_ROW_TEMPLATE());
  return base.slice(0, max);
}

/**
 * Map API supplier + profile into extended form fields.
 * @param {object} s
 */
export function extendedFormFromSupplier(s) {
  const p = s?.supplierProfile && typeof s.supplierProfile === 'object' ? s.supplierProfile : {};
  const agreements = Array.isArray(p.agreements) ? p.agreements : [];
  return {
    ...defaultSupplierExtendedForm(),
    companyEmail: p.companyEmail || '',
    website: p.website || '',
    vatTin: p.vatTin || '',
    rcNumber: p.rcNumber || '',
    registeredAddress: p.registeredAddress || '',
    billingAddress: p.billingAddress || '',
    phoneMain: p.phoneMain || '',
    whatsapp: p.whatsapp || '',
    notesCommercial: p.notesCommercial || '',
    bankAccounts: padBankAccounts(p.bankAccounts, 2, 6),
    contacts: padContacts(p.contacts, 3, 6),
    agreementMeta: agreements
      .filter((a) => a && a.id)
      .map((a) => ({
        id: String(a.id),
        fileName: String(a.fileName || 'document'),
        mimeType: String(a.mimeType || ''),
        uploadedAtIso: String(a.uploadedAtIso || ''),
        hasFile: Boolean(a.hasFile !== false && (a.dataBase64 || a.hasFile)),
      })),
    removedAgreementIds: [],
  };
}

export function readFileAsBase64Data(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const raw = String(fr.result || '');
      const comma = raw.indexOf(',');
      resolve(comma >= 0 ? raw.slice(comma + 1) : raw);
    };
    fr.onerror = () => reject(new Error('Could not read file.'));
    fr.readAsDataURL(file);
  });
}
