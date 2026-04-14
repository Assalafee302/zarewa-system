export function inferAiModeFromPath(pathname) {
  const path = String(pathname || '').toLowerCase();
  if (
    path === '/' ||
    path.startsWith('/manager') ||
    path.startsWith('/exec') ||
    path.startsWith('/reports') ||
    path.startsWith('/office')
  ) {
    return 'search';
  }
  if (path.startsWith('/sales') || path.startsWith('/customers')) return 'sales';
  if (path.startsWith('/procurement')) return 'procurement';
  if (path.startsWith('/operations') || path.startsWith('/deliveries')) return 'operations';
  if (path.startsWith('/accounts')) return 'finance';
  return 'search';
}

export function aiModeLabel(mode) {
  switch (String(mode || '').toLowerCase()) {
    case 'sales':
      return 'Sales copilot';
    case 'procurement':
      return 'Procurement copilot';
    case 'operations':
      return 'Operations copilot';
    case 'finance':
      return 'Finance copilot';
    case 'hr':
      return 'HR copilot';
    case 'search':
    default:
      return 'Workspace assistant';
  }
}

export function quickPromptsForPath(pathname) {
  const mode = inferAiModeFromPath(pathname);
  switch (mode) {
    case 'sales':
      return [
        {
          label: 'Quotes to follow up',
          prompt: 'Which quotations need follow-up now, and what should sales do next?',
          mode: 'sales',
        },
        {
          label: 'Cutting blockers',
          prompt: 'Explain the current cutting-list material blockers and the next best action.',
          mode: 'sales',
        },
        {
          label: 'Refund queue',
          prompt: 'Summarize the refund queue and explain which items still need approval or payout.',
          mode: 'sales',
        },
      ];
    case 'procurement':
      return [
        {
          label: 'What is in transit?',
          prompt: 'Summarize what is currently on loading or in transit and what procurement should track next.',
          mode: 'procurement',
        },
        {
          label: 'Reorder guidance',
          prompt: 'Highlight likely reorder pressure using current stock and open purchasing activity.',
          mode: 'procurement',
        },
        {
          label: 'Supplier view',
          prompt: 'Summarize supplier and purchase-order activity visible to me right now.',
          mode: 'procurement',
        },
      ];
    case 'operations':
      return [
        {
          label: 'Production review',
          prompt: 'Which production jobs or conversion checks need attention first, and why?',
          mode: 'operations',
        },
        {
          label: 'Stock risk',
          prompt: 'Summarize current stock risk and the most important store actions.',
          mode: 'operations',
        },
        {
          label: 'Delivery readiness',
          prompt: 'Explain the main blockers or checks for delivery and production readiness.',
          mode: 'operations',
        },
      ];
    case 'finance':
      return [
        {
          label: 'Audit queue',
          prompt: 'Summarize the current audit and reconciliation queue and what Finance should handle first.',
          mode: 'finance',
        },
        {
          label: 'Treasury summary',
          prompt: 'Give me a short treasury, payables, and refund-payout summary from the live workspace.',
          mode: 'finance',
        },
        {
          label: 'Receipts and recon',
          prompt: 'Explain the biggest receipt-settlement and bank-reconciliation issues visible right now.',
          mode: 'finance',
        },
      ];
    case 'hr':
      return [
        {
          label: 'Compliance summary',
          prompt: 'Summarize the main HR compliance and audit issues visible to me right now.',
          mode: 'hr',
        },
        {
          label: 'Payroll status',
          prompt: 'Explain the payroll workflow status and what HR should do next.',
          mode: 'hr',
        },
        {
          label: 'Policy help',
          prompt: 'Explain the current policy acknowledgement and handbook status in plain language.',
          mode: 'hr',
        },
      ];
    case 'search':
    default:
      return [
        {
          label: 'Today priorities',
          prompt: 'What needs my attention today across the workspace, and where should I go first?',
          mode: 'search',
        },
        {
          label: 'Alerts summary',
          prompt: 'Summarize the current alerts and explain why each one matters.',
          mode: 'search',
        },
        {
          label: 'Manager overview',
          prompt: 'Give me a short cross-functional summary of sales, procurement, operations, and finance.',
          mode: 'search',
        },
      ];
  }
}

export function notificationPrompt(notification) {
  const title = String(notification?.title || 'Notification').trim();
  const detail = String(notification?.detail || '').trim();
  if (!detail) {
    return `Explain why the "${title}" notification matters and what I should do next.`;
  }
  return `Explain this notification and suggest the next action: ${title} — ${detail}`;
}
