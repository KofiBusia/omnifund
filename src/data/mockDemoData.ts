import { InvestmentAccount, Investor, Asset, Transaction, Valuation } from '../types';

export const mockDemoAccounts: InvestmentAccount[] = [
  {
    id: 'demo-acc-1',
    name: 'Apex Horizon Balanced Fund (Demo Sandbox)',
    ticker: 'AHBF-DEMO',
    isin: 'GH0001109283',
    description: 'Simulated multi-asset portfolio balancing Ghana Stock Exchange equities, fixed income notes, and money market instruments.',
    aum: 2450000.00,
    nav: 1.0850,
    totalUnits: 2258064.51,
    capacity: 5000000,
    cashBalance: 320000.00,
    lastValuationDate: '2026-08-08',
    createdAt: '2025-01-15'
  },
  {
    id: 'demo-acc-2',
    name: 'Omni Equity Growth Fund (Demo Sandbox)',
    ticker: 'OEGF-DEMO',
    isin: 'GH0003304192',
    description: 'Simulated equity fund targeting high-growth telecommunication, banking, and commercial sector leaders on the GSE.',
    aum: 1820000.00,
    nav: 1.1420,
    totalUnits: 1593695.27,
    capacity: 3000000,
    cashBalance: 180000.00,
    lastValuationDate: '2026-08-08',
    createdAt: '2025-03-01'
  }
];

export const mockDemoInvestors: Investor[] = [
  {
    id: 'demo-inv-1',
    investorId: 'INV-DEMO-001',
    uid: 'demo-user-1',
    accountId: 'demo-acc-1',
    name: 'Kwame Mensah',
    email: 'kwame.mensah@example.com',
    phone: '+233 24 412 3456',
    unitsOwned: 450000,
    totalInvestment: 450000,
    currentValue: 488250,
    kycStatus: 'verified',
    kycDetails: {
      idVerified: true,
      addressVerified: true,
      sourceOfFundsVerified: true,
      documents: ['Ghana_Card_Verified.pdf', 'Proof_of_Address.pdf']
    },
    certificateStatus: 'ISSUED',
    certificateSerial: 'CERT-DEMO-2025-089',
    certificateIssuedAt: '2025-02-10'
  },
  {
    id: 'demo-inv-2',
    investorId: 'INV-DEMO-002',
    uid: 'demo-user-2',
    accountId: 'demo-acc-1',
    name: 'Abena Osei-Tutu',
    email: 'abena.osei@example.com',
    phone: '+233 20 891 2345',
    unitsOwned: 320000,
    totalInvestment: 320000,
    currentValue: 347200,
    kycStatus: 'verified',
    kycDetails: {
      idVerified: true,
      addressVerified: true,
      sourceOfFundsVerified: true
    },
    certificateStatus: 'ISSUED',
    certificateSerial: 'CERT-DEMO-2025-104',
    certificateIssuedAt: '2025-03-01'
  },
  {
    id: 'demo-inv-3',
    investorId: 'INV-DEMO-003',
    uid: 'demo-user-3',
    accountId: 'demo-acc-1',
    name: 'Dr. Kofi Amankwah',
    email: 'kofi.amankwah@example.com',
    phone: '+233 27 765 4321',
    unitsOwned: 680000,
    totalInvestment: 700000,
    currentValue: 737800,
    kycStatus: 'verified',
    kycDetails: {
      idVerified: true,
      addressVerified: true,
      sourceOfFundsVerified: true
    },
    certificateStatus: 'ISSUED',
    certificateSerial: 'CERT-DEMO-2025-188',
    certificateIssuedAt: '2025-04-15'
  },
  {
    id: 'demo-inv-4',
    investorId: 'INV-DEMO-004',
    uid: 'demo-user-4',
    accountId: 'demo-acc-2',
    name: 'Esi Sutherland',
    email: 'esi.sutherland@example.com',
    phone: '+233 24 998 8776',
    unitsOwned: 500000,
    totalInvestment: 500000,
    currentValue: 571000,
    kycStatus: 'verified',
    kycDetails: {
      idVerified: true,
      addressVerified: true,
      sourceOfFundsVerified: true
    },
    certificateStatus: 'ISSUED',
    certificateSerial: 'CERT-DEMO-2025-210',
    certificateIssuedAt: '2025-05-20'
  },
  {
    id: 'demo-inv-5',
    investorId: 'INV-DEMO-005',
    uid: 'demo-user-5',
    accountId: 'demo-acc-2',
    name: 'Yaaba Mensah-Bonsu',
    email: 'yaaba.mensah@example.com',
    phone: '+233 55 123 9876',
    unitsOwned: 250000,
    totalInvestment: 260000,
    currentValue: 285500,
    kycStatus: 'verified',
    certificateStatus: 'PENDING'
  }
];

