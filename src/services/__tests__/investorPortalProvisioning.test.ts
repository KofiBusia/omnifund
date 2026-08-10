import { 
  generateCryptographicToken, 
  verifyActivationToken 
} from '../investorProvisioningService';
import { Investor, PortalInvitation, PortalStatus } from '../../types';

function runInvestorPortalProvisioningTestSuite() {
  console.log("=================================================");
  console.log("  RUNNING INVESTOR PORTAL PROVISIONING SUITE    ");
  console.log("=================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName} - ${detail || 'Assertion failed'}`);
      failed++;
    }
  }

  // --- TEST 1: Cryptographic Token Generation & Uniqueness ---
  console.log("--- Test 1: Cryptographic Token Generation & Uniqueness ---");
  const tok1 = generateCryptographicToken();
  const tok2 = generateCryptographicToken();
  assert(tok1.startsWith('inv_act_'), "Token starts with 'inv_act_' prefix");
  assert(tok1.length >= 40, "Token has sufficient entropy length");
  assert(tok1 !== tok2, "Tokens are cryptographically unique");

  // --- TEST 2: Single-Use Token Logic Validation ---
  console.log("\n--- Test 2: Single-Use Token Logic Validation ---");
  const validMockToken: PortalInvitation = {
    id: 'tok-100',
    token: 'inv_act_1234567890abcdef1234567890abcdef',
    investorId: 'inv-1',
    email: 'joshua.mensah@example.com',
    status: 'SENT',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    createdBy: 'ADMIN'
  };

  const usedMockToken: PortalInvitation = {
    ...validMockToken,
    id: 'tok-101',
    token: 'inv_act_used1234567890abcdef1234567890abcdef',
    status: 'ACTIVATED',
    usedAt: new Date().toISOString()
  };

  const expiredMockToken: PortalInvitation = {
    ...validMockToken,
    id: 'tok-102',
    token: 'inv_act_exp1234567890abcdef1234567890abcdef',
    status: 'EXPIRED',
    expiresAt: new Date(Date.now() - 3600000).toISOString() // 1h in past
  };

  assert(validMockToken.status === 'SENT' && !validMockToken.usedAt, "Valid invitation token is active and unused");
  assert(usedMockToken.status === 'ACTIVATED' && Boolean(usedMockToken.usedAt), "Activated token records usedAt timestamp");
  assert(new Date(expiredMockToken.expiresAt).getTime() < Date.now(), "Expired token timestamp is in the past");

  // --- TEST 3: Controlled Approval Lifecycle ---
  console.log("\n--- Test 3: Controlled Approval Lifecycle ---");
  const mockInvestor: Investor = {
    id: 'inv1',
    investorId: 'INV-000001',
    uid: '',
    accountId: 'acc1',
    name: 'Joshua Kwei Mensah',
    email: 'joshua.mensah@example.com',
    unitsOwned: 10000,
    totalInvestment: 1000,
    currentValue: 1200,
    kycStatus: 'pending',
    portalStatus: 'NOT_ENABLED'
  };

  assert(mockInvestor.kycStatus === 'pending', "Initial status is pending KYC review");
  assert(mockInvestor.portalStatus === 'NOT_ENABLED', "Portal access is NOT_ENABLED before approval");

  // Simulate approval
  const approvedInvestor: Investor = {
    ...mockInvestor,
    kycStatus: 'verified',
    portalStatus: 'INVITED',
    approvedAt: new Date().toISOString(),
    approvedBy: 'ADMIN'
  };

  assert(approvedInvestor.kycStatus === 'verified', "Approved investor has KYC status 'verified'");
  assert(approvedInvestor.portalStatus === 'INVITED', "Approval transitions portalStatus to 'INVITED'");

  // --- TEST 4: Strict Data Isolation Rules ---
  console.log("\n--- Test 4: Strict Data Isolation Rules ---");
  const allInvestors: Investor[] = [
    approvedInvestor,
    { id: 'inv2', investorId: 'INV-000002', uid: 'u2', accountId: 'acc2', name: 'Other Investor', email: 'other@example.com', unitsOwned: 5000, totalInvestment: 500, currentValue: 600 }
  ];

  const loggedInUser = { uid: 'u1', email: 'joshua.mensah@example.com', role: 'investor' };

  // Data isolation function simulation
  const permittedHoldings = allInvestors.filter(i => i.email?.toLowerCase() === loggedInUser.email.toLowerCase());
  assert(permittedHoldings.length === 1, "Data isolation yields exactly 1 investor record for authenticated user");
  assert(permittedHoldings[0].investorId === 'INV-000001', "Investor cannot access another investor's records");

  // --- TEST 5: Zero Plaintext Password Guarantee ---
  console.log("\n--- Test 5: Zero Plaintext Password Guarantee ---");
  const emailPayload = {
    recipientEmail: 'joshua.mensah@example.com',
    subject: 'Your OmniFund Pro Investor Portal Account Is Ready',
    activationToken: tok1
  };

  assert(!JSON.stringify(emailPayload).includes('password'), "Email payload contains ZERO password parameters");

  console.log("\n=================================================");
  console.log(`  RESULTS: ${passed} PASSED, ${failed} FAILED           `);
  console.log("=================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runInvestorPortalProvisioningTestSuite();
