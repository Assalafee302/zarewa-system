import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CoilProfile from './CoilProfile.jsx';

const mockUseInventory = vi.fn();
const mockUseWorkspace = vi.fn();
const mockToast = vi.fn();

vi.mock('../context/InventoryContext', () => ({
  useInventory: () => mockUseInventory(),
}));

vi.mock('../context/WorkspaceContext', () => ({
  useWorkspace: () => mockUseWorkspace(),
}));
vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ show: mockToast }),
}));

describe('CoilProfile', () => {
  beforeEach(() => {
    mockUseInventory.mockReset();
    mockUseWorkspace.mockReset();
    mockToast.mockReset();
  });
  afterEach(() => {
    cleanup();
  });

  it('renders a coil profile from route param', () => {
    mockUseInventory.mockReturnValue({
      coilLots: [
        {
          coilNo: 'COIL-001',
          productID: 'PRD-001',
          colour: 'Blue',
          gaugeLabel: '0.45',
          qtyReceived: 1000,
          qtyReserved: 100,
          currentWeightKg: 900,
        },
      ],
      movements: [],
    });
    mockUseWorkspace.mockReturnValue({ snapshot: {} });

    render(
      <MemoryRouter initialEntries={['/operations/coils/COIL-001']}>
        <Routes>
          <Route path="/operations/coils/:coilNo" element={<CoilProfile />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText(/Coil COIL-001/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Conversion history/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /split/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /scrap/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /return/i })).toBeInTheDocument();
  });

  it('matches linked rows case-insensitively and renders safe fallbacks', () => {
    mockUseInventory.mockReturnValue({
      coilLots: [
        {
          coilNo: 'coil-abc',
          productID: 'PRD-ALU',
          colour: '',
          gaugeLabel: '',
          qtyReceived: 0,
          qtyReserved: 0,
          currentWeightKg: 0,
          supplierConversionKgPerM: null,
        },
      ],
      movements: [],
    });
    mockUseWorkspace.mockReturnValue({
      snapshot: {
        productionJobCoils: [
          {
            coilNo: 'COIL-ABC',
            cuttingListId: 'CL-001',
            openingWeightKg: 500,
            closingWeightKg: 300,
            metersProduced: 100,
          },
        ],
        productionConversionChecks: [
          {
            id: 'CHK-1',
            coilNo: 'COIL-ABC',
            cuttingListId: 'CL-001',
            actualConversionKgPerM: 2,
            standardConversionKgPerM: 2.2,
            supplierConversionKgPerM: 2.1,
            alertState: 'Watch',
          },
        ],
      },
    });

    render(
      <MemoryRouter initialEntries={['/operations/coils/coil-abc']}>
        <Routes>
          <Route path="/operations/coils/:coilNo" element={<CoilProfile />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getAllByText('CL-001').length).toBeGreaterThan(0);
    expect(screen.getByText(/kg used:/i)).toBeInTheDocument();
    expect(screen.getByText(/Within band|Watch|Critical/i)).toBeInTheDocument();
    const watchBadge = screen.getByText('Watch');
    expect(watchBadge.className).toMatch(/amber/);
  });
});

