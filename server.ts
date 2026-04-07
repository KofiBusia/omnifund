import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TOKEN_PATH = path.join(process.cwd(), 'google_tokens.json');

// Google OAuth2 Setup
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.APP_URL || 'http://localhost:3000'}/auth/google/callback`
);

let googleTokens: any = null;

// Load tokens from file on startup
try {
  if (fs.existsSync(TOKEN_PATH)) {
    const data = fs.readFileSync(TOKEN_PATH, 'utf8');
    googleTokens = JSON.parse(data);
    oauth2Client.setCredentials(googleTokens);
    console.log('Loaded Google tokens from storage');
  }
} catch (error) {
  console.error('Failed to load Google tokens:', error);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase payload limit for PDF base64
  app.use(express.json({ limit: '10mb' }));

  // --- Google Auth Routes ---
  app.get('/api/auth/google/url', (req, res) => {
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/userinfo.email'],
      prompt: 'consent'
    });
    res.json({ url });
  });

  app.get(['/auth/google/callback', '/auth/google/callback/'], async (req, res) => {
    const { code } = req.query;
    try {
      const { tokens } = await oauth2Client.getToken(code as string);
      googleTokens = tokens;
      oauth2Client.setCredentials(tokens);
      
      // Persist tokens
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
      
      res.send(`
        <html>
          <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #0f172a; color: white;">
            <div style="text-align: center;">
              <h2 style="color: #10b981;">Gmail Connected!</h2>
              <p>You can close this window now.</p>
              <script>
                if (window.opener) {
                  window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS' }, '*');
                  setTimeout(() => window.close(), 1000);
                }
              </script>
            </div>
          </body>
        </html>
      `);
    } catch (error) {
      console.error('Google Auth Error:', error);
      res.status(500).send('Authentication failed');
    }
  });

  app.get('/api/auth/google/status', (req, res) => {
    res.json({ connected: !!googleTokens });
  });

  // --- Email Sending Logic ---
  const sendGmail = async (to: string, subject: string, html: string, attachments: any[] = []) => {
    if (!googleTokens) throw new Error('Gmail not connected. Please click "Connect Gmail" in the Investor Registry header.');
    
    oauth2Client.setCredentials(googleTokens);
    
    // Handle token refresh if needed
    oauth2Client.on('tokens', (tokens) => {
      if (tokens.refresh_token) {
        // store the new tokens
        googleTokens = { ...googleTokens, ...tokens };
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(googleTokens));
      }
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const boundary = 'foo_bar_baz';
    const nl = '\n';
    
    let raw = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: multipart/mixed; boundary=' + boundary,
      '',
      '--' + boundary,
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      html,
      '',
    ].join(nl);

    for (const attachment of attachments) {
      raw += [
        '--' + boundary,
        `Content-Type: application/pdf; name="${attachment.filename}"`,
        'Content-Transfer-Encoding: base64',
        'Content-Disposition: attachment; filename="' + attachment.filename + '"',
        '',
        attachment.content,
        '',
      ].join(nl);
    }

    raw += '--' + boundary + '--';

    const encodedMessage = Buffer.from(raw)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });
  };

  // API Routes
  app.post('/api/send-statement', async (req, res) => {
    const { investorEmail, investorName, pdfBase64, startDate, endDate, fundName } = req.body;

    try {
      const html = `
        <div style="font-family: sans-serif; color: #334155; line-height: 1.6;">
          <h2 style="color: #10b981;">${fundName || 'Investment'} Statement</h2>
          <p>Dear ${investorName},</p>
          <p>Please find attached your investment statement for the period <strong>${startDate}</strong> to <strong>${endDate}</strong>.</p>
          <p>This statement includes a summary of your investment performance, current valuation, and transaction history.</p>
          <p>If you have any questions, please contact our support team.</p>
          <br />
          <p style="font-size: 12px; color: #94a3b8;">Best regards,<br />The ${fundName || 'OmniFund'} Team</p>
        </div>
      `;

      await sendGmail(investorEmail, `Investment Statement: ${startDate} to ${endDate}`, html, [
        {
          filename: `${investorName.replace(/\s+/g, '_')}_Statement_${startDate}_to_${endDate}.pdf`,
          content: pdfBase64,
        }
      ]);

      res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('Gmail Send Error:', error);
      res.status(500).json({ error: error.message || 'Failed to send email' });
    }
  });

  app.post('/api/send-email', async (req, res) => {
    const { to, subject, body, investorName, fundName } = req.body;

    try {
      const html = `
        <div style="font-family: sans-serif; color: #334155; line-height: 1.6;">
          <h2 style="color: #10b981;">${fundName || 'Investment'} Notification</h2>
          <p>Dear ${investorName},</p>
          <div style="margin: 20px 0; padding: 20px; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
            ${body.replace(/\n/g, '<br/>')}
          </div>
          <p>If you have any questions, please contact our support team.</p>
          <br />
          <p style="font-size: 12px; color: #94a3b8;">Best regards,<br />The ${fundName || 'OmniFund'} Team</p>
        </div>
      `;

      await sendGmail(to, subject, html);
      res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('Gmail Send Error:', error);
      res.status(500).json({ error: error.message || 'Failed to send email' });
    }
  });

  app.post('/api/send-bulk-email', async (req, res) => {
    const { investors, subject, body, fundName } = req.body;
    
    if (!googleTokens) return res.status(401).json({ error: 'Gmail not connected' });

    const results = { success: 0, failed: 0, errors: [] as string[] };

    for (const investor of investors) {
      try {
        const html = `
          <div style="font-family: sans-serif; color: #334155; line-height: 1.6;">
            <h2 style="color: #10b981;">${investor.fundName || fundName || 'Investment'} Update</h2>
            <p>Dear ${investor.name},</p>
            <div style="margin: 20px 0; padding: 20px; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
              ${body.replace(/\n/g, '<br/>')}
            </div>
            <p>If you have any questions, please contact our support team.</p>
            <br />
            <p style="font-size: 12px; color: #94a3b8;">Best regards,<br />The ${investor.fundName || fundName || 'OmniFund'} Team</p>
          </div>
        `;
        await sendGmail(investor.email, subject, html);
        results.success++;
      } catch (error: any) {
        results.failed++;
        results.errors.push(`${investor.name}: ${error.message}`);
      }
    }

    res.json(results);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
