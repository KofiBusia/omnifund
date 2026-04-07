import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { Resend } from 'resend';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resend = new Resend(process.env.RESEND_API_KEY);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase payload limit for PDF base64
  app.use(express.json({ limit: '10mb' }));

    // API Routes
    app.post('/api/send-statement', async (req, res) => {
      const { investorEmail, investorName, pdfBase64, startDate, endDate } = req.body;
  
      console.log(`Attempting to send statement to ${investorEmail} for ${investorName}`);

      if (!process.env.RESEND_API_KEY) {
        console.error('RESEND_API_KEY is missing from environment');
        return res.status(500).json({ error: 'RESEND_API_KEY is not configured' });
      }

    try {
      // NOTE: Resend requires domain verification to send from custom domains.
      // For testing with a new account, use 'onboarding@resend.dev'.
      // You can only send to your own email address until you verify a domain.
      const fromAddress = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
      
      const { data, error } = await resend.emails.send({
        from: `OmniFund <${fromAddress}>`,
        to: [investorEmail],
        subject: `Investment Statement: ${startDate} to ${endDate}`,
        html: `
          <div style="font-family: sans-serif; color: #334155; line-height: 1.6;">
            <h2 style="color: #10b981;">OmniFund Investment Statement</h2>
            <p>Dear ${investorName},</p>
            <p>Please find attached your investment statement for the period <strong>${startDate}</strong> to <strong>${endDate}</strong>.</p>
            <p>This statement includes a summary of your investment performance, current valuation, and transaction history.</p>
            <p>If you have any questions, please contact our support team.</p>
            <br />
            <p style="font-size: 12px; color: #94a3b8;">Best regards,<br />The OmniFund Team</p>
          </div>
        `,
        attachments: [
          {
            filename: `${investorName.replace(/\s+/g, '_')}_Statement_${startDate}_to_${endDate}.pdf`,
            content: pdfBase64,
          },
        ],
      });

      if (error) {
        console.error('Resend API Error:', error);
        return res.status(400).json({ error: error.message, details: error });
      }

      res.status(200).json({ success: true, data });
    } catch (error) {
      console.error('Server Error during email sending:', error);
      res.status(500).json({ error: 'Internal server error while sending email' });
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
}

startServer();
