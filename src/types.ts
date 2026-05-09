export interface InvestmentAccount {
  id: string;
  name: string;
  ticker: string;
  isin?: string;
  description: string;
  aum: number;
  nav: number;
  totalUnits: number;
  capacity?: number; // Max total units allowed
  cashBalance: number;
  lastValuationDate: string;
  createdAt: string;
}

export interface Investor {
  id: string;
  investorId: string; // Auto-generated unique ID (e.g. INV-123456)
  uid: string;
  accountId: string;
  name: string;
  email?: string;
  phone?: string;
  unitsOwned: number;
  totalInvestment: number;
  currentValue: number;
  kycStatus?: 'verified' | 'pending' | 'rejected';
}

export interface Transaction {
  id: string;
  investorId: string;
  accountId: string;
  type: 'BUY' | 'SELL';
  units: number;
  pricePerUnit: number;
  totalAmount: number;
  timestamp: string;
}

export interface Asset {
  id: string;
  accountId: string;
  ticker: string;
  name: string;
  sector?: string; // e.g. Banking, Mining, Tech, Cash
  quantity: number;
  costBasis: number; // Avg cost per share
  totalCostBasis: number; // Total cost
  currentPrice: number;
  marketValue: number;
  valuationDate?: string; // Date of acquisition or last valuation
  unrealizedGainLoss?: number;
}

export interface UserRole {
  uid: string;
  role: 'admin' | 'investor';
}

export interface Valuation {
  id: string;
  accountId: string;
  date: { seconds: number; nanoseconds: number } | any;
  nav: number;
  aum: number;
  notes?: string;
}
