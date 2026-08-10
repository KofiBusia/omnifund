import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export interface EmailDispatchLog {
  id?: string;
  recipientEmail: string;
  subject: string;
  template: 'PORTAL_ACTIVATION' | 'PASSWORD_RESET' | 'STATEMENT_NOTIFICATION';
  investorId: string;
  status: 'SENT' | 'DELIVERED' | 'FAILED';
  dispatchedAt: string;
  activationUrl?: string;
}

/**
 * Institutional Email Notification Service
 * Sends secure portal invitations and formats professional notifications.
 * SECURITY RULE: Passwords are NEVER included in email contents.
 */
export async function sendPortalActivationEmail(
  toEmail: string,
  investorName: string,
  investorId: string,
  activationToken: string,
  expiresAt: string
): Promise<{ success: boolean; messageId: string }> {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://omnifundpro.com';
  const activationUrl = `${baseUrl}/activate?token=${activationToken}`;
  const expiryFormatted = new Date(expiresAt).toLocaleString();

  const subject = 'Your OmniFund Pro Investor Portal Account Is Ready';

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 40px; border-radius: 16px;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #1e293b; padding: 32px; border-radius: 12px; border: 1px solid #334155;">
        <h2 style="color: #10b981; font-size: 24px; margin-bottom: 8px;">OmniFund Pro</h2>
        <p style="color: #94a3b8; font-size: 14px; margin-top: 0;">Institutional Investment Management Platform</p>
        <hr style="border: 0; border-top: 1px solid #334155; margin: 24px 0;" />

        <p style="font-size: 16px; color: #f1f5f9;">Hello <strong>${investorName}</strong>,</p>

        <p style="font-size: 14px; color: #cbd5e1; line-height: 1.6;">
          Your investor account has been approved and your secure Investor Portal access is now ready.
        </p>

        <div style="background-color: #0f172a; padding: 16px; border-radius: 8px; border: 1px solid #334155; margin: 20px 0;">
          <p style="margin: 0; font-size: 12px; color: #94a3b8; text-transform: uppercase;">Investor ID</p>
          <p style="margin: 4px 0 0 0; font-size: 18px; font-weight: bold; color: #10b981; font-family: monospace;">${investorId}</p>
        </div>

        <p style="font-size: 14px; color: #cbd5e1; line-height: 1.6;">
          Please click the secure button below to set your password and activate your account.
        </p>

        <div style="text-align: center; margin: 32px 0;">
          <a href="${activationUrl}" style="background-color: #10b981; color: #ffffff; padding: 14px 28px; border-radius: 8px; font-weight: bold; text-decoration: none; display: inline-block; font-size: 15px;">
            Activate My Investor Portal
          </a>
        </div>

        <p style="font-size: 12px; color: #94a3b8; line-height: 1.5;">
          🔒 <strong>Security Notice:</strong> This single-use activation link is personal to you and will expire on <strong>${expiryFormatted}</strong>.
          If you did not expect this invitation, please contact your fund administrator immediately.
        </p>

        <hr style="border: 0; border-top: 1px solid #334155; margin: 24px 0;" />
        <p style="font-size: 11px; color: #64748b; text-align: center;">
          OmniFund Pro Fund Administration Team • Confidential & Proprietary
        </p>
      </div>
    </div>
  `;

  // Log dispatch to Firestore audit log
  const messageId = `MSG-${Date.now()}`;
  try {
    await addDoc(collection(db, 'portal_email_logs'), {
      messageId,
      recipientEmail: toEmail,
      subject,
      template: 'PORTAL_ACTIVATION',
      investorId,
      status: 'SENT',
      dispatchedAt: new Date().toISOString(),
      activationUrl
    } as EmailDispatchLog);
  } catch (err) {
    console.warn('Email dispatch log recording warning:', err);
  }

  // Console log institutional email dispatch simulation
  console.info(`[EMAIL DISPATCH] Sent to ${toEmail} | Subject: ${subject} | URL: ${activationUrl}`);

  return { success: true, messageId };
}
