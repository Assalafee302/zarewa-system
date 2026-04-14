import { describe, it, expect } from 'vitest';
import { suggestExpenseCategoryFromMemoText } from './expenseCategorySuggestions.js';

describe('suggestExpenseCategoryFromMemoText', () => {
  it('suggests logistics for haulage keywords', () => {
    const r = suggestExpenseCategoryFromMemoText({ subject: 'Haulage', body: 'Pay transporter' });
    expect(r.category).toBe('Logistics & haulage');
  });

  it('returns null when no match', () => {
    const r = suggestExpenseCategoryFromMemoText({ subject: 'Hello', body: 'General note' });
    expect(r.category).toBeNull();
  });
});