export const mockDemoPortfolio: Asset[] = [
  {
    id: 'demo-ast-1',
    accountId: 'demo-acc-1',
    ticker: 'MTNGH',
    name: 'Scancom PLC (MTN Ghana)',
    sector: 'Telecommunications',
    quantity: 450000,
    costBasis: 1.85,
    totalCostBasis: 832500,
    currentPrice: 2.25,
    marketValue: 1012500,
    unrealizedGainLoss: 180000,
    valuationDate: '2026-08-08',
    recordedAt: '2025-01-20'
  },
  {
    id: 'demo-ast-2',
    accountId: 'demo-acc-1',
    ticker: 'GCB',
    name: 'GCB Bank PLC',
    sector: 'Banking & Financials',
    quantity: 120000,
    costBasis: 3.80,
    totalCostBasis: 456000,
    currentPrice: 4.50,
    marketValue: 540000,
    unrealizedGainLoss: 840000,
    valuationDate: '2026-08-08',
    recordedAt: '2025-02-15'
  },
  {
    id: 'demo-ast-3',
    accountId: 'demo-acc-1',
    ticker: 'BOG-2YR-2027',
    name: '2-Year Bank of Ghana Treasury Note',
    sector: 'Fixed Income',
    quantity: 500000,
    costBasis: 1.00,
    totalCostBasis: 500000,
    currentPrice: 1.00,
    marketValue: 577500,
    valuationDate: '2026-08-08',
    recordedAt: '2025-03-01'
  },
  {
    id: 'demo-ast-4',
    accountId: 'demo-acc-2',
    ticker: 'EGL',
    name: 'Enterprise Group PLC',
    sector: 'Insurance',
    quantity: 180000,
    costBasis: 2.40,
    totalCostBasis: 432000,
    currentPrice: 3.10,
    marketValue: 558000,
    unrealizedGainLoss: 126000,
    valuationDate: '2026-08-08',
    recordedAt: '2025-03-10'
  },
  {
    id: 'demo-ast-5',
    accountId: 'demo-acc-2',
    ticker: 'SOGEGH',
    name: 'Societe Generale Ghana PLC',
    sector: 'Banking & Financials',
    quantity: 350000,
    costBasis: 1.60,
    totalCostBasis: 560000,
    currentPrice: 2.10,
    marketValue: 735000,
    unrealizedGainLoss: 175000,
    valuationDate: '2026-08-08',
    recordedAt: '2025-04-01'
  }
];

export const mockDemoTransactions: Transaction[] = [
  {
    id: 'demo-tx-1',
    investorId: 'demo-inv-1',
    accountId: 'demo-acc-1',
    type: 'BUY',
    units: 300000,
    pricePerUnit: 1.0000,
    totalAmount: 300000,
    timestamp: '2025-02-01T10:00:00.000Z'
  },
  {
    id: 'demo-tx-2',
    investorId: 'demo-inv-1',
    accountId: 'demo-acc-1',
    type: 'BUY',
    units: 150000,
    pricePerUnit: 1.0000,
    totalAmount: 150000,
    timestamp: '2025-05-15T14:30:00.000Z'
  },
  {
    id: 'demo-tx-3',
    investorId: 'demo-inv-2',
    accountId: 'demo-acc-1',
    type: 'BUY',
    units: 320000,
    pricePerUnit: 1.0000,
    totalAmount: 320000,
    timestamp: '2025-03-01T11:15:00.000Z'
  },
  {
    id: 'demo-tx-4',
    investorId: 'demo-inv-3',
    accountId: 'demo-acc-1',
    type: 'BUY',
    units: 680000,
    pricePerUnit: 1.0294,
    totalAmount: 700000,
    timestamp: '2025-04-15T09:45:00.000Z'
  },
  {
    id: 'demo-tx-5',
    investorId: 'demo-inv-4',
    accountId: 'demo-acc-2',
    type: 'BUY',
    units: 500000,
    pricePerUnit: 1.0000,
    totalAmount: 500000,
    timestamp: '2025-05-20T16:00:00.000Z'
  }
];

export const mockDemoValuations: Valuation[] = [
  {
    id: 'demo-val-1',
    accountId: 'demo-acc-1',
    date: { seconds: Math.floor(new Date('2025-01-15').getTime() / 1000) },
    nav: 1.0000,
    aum: 2000000.00,
    notes: 'Initial Fund Launch Inception NAV'
  },
  {
    id: 'demo-val-2',
    accountId: 'demo-acc-1',
    date: { seconds: Math.floor(new Date('2025-04-01').getTime() / 1000) },
    nav: 1.0250,
    aum: 2150000.00,
    notes: 'Q1 GSE Equity Revaluation'
  },
  {
    id: 'demo-val-3',
    accountId: 'demo-acc-1',
    date: { seconds: Math.floor(new Date('2025-07-01').getTime() / 1000) },
    nav: 1.0420,
    aum: 2280000.00,
    notes: 'Q2 Dividend Distribution & Coupon Accrual'
  },
  {
    id: 'demo-val-4',
    accountId: 'demo-acc-1',
    date: { seconds: Math.floor(new Date('2025-10-01').getTime() / 1000) },
    nav: 1.0610,
    aum: 2360000.00,
    notes: 'Q3 Mark-to-Market Valuation'
  },
  {
    id: 'demo-val-5',
    accountId: 'demo-acc-1',
    date: { seconds: Math.floor(new Date('2026-01-15').getTime() / 1000) },
    nav: 1.0850,
    aum: 2450000.00,
    notes: 'Annual NAV Audit'
  }
];
