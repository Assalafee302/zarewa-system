export const ZAREWA_STATE = {
  inventory: [
    { id: 'COIL-882', material: 'Aluminium', gauge: '0.45mm', weight: 2450, status: 'Active' },
    { id: 'COIL-901', material: 'Aluzinc', gauge: '0.30mm', weight: 1120, status: 'Low' },
  ],
  machinery: [
    { id: 'XB-828', name: 'Corrugation Machine', condition: 'Poor', status: 'Running' },
    { id: 'KB-125C', name: 'Hydraulic Press', condition: 'Maintenance Required', status: 'Idle' }
  ],
  market: {
    scrapPrice: 850, // Naira per KG
    trend: 'up',
    lastUpdated: '2026-03-27'
  },
  finance: {
    dailyRevenue: 1250000,
    opex: 450000,
    cashOnHand: 2800000
  }
};