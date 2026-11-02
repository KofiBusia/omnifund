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
  liabilities?: number; // Fund payables and operating liabilities
  accruedFees?: number; // Accrued management and custody fees
  receivables?: number; // Accrued income and receivables
  manualNavAdjustment?: number;
  isManualNav?: boolean;
  isHidden?: boolean;
  lastValuationDate: string;
  createdAt: string;
  code?: string; // Fund Code (e.g. OGEF)
  fundType?: string; // Equity, Fixed Income, Money Market, etc.
  fundStructure?: string; // Open-ended, Closed-ended, Umbrella, etc.
  baseCurrency?: string; // GHS, USD, EUR, GBP
  domicile?: string; // Ghana, United States, etc.
  inceptionDate?: string; // Inception Date
  regulator?: string; // SEC Ghana, SEC US, etc.
  registrationNumber?: string; // Regulatory registration number
  lei?: string; // Legal Entity Identifier (20 characters)
  fundManager?: string;
  administrator?: string;
  custodian?: string;
  auditor?: string;
  navFrequency?: string; // Daily, Weekly, Monthly
  valuationFrequency?: string;
  pricingMethod?: string; // Forward Pricing, Previous NAV
  shareClasses?: Array<{ id: string; name: string; type: string; currency: string; nav: number }>;
}

export type PortalStatus = 'NOT_ENABLED' | 'PENDING_APPROVAL' | 'INVITED' | 'ACTIVATED' | 'DISABLED';

export interface Investor {
  id: string;
  investorId: string; // Auto-generated unique ID (e.g. INV-123456)
  uid: string;
  accountId: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  unitsOwned: number;
  totalInvestment: number; // Cost basis
  currentValue: number;
  realizedGainLoss?: number; // Cumulative realized gains/losses from redemptions
  kycStatus?: 'verified' | 'pending' | 'rejected';
  portalStatus?: PortalStatus;
  portalEmail?: string;
  portalUid?: string;
  approvedAt?: string;
  approvedBy?: string;
  kycDetails?: {
    idVerified: boolean;
    addressVerified: boolean;
    sourceOfFundsVerified: boolean;
    documents?: string[]; // URLs or document names
  };
  certificateIssuedAt?: string;
  certificateSerial?: string;
  certificateStatus?: 'ISSUED' | 'PENDING' | 'REVOKED';
  createdAt?: string;
  createdBy?: string;
}

export type TransactionType = 
  | 'BUY' 
  | 'SELL' 
  | 'Subscription' 
  | 'Redemption' 
  | 'TransferIn' 
  | 'TransferOut' 
  | 'AssetBuy' 
  | 'AssetSell' 
  | 'Dividend' 
  | 'Interest' 
  | 'OtherIncome' 
  | 'ManagementFee' 
  | 'AdminFee' 
  | 'TransactionFee' 
  | 'OtherExpense' 
  | 'Correction' 
  | 'Reversal' 
  | 'OpeningBalance';

export interface Transaction {
  id: string;
  investorId: string;
  accountId: string;
  type: TransactionType;
  units: number;
  pricePerUnit: number;
  totalAmount: number;
  costBasisReduction?: number; // Pro-rata cost basis reduction on redemptions
  realizedGainLoss?: number; // Realized gain/loss on redemptions
  timestamp: string;
  effectiveDate?: string;
  status?: 'pending' | 'posted' | 'failed' | 'staged' | 'NAV_REQUIRED';
  source?: 'manual' | 'bulk_upload' | 'stp' | 'system';
  reference?: string;
  externalId?: string;
  batchId?: string;
  grossAmount?: number;
  fee?: number;
  netAmount?: number;
  currency?: string;
  createdBy?: string;
  approvedBy?: string;
  validationError?: string;
  notes?: string;
}

export interface StagedTransactionRecord {
  id: string;
  batchId: string;
  rawDate: string;
  validatedDate?: string;
  rawInvestor: string;
  matchedInvestorId?: string;
  matchedInvestorName?: string;
  matchConfidence?: number; // 0 to 100 percentage
  matchStatus: 'MATCHED' | 'REVIEW' | 'UNMATCHED';
  rawType: string;
  normalisedType: TransactionType;
  rawAmount: number;
  grossAmount?: number;
  fee?: number;
  netAmount?: number;
  applicableNav?: number;
  calculatedUnits?: number;
  status: 'READY' | 'WARNING' | 'ERROR' | 'NAV_REQUIRED' | 'DUPLICATE';
  warningOrError?: string;
  isDuplicate?: boolean;
  reference?: string;
}

export interface TransactionBatch {
  id: string;
  uploadedBy: string;
  uploadedAt: string;
  accountId: string;
  filename: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  reviewRows: number;
  totalAmount: number;
  status: 'UPLOADED' | 'ANALYSING' | 'REVIEW' | 'APPROVED' | 'POSTING' | 'POSTED' | 'REJECTED';
  stagedRecords: StagedTransactionRecord[];
}

export interface UnitLedgerEntry {
  id: string;
  timestamp: string;
  effectiveDate: string;
  accountId: string;
  investorId: string;
  transactionId: string;
  transactionType: TransactionType;
  unitsDelta: number;
  runningInvestorUnits: number;
  runningFundUnits: number;
  applicableNav: number;
  reference?: string;
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
  realizedGainLoss?: number;

