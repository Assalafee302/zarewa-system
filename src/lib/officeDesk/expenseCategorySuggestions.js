/**
 * Heuristic expense category hints for Office Desk conversion (client-side).
 * @param {{ subject?: string, body?: string, description?: string }} input
 * @returns {{ category: string | null, reasons: string[] }}
 */
export function suggestExpenseCategoryFromMemoText(input) {
  const raw = [input?.subject, input?.body, input?.description].filter(Boolean).join('\n');
  const text = String(raw || '').toLowerCase();
  const reasons = [];

  const pick = (category, code) => {
    reasons.push(code);
    return category;
  };

  if (/(diesel|fuel|haulage|logistics|transport|delivery\s*truck|vehicle)/i.test(text)) {
    return { category: pick('Logistics & haulage', 'logistics_keywords'), reasons };
  }
  if (/(generator|phcn|utility|repair|maintenance|plant|machine|equipment)/i.test(text)) {
    return { category: pick('Maintenance — plant & equipment', 'maintenance_keywords'), reasons };
  }
  if (/(rent|utilities|electric|water\s*bill|office\s*rent)/i.test(text)) {
    return { category: pick('Operational — rent & utilities', 'operational_rent'), reasons };
  }
  if (/(raw\s*material|coil|sheet|consumable|supply|stock)/i.test(text)) {
    return { category: pick('COGS — raw materials & coil', 'cogs_materials'), reasons };
  }
  if (/(payroll|salary|pension|statutory|nhis)/i.test(text)) {
    return { category: pick('Employee — payroll & statutory', 'payroll_keywords'), reasons };
  }
  if (/(welfare|training|staff\s*meal)/i.test(text)) {
    return { category: pick('Employee — staff welfare & training', 'welfare_keywords'), reasons };
  }
  if (/(legal|lawyer|audit\s*fee|professional)/i.test(text)) {
    return { category: pick('Operational — professional & legal', 'professional_keywords'), reasons };
  }
  if (/(marketing|advert|branding|event)/i.test(text)) {
    return { category: pick('Marketing & business development', 'marketing_keywords'), reasons };
  }
  if (/(bank\s*charge|transfer\s*fee|interest)/i.test(text)) {
    return { category: pick('Bank & finance charges', 'bank_keywords'), reasons };
  }
  if (/(licen[cs]e|tax\s*bill|permit)/i.test(text)) {
    return { category: pick('Taxes & licences (non-payroll)', 'tax_licence_keywords'), reasons };
  }
  if (/(staff\s*loan|loan\s*disburse)/i.test(text)) {
    return { category: pick('Staff loan (disbursement)', 'staff_loan_keywords'), reasons };
  }

  return { category: null, reasons: [] };
}
