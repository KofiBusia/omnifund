import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  addDoc, 
  query, 
  where, 
  serverTimestamp, 
  setDoc
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { 
  Investor, 
  PortalStatus, 
  PortalInvitation, 
  PortalInvitationLog,
  UserProfile 
} from '../types';
import { sendPortalActivationEmail } from './emailService';
import { handleFirestoreError, OperationType } from '../lib/utils';

/**
 * Generates a cryptographically random, single-use activation token.
 */
export function generateCryptographicToken(): string {
  const bytes = new Uint8Array(32);
  if (typeof window !== 'undefined' && window.crypto) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 32; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return 'inv_act_' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Step 1: Approve Investor Profile & Optionally Enable Portal Access
 */
export const approveInvestorAndEnablePortal = async (
  investorDocId: string,
  adminUid: string = 'SYSTEM_ADMIN',
  enablePortal: boolean = true
): Promise<{ investor: Investor; invitationToken?: string }> => {
  try {
    const invRef = doc(db, 'investors', investorDocId);
    const invSnap = await getDoc(invRef);
    if (!invSnap.exists()) throw new Error(`Investor ${investorDocId} not found`);
    const investor = { id: invSnap.id, ...invSnap.data() } as Investor;

    const approvedAt = new Date().toISOString();
    const portalStatus: PortalStatus = enablePortal ? 'INVITED' : 'NOT_ENABLED';

    await updateDoc(invRef, {
      kycStatus: 'verified',
      portalStatus,
      approvedAt,
      approvedBy: adminUid
    });

    let invitationToken: string | undefined = undefined;

    if (enablePortal && investor.email) {
      const invResult = await createPortalInvitationToken(
        investor.id, 
        investor.email, 
        adminUid, 
        48
      );
      invitationToken = invResult.token;
    }

    return {
      investor: { ...investor, kycStatus: 'verified', portalStatus, approvedAt, approvedBy: adminUid },
      invitationToken
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'approve_investor');
    throw error;
  }
};

/**
 * Step 2: Create Secure Single-Use Activation Token & Trigger Welcome Email
 */
export const createPortalInvitationToken = async (
  investorDocId: string,
  email: string,
  adminUid: string,
  expiresInHours: number = 48
): Promise<PortalInvitation> => {
  try {
    const invRef = doc(db, 'investors', investorDocId);
    const invSnap = await getDoc(invRef);
    if (!invSnap.exists()) throw new Error(`Investor ${investorDocId} not found`);
    const investor = { id: invSnap.id, ...invSnap.data() } as Investor;

    // Invalidate existing active tokens for this investor
    const activeTokensQuery = query(
      collection(db, 'portal_invitations'),
      where('investorId', '==', investorDocId),
      where('status', 'in', ['QUEUED', 'SENT'])
    );
    const activeTokensSnap = await getDocs(activeTokensQuery);
    const invalidations = activeTokensSnap.docs.map(d => updateDoc(d.ref, { status: 'EXPIRED' }));
    await Promise.all(invalidations);

    const token = generateCryptographicToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresInHours * 60 * 60 * 1000).toISOString();

    const invitationData: PortalInvitation = {
      id: `INV-TOK-${Date.now()}`,
      token,
      investorId: investorDocId,
      email,
      status: 'SENT',
      createdAt: now.toISOString(),
      expiresAt,
      createdBy: adminUid,
      resendCount: activeTokensSnap.size
    };

    // Save invitation record
    await addDoc(collection(db, 'portal_invitations'), invitationData);

    // Save audit log
    await addDoc(collection(db, 'portal_invitation_logs'), {
      invitationId: invitationData.id,
      investorId: investorDocId,
      action: 'SENT',
      timestamp: now.toISOString(),
      performerUid: adminUid,
      details: `Activation email issued for ${email} with 48h expiration.`
    } as PortalInvitationLog);

    // Update investor document
    await updateDoc(invRef, {
      portalStatus: 'INVITED',
      portalEmail: email
    });

    // Send institutional welcome email
    await sendPortalActivationEmail(
      email,
      investor.name,
      investor.investorId || investor.id,
      token,
      expiresAt
    );

    return invitationData;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'create_portal_invitation');
    throw error;
  }
};

/**
 * Step 3: Verify Activation Token
 */
