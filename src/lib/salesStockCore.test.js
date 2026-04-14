import { describe, it, expect } from 'vitest';
import {
  firstGaugeNumeric,
  roughMetersFromKg,
  colourShort,
  buildStockVerdict,
  coilLotRemainingKg,
  isCoilLotUnavailableForPlanning,
} from './salesStockCore';

describe('salesStockCore', () => {
  it('extracts numeric gauge values', () => {
    expect(firstGaugeNumeric('0.45 mm')).toBe(0.45);
    expect(firstGaugeNumeric('Gauge: 0.30')).toBe(0.3);
    expect(firstGaugeNumeric('N/A')).toBeNull();
  });

  it('computes rough metres from kg', () => {
    expect(roughMetersFromKg(0, 0.26)).toBeNull();
    expect(roughMetersFromKg(265, 0.26)).toBe(100);
  });

  it('shortens colour labels for compact chips', () => {
    expect(colourShort('DeepBlueLong')).toBe('DeepBlu…');
    expect(colourShort(' Red ')).toBe('Red');
  });

  it('returns availability verdicts', () => {
    expect(buildStockVerdict(false, [])).toBeNull();
    expect(buildStockVerdict(true, []).kind).toBe('none');
    expect(
      buildStockVerdict(true, [
        { kg: 50, estMeters: 18, low: false },
        { kg: 30, estMeters: 11, low: false },
      ]).kind
    ).toBe('ok');
    expect(buildStockVerdict(true, [{ kg: 20, estMeters: 7, low: true }]).kind).toBe('low');
  });

  it('prefers currentWeightKg over original weightKg for remaining mass', () => {
    expect(
      coilLotRemainingKg({
        weightKg: 5000,
        currentWeightKg: 120,
        qtyRemaining: 0,
      })
    ).toBe(120);
    expect(
      coilLotRemainingKg({
        weightKg: 5000,
        currentWeightKg: 0,
        qtyRemaining: 80,
      })
    ).toBe(80);
  });

  it('treats consumed and finished coils as unavailable for planning lists', () => {
    expect(isCoilLotUnavailableForPlanning({ currentStatus: 'Consumed' })).toBe(true);
    expect(isCoilLotUnavailableForPlanning({ currentStatus: 'Finished' })).toBe(true);
    expect(isCoilLotUnavailableForPlanning({ currentStatus: 'Available' })).toBe(false);
    expect(isCoilLotUnavailableForPlanning({ currentStatus: 'Reserved' })).toBe(false);
  });
});

