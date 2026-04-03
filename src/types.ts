export interface InvestmentAccount {
  id: string;
  name: string;
  ticker: string;
  description: string;
  aum: number;
  nav: number;
  totalUnits: number;
  lastValuationDate: string;
  createdAt: string;
}

export interface Investor {
  id: string;
  uid: string;
  accountId: string;
  name: string;
  email: string;
  unitsOwned: number;
  totalInvestment: number;
  currentValue: number;
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
  quantity: number;
  costBasis: number;
  currentPrice: number;
  marketValue: number;
}

export interface UserRole {
  uid: string;
  role: 'admin' | 'investor';
}