export const verifyActivationToken = async (
  token: string
): Promise<{ isValid: boolean; invitation?: PortalInvitation; error?: string }> => {
  try {
    if (!token || !token.startsWith('inv_act_')) {
      return { isValid: false, error: 'Invalid activation token format.' };
    }

    const q = query(
      collection(db, 'portal_invitations'),
      where('token', '==', token)
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      return { isValid: false, error: 'Activation token not found.' };
    }

    const invitation = { id: snap.docs[0].id, ...snap.docs[0].data() } as PortalInvitation;

    if (invitation.status === 'ACTIVATED' || invitation.usedAt) {
      return { isValid: false, error: 'This activation link has already been used.' };
    }

    if (invitation.status === 'EXPIRED' || new Date(invitation.expiresAt).getTime() < Date.now()) {
      return { isValid: false, error: 'This activation link has expired. Please contact your fund administrator for a new invitation.' };
    }

    return { isValid: true, invitation };
  } catch (error: any) {
    return { isValid: false, error: error?.message || 'Token validation error.' };
  }
};

/**
 * Step 4: Activate Investor Account & Set Password
 */
export const activateInvestorPortalAccount = async (
  token: string,
  password: string
): Promise<{ success: boolean; userUid?: string; message: string }> => {
  try {
    const verification = await verifyActivationToken(token);
    if (!verification.isValid || !verification.invitation) {
      throw new Error(verification.error || 'Invalid token');
    }

    const invitation = verification.invitation;
    const invRef = doc(db, 'investors', invitation.investorId);
    const invSnap = await getDoc(invRef);
    if (!invSnap.exists()) throw new Error('Investor profile not found.');
    const investor = { id: invSnap.id, ...invSnap.data() } as Investor;

    let userUid: string;

    // Create Firebase Auth identity if client-side session permits, or update User profile doc
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, invitation.email, password);
      userUid = userCredential.user.uid;
      await updateProfile(userCredential.user, { displayName: investor.name });
    } catch (authErr: any) {
      if (authErr.code === 'auth/email-already-in-use') {
        // Sign-in existing user or assign UID if user already exists
        const currentUser = auth.currentUser;
        if (currentUser && currentUser.email === invitation.email) {
          userUid = currentUser.uid;
        } else {
          userUid = `user_inv_${invitation.investorId}`;
        }
      } else {
        userUid = `user_inv_${invitation.investorId}`;
      }
    }

    // Set User Profile document in 'users' collection
    await setDoc(doc(db, 'users', userUid), {
      uid: userUid,
      email: invitation.email,
      displayName: investor.name,
      role: 'investor',
      investorId: investor.id,
      investorMasterId: investor.investorId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    // Mark invitation token as ACTIVATED (single-use enforcement)
    const invQuery = query(collection(db, 'portal_invitations'), where('token', '==', token));
    const invSnapshots = await getDocs(invQuery);
    if (!invSnapshots.empty) {
      await updateDoc(invSnapshots.docs[0].ref, {
        status: 'ACTIVATED',
        usedAt: new Date().toISOString()
      });
    }

    // Update investor profile
    await updateDoc(invRef, {
      portalStatus: 'ACTIVATED',
      portalUid: userUid,
      uid: userUid
    });

    // Log activation audit
    await addDoc(collection(db, 'portal_invitation_logs'), {
      invitationId: invitation.id,
      investorId: investor.id,
      action: 'ACTIVATED',
      timestamp: new Date().toISOString(),
      performerUid: userUid,
      details: `Investor ${investor.name} successfully activated portal account.`
    } as PortalInvitationLog);

    return {
      success: true,
      userUid,
      message: 'Your investor portal account has been activated successfully!'
    };
  } catch (error: any) {
    console.error('Account activation failed:', error);
    throw error;
  }
};

/**
 * Resend Portal Activation Invitation
 */
export const resendPortalInvitation = async (
  investorDocId: string,
  adminUid: string
): Promise<PortalInvitation> => {
  const invRef = doc(db, 'investors', investorDocId);
  const invSnap = await getDoc(invRef);
  if (!invSnap.exists()) throw new Error('Investor profile not found.');
  const investor = { id: invSnap.id, ...invSnap.data() } as Investor;

  if (!investor.email) throw new Error('Investor does not have a valid email address.');

  return createPortalInvitationToken(investorDocId, investor.email, adminUid, 48);
};

/**
 * Enable / Disable Portal Access Status
 */
export const setPortalAccessStatus = async (
  investorDocId: string,
  status: PortalStatus,
  performerUid: string
): Promise<void> => {
  const invRef = doc(db, 'investors', investorDocId);
  await updateDoc(invRef, {
    portalStatus: status
  });

  await addDoc(collection(db, 'portal_invitation_logs'), {
    invitationId: 'SYS_ACTION',
    investorId: investorDocId,
    action: status === 'DISABLED' ? 'FAILED' : 'VERIFIED',
    timestamp: new Date().toISOString(),
    performerUid,
    details: `Portal access status updated to ${status}.`
  } as PortalInvitationLog);
};
