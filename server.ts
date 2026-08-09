import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import fs from 'fs';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let aiClient: any = null;
function getGemini() {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      console.warn("GEMINI_API_KEY is not set in environment variables");
    }
    aiClient = new GoogleGenAI({
      apiKey: key || "MOCK_KEY",
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

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
  try {
    const app = express();
    const PORT = 3000;

    // Increase payload limit for PDF base64
    app.use(express.json({ limit: '10mb' }));
    
    // API routes FIRST
    app.get('/api/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

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

  app.post('/api/send-certificate', async (req, res) => {
    const { investorEmail, investorName, pdfBase64, certificateSerial, fundName, issueDate, bodyMessage } = req.body;

    try {
      const html = `
        <div style="font-family: sans-serif; color: #1e293b; line-height: 1.6; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; padding: 28px; background: #ffffff;">
          <div style="text-align: center; padding-bottom: 20px; border-bottom: 2px solid #f1f5f9;">
            <h2 style="color: #0f172a; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">Official Certificate of Membership</h2>
            <p style="color: #0284c7; margin-top: 4px; font-size: 14px; font-weight: 600;">${fundName || 'OmniFund Global'}</p>
          </div>
          <div style="padding: 24px 0;">
            <p style="font-size: 16px; font-weight: 600; color: #0f172a;">Dear ${investorName},</p>
            <p style="font-size: 14px; color: #334155;">${bodyMessage || `We are pleased to formally issue your official, one-time Certificate of Membership in <strong>${fundName || 'OmniFund'}</strong>.`}</p>
            <p style="font-size: 14px; color: #334155;">Your official high-resolution certificate is attached to this email.</p>
            <div style="margin: 20px 0; padding: 16px; background: #f8fafc; border-radius: 12px; border: 1px dashed #cbd5e1; font-size: 13px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                <span style="color: #64748b;">Certificate Serial:</span>
                <strong style="font-family: monospace; color: #0f172a;">${certificateSerial}</strong>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #64748b;">Issue Date:</span>
                <strong style="color: #0f172a;">${issueDate || new Date().toLocaleDateString()}</strong>
              </div>
            </div>
            <p style="font-size: 13px; color: #64748b;">Please store this official record safely in your permanent financial archives.</p>
          </div>
          <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; text-align: center; font-size: 12px; color: #94a3b8;">
            <p style="margin: 0;">This is an automated certificate distribution notice from ${fundName || 'OmniFund'} Administrative Services.</p>
          </div>
        </div>
      `;

      await sendGmail(investorEmail, `Certificate of Membership - ${investorName} (${certificateSerial})`, html, [
        {
          filename: `Certificate_of_Membership_${investorName.replace(/\s+/g, '_')}_${certificateSerial}.pdf`,
          content: pdfBase64,
        }
      ]);

      res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('Send Certificate Error:', error);
      res.status(500).json({ error: error.message || 'Failed to send certificate' });
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

  app.post('/api/account-chat', async (req, res) => {
    const { message, chatHistory, account, portfolio, investors, transactions } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    try {
      const gemini = getGemini();

      const systemInstruction = `You are OmniFund AI Account Copilot, a powerful and precise AI agent for managing investment account ledger and data.
Your goal is to assist the user by answering queries about the investment account, and formulating structured data-modification "operations" when asked to edit account information or modify data.

Here is the current account context:
- Account details: ${JSON.stringify(account)}
- Active Portfolio/Asset Holdings: ${JSON.stringify(portfolio)}
- Investors: ${JSON.stringify(investors)}
- Transaction history (recent): ${JSON.stringify(transactions?.slice(0, 50))}

Your response must be a JSON object containing two fields:
1. "text": a conversational response written in professional markdown, answering the user's question, explaining your analysis, or summarizing the operations you have staged. Do NOT use flowery language. Keep it professional.
2. "operations": an array of modification tasks to be executed. If no data modifications are requested, return an empty array.

Supported Operations:

- UPDATE_ACCOUNT:
  Description: Modify account fields.
  Format: { "type": "UPDATE_ACCOUNT", "data": { "name": "...", "ticker": "...", "description": "...", "nav": 1.0, "cashBalance": 1000, "aum": 5000, "totalUnits": 5000 }, "description": "Update account details" }

- ADD_PORTFOLIO_ASSET:
  Description: Create a new asset in the portfolio.
  Format: { "type": "ADD_PORTFOLIO_ASSET", "data": { "name": "Apple Inc.", "ticker": "AAPL", "quantity": 100, "costBasis": 150.0, "currentPrice": 160.0, "marketValue": 16000.0, "sector": "Technology" }, "description": "Add Apple to portfolio" }

- UPDATE_PORTFOLIO_ASSET:
  Description: Update an existing asset in the portfolio. Match by 'id'.
  Format: { "type": "UPDATE_PORTFOLIO_ASSET", "data": { "id": "ASSET_DOC_ID", "name": "...", "ticker": "...", "quantity": 100, "costBasis": 150.0, "currentPrice": 160.0, "marketValue": 16000.0, "sector": "Technology" }, "description": "Update Apple in portfolio" }

- DELETE_PORTFOLIO_ASSET:
  Description: Delete an existing asset in the portfolio. Match by 'id'.
  Format: { "type": "DELETE_PORTFOLIO_ASSET", "data": { "id": "ASSET_DOC_ID" }, "description": "Delete TSLA from portfolio" }

- ADD_TRANSACTION:
  Description: Record a new BUY or SELL transaction for an investor.
  Format: { "type": "ADD_TRANSACTION", "data": { "investorId": "INVESTOR_DOC_ID_IF_EXISTING", "investorName": "John Doe", "investorEmail": "john@example.com", "type": "BUY"|"SELL", "units": 500.0, "totalAmount": 5000.0 }, "description": "Record BUY transaction of 500 units for John Doe" }
  Note: If the investor is existing, match by investorId from the provided list. If they are new, leave investorId empty/null, and provide their investorName and investorEmail so a new investor is created.

- ADD_INVESTOR:
  Description: Register a new investor.
  Format: { "type": "ADD_INVESTOR", "data": { "name": "John Doe", "email": "john@example.com", "phone": "123456789", "unitsOwned": 0, "totalInvestment": 0 }, "description": "Register new investor John Doe" }

- UPDATE_INVESTOR:
  Description: Update an existing investor. Match by 'id'.
  Format: { "type": "UPDATE_INVESTOR", "data": { "id": "INVESTOR_DOC_ID", "name": "...", "email": "...", "phone": "..." }, "description": "Update investor John Doe's contact info" }

Rules:
1. Only generate operations that the user explicitly or implicitly requested.
2. If asked to add or update an asset, always try to calculate "marketValue" as quantity * currentPrice.
3. Be direct, helpful, and strictly adhere to formats. If the user only asked a question without wanting to modify data, return "operations" as an empty array []`;

      const contents = [];
      
      // Map prior chat history to Part structures
      if (chatHistory && chatHistory.length > 0) {
        chatHistory.forEach((item: any) => {
          contents.push({
            role: item.role === 'user' ? 'user' : 'model',
            parts: [{ text: item.content || item.text }]
          });
        });
      }
      
      // Add the current user prompt
      contents.push({
        role: 'user',
        parts: [{ text: message }]
      });

      const response = await gemini.models.generateContent({
        model: 'gemini-3.5-flash',
        contents,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              text: {
                type: Type.STRING,
                description: "The assistant response text explaining what it did and answering queries."
              },
              operations: {
                type: Type.ARRAY,
                description: "Staged data modifications to be approved and executed.",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    type: {
                      type: Type.STRING,
                      enum: [
                        "UPDATE_ACCOUNT",
                        "ADD_PORTFOLIO_ASSET",
                        "UPDATE_PORTFOLIO_ASSET",
                        "DELETE_PORTFOLIO_ASSET",
                        "ADD_TRANSACTION",
                        "ADD_INVESTOR",
                        "UPDATE_INVESTOR"
                      ],
                      description: "Operation type: UPDATE_ACCOUNT, ADD_PORTFOLIO_ASSET, UPDATE_PORTFOLIO_ASSET, DELETE_PORTFOLIO_ASSET, ADD_TRANSACTION, ADD_INVESTOR, UPDATE_INVESTOR"
                    },
                    data: {
                      type: Type.OBJECT,
                      description: "The payload data matching the operation requirements."
                    },
                    description: {
                      type: Type.STRING,
                      description: "A friendly, short human-readable description of this specific action."
                    }
                  },
                  required: ["type", "data", "description"]
                }
              }
            },
            required: ["text", "operations"]
          }
        }
      });

      const resultText = response.text;
      const parsed = JSON.parse(resultText || '{}');
      res.json(parsed);
    } catch (error: any) {
      console.error('AI Account Chat Error:', error);
      res.status(500).json({ error: error.message || 'Failed to process AI chat' });
    }
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
  } catch (error) {
    console.error('CRITICAL: Server failed to start:', error);
    process.exit(1);
  }
}

startServer();