  // Broker Contract Note Institutional Fields (Ghana Stock Exchange Standard)
  brokerName?: string; // e.g. Merban Stockbrokers Ltd, IC Securities, Databank
  csdNumber?: string; // Central Securities Depository Account Number (e.g. UMBBBXX-Y020260303TYT4-0001)
  clientAccountNo?: string; // e.g. 1004967
  contractNoteRef?: string; // Contract note reference number
  tradePrice?: number; // Gross price per share before fees/levies (e.g. GH₵6.60)
  tradeConsideration?: number; // Gross consideration (Quantity * Trade Price, e.g. GH₵2,963.40)
  tradeLevies?: number; // GSE / SEC / CSD Levies (e.g. GH₵20.74)
  brokerCommission?: number; // Broker commission fee (e.g. GH₵53.34)
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

export type UserRoleType = 'superadmin' | 'admin' | 'staff' | 'support' | 'viewer' | 'entry' | 'approver' | 'investor';

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

export type PriceStatus = 'PRICED' | 'STALE' | 'MANUAL' | 'ESTIMATED' | 'MISSING' | 'EXCEPTION';

export interface ValuationException {
  id: string;
  code: 'MISSING_PRICE' | 'STALE_PRICE' | 'UNIT_MISMATCH' | 'NEGATIVE_CASH' | 'LARGE_NAV_MOVEMENT' | 'LIABILITY_MISMATCH';
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  description: string;
  item: string;
  recommendedAction: string;
  status: 'OPEN' | 'RESOLVED';
  resolvedBy?: string;
  resolvedAt?: string;
}

export interface ValuationNavBridge {
  previousNav: number;
  portfolioMovement: number;
  realizedGainMovement: number;
  incomeMovement: number;
  expenseMovement: number;
  netCashFlowMovement: number;
  closingNav: number;
}

export interface ValuationRun {
  id: string; // e.g. VAL-2026-08-10-001
  valuationNumber: string;
  accountId: string;
  valuationDate: string;
  runTimestamp: string;
  status: 'DRAFT' | 'CALCULATING' | 'REVIEW' | 'APPROVED' | 'FINAL' | 'REVERSED';
  portfolioValue: number;
  cashBalance: number;
  receivables: number;
  totalAssets: number;
  operatingLiabilities: number;
  accruedFees: number;
  totalLiabilities: number;
  netAssets: number;
  unitsOutstanding: number;
  navPerUnit: number;
  navBridge: ValuationNavBridge;
  exceptions: ValuationException[];
  preparedBy: string;
  approvedBy?: string;
  notes?: string;
}

export interface FeeAccrualConfig {
  managementFeeRatePct: number; // e.g. 1.5
  custodyFeeRatePct: number;    // e.g. 0.25
  adminFeeRatePct: number;      // e.g. 0.10
}

export interface PortalInvitation {
  id: string;
  token: string;
  investorId: string;
  email: string;
  status: 'QUEUED' | 'SENT' | 'OPENED' | 'ACTIVATED' | 'EXPIRED' | 'FAILED';
  expiresAt: string;
  createdAt: string;
  createdBy: string;
  usedAt?: string;
  resendCount?: number;
}

export interface PortalInvitationLog {
  id: string;
  invitationId: string;
  investorId: string;
  action: 'CREATED' | 'SENT' | 'RESENT' | 'VERIFIED' | 'ACTIVATED' | 'EXPIRED' | 'FAILED';
  timestamp: string;
  performerUid: string;
  details?: string;
}

export interface InvestorProfileChangeRequest {
  id: string;
  investorId: string;
  requestedByUid: string;
  fieldName: 'phone' | 'email' | 'address' | 'preferredContact';
  oldValue: string;
  newValue: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface InvestorTransactionRequest {
  id: string;
  investorId: string;
  accountId: string;
  type: 'Subscription' | 'Redemption';
  amount: number;
  estimatedUnits?: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedAt: string;
  reviewedBy?: string;
  notes?: string;
}

export type InvestorImportMode = 'MASTER_ONLY' | 'MASTER_AND_INVESTMENT';

export interface StagedInvestorRow {
  rowNumber: number;
  rawRecord: Record<string, any>;
  
  // Master Fields
  investorId?: string;
  investorType?: 'Individual' | 'Corporate' | 'Institutional';
  fullName: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: string;
  dob?: string;
  idType?: string;
  idNumber?: string;
  kycStatus?: 'pending' | 'verified' | 'unverified' | 'rejected';
  
  // Investor Matching Results
  matchedInvestorId?: string;
  matchedInvestorName?: string;
  matchConfidence: number; // 0-100
  matchStatus: 'NEW' | 'EXISTING' | 'POSSIBLE_DUPLICATE' | 'CONFLICT';
  matchReason?: string;

  // Financial Investment Fields (Mode B)
  fundTicker?: string;
  targetAccountId?: string;
  accountType?: string;
  transactionDate?: string;
  transactionType?: 'Subscription' | 'Redemption' | 'TransferIn';
  amount?: number;
  currency?: string;
  applicableNav?: number;
  calculatedUnits?: number;
  importedUnits?: number;
  unitDiscrepancyDelta?: number;
  hasUnitDiscrepancy?: boolean;
  discrepancyAction?: 'USE_CALCULATED' | 'ACCEPT_IMPORTED' | 'INVESTIGATE';

  // Row Status
  status: 'READY' | 'WARNING' | 'NAV_REQUIRED' | 'DUPLICATE' | 'ERROR';
  warningOrError?: string;
  isDuplicate?: boolean;
}

export interface StagedInvestorBatch {
  batchId: string;
  filename: string;
  uploadedBy: string;
  uploadedAt: string;
  templateVersion: string;
  importMode: InvestorImportMode;
  targetAccountId?: string;
  totalRows: number;
  validRows: number;
  warningRows: number;
  duplicateRows: number;
  errorRows: number;
  totalSubscriptionAmount: number;
  totalCalculatedUnits: number;
  hasDiscrepancies: boolean;
  stagedRows: StagedInvestorRow[];
}

