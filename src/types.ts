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
  manualNavAdjustment?: number;
  isManualNav?: boolean;
  isHidden?: boolean;
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
  kycDetails?: {
    idVerified: boolean;
    addressVerified: boolean;
    sourceOfFundsVerified: boolean;
    documents?: string[]; // URLs or document names
  };
  certificateIssuedAt?: string;
  certificateSerial?: string;
  certificateStatus?: 'ISSUED' | 'PENDING' | 'REVOKED';
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
  valuationDate?: string; // Last price refresh date
  recordedAt?: string; // Date of acquisition or adding asset
  unrealizedGainLoss?: number;
}

export interface AssetValuation {
  id: string;
  assetId: string;
  accountId: string;
  ticker: string;
  price: number;
  marketValue: number;
  timestamp: any;
  notes?: string;
}

export type UserRoleType = 'superadmin' | 'admin' | 'staff' | 'support' | 'investor';

export interface UserRole {
  uid: string;
  role: UserRoleType;
  email?: string;
  displayName?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  role: UserRoleType;
  department?: string;
  isActive?: boolean;
  isDemo?: boolean;
  createdAt?: string | any;
  updatedAt?: string | any;
  createdBy?: string;
  phone?: string;
  theme?: 'dark' | 'light';
}

export interface SupportMessage {
  id: string;
  senderUid: string;
  senderName: string;
  senderRole: UserRoleType;
  message: string;
  timestamp: string;
  isInternalNote?: boolean;
}

export interface SupportTicket {
  id: string;
  ticketNumber: string; // e.g. TCK-8492
  subject: string;
  category: 'Statement Inquiry' | 'Investment Request' | 'Withdrawal/Redemption' | 'KYC & Account' | 'Technical Support' | 'General Inquiry';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  investorUid: string;
  investorName: string;
  investorEmail: string;
  accountId?: string;
  assignedToUid?: string;
  assignedToName?: string;
  createdAt: string;
  updatedAt: string;
  messages: SupportMessage[];
}

export interface Valuation {
  id: string;
  accountId: string;
  date: { seconds: number; nanoseconds: number } | any;
  nav: number;
  aum: number;
  notes?: string;
}
