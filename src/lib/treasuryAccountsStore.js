/**
 * Treasury accounts shared between Finance (Accounts page) and Sales (quotation pay-in).
 * Persisted in localStorage so new accounts added in Finance appear on quotations.
 */

const STORAGE_KEY = 'zarewa.finance.treasuryAccounts';

export function defaultTreasuryAccounts() {
  return [
    {
      id: 1,
      name: 'GTBank Main',
      bankName: 'Guaranty Trust Bank',
      balance: 14250000,
      type: 'Bank',
      accNo: '0123456789',
    },
    {
      id: 2,
      name: 'Zenith Production',
      bankName: 'Zenith Bank',
      balance: 5200000,
      type: 'Bank',
      accNo: '9876543210',
    },
    { id: 3, name: 'Cash Office (Till)', bankName: '', balance: 450000, type: 'Cash', accNo: 'N/A' },
  ];
}

export function loadTreasuryAccounts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultTreasuryAccounts();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultTreasuryAccounts();
    return parsed.map((a) => ({
      id: a.id,
      name: String(a.name ?? ''),
      bankName: String(a.bankName ?? ''),
      balance: Number(a.balance) || 0,
      type: a.type === 'Cash' ? 'Cash' : 'Bank',
      accNo: String(a.accNo ?? 'N/A'),
    }));
  } catch {
    return defaultTreasuryAccounts();
  }
}

export function saveTreasuryAccounts(accounts) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
  } catch {
    /* ignore */
  }
}

/** Bank accounts suitable for customer transfers (excludes till / N/A numbers). */
export function bankAccountsForCustomerPayment(accounts) {
  return (accounts ?? []).filter(
    (a) => a.type === 'Bank' && a.accNo && a.accNo !== 'N/A' && String(a.accNo).length >= 8
  );
}
