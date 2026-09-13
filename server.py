"""OmniFund backend — Python port of server.ts (Flask + Gmail OAuth + Gemini AI copilot).

Serves the built React/Vite frontend (./dist) as static files and implements
the same API contract the frontend already calls under /api/* and /auth/*.
"""
import base64
import json
import os
from datetime import datetime, timezone
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

import requests
from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request, send_from_directory
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build as build_google_service

from google import genai
from google.genai import types as genai_types

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
DIST_DIR = BASE_DIR / "dist"
TOKEN_PATH = BASE_DIR / "google_tokens.json"

APP_URL = os.environ.get("APP_URL", "http://localhost:3000")
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

REDIRECT_URI = f"{APP_URL}/auth/google/callback"
GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/userinfo.email",
]

AFX_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

app = Flask(__name__, static_folder=None)

google_tokens = None
if TOKEN_PATH.exists():
    try:
        google_tokens = json.loads(TOKEN_PATH.read_text())
        print("Loaded Google tokens from storage")
    except Exception as e:  # noqa: BLE001
        print(f"Failed to load Google tokens: {e}")

_gemini_client = None


def get_gemini():
    global _gemini_client
    if _gemini_client is None:
        if not GEMINI_API_KEY:
            print("GEMINI_API_KEY is not set in environment variables")
        _gemini_client = genai.Client(api_key=GEMINI_API_KEY or "MOCK_KEY")
    return _gemini_client


def build_oauth_flow():
    client_config = {
        "web": {
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [REDIRECT_URI],
        }
    }
    return Flow.from_client_config(client_config, scopes=GMAIL_SCOPES, redirect_uri=REDIRECT_URI)


def save_tokens(creds: Credentials):
    global google_tokens
    google_tokens = {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": creds.scopes,
    }
    TOKEN_PATH.write_text(json.dumps(google_tokens))


def get_credentials():
    if not google_tokens:
        return None
    creds = Credentials(
        token=google_tokens.get("token"),
        refresh_token=google_tokens.get("refresh_token"),
        token_uri=google_tokens.get("token_uri", "https://oauth2.googleapis.com/token"),
        client_id=google_tokens.get("client_id", GOOGLE_CLIENT_ID),
        client_secret=google_tokens.get("client_secret", GOOGLE_CLIENT_SECRET),
        scopes=google_tokens.get("scopes", GMAIL_SCOPES),
    )
    if creds.expired and creds.refresh_token:
        creds.refresh(GoogleAuthRequest())
        save_tokens(creds)
    return creds


def send_gmail(to: str, subject: str, html: str, attachments=None):
    if not google_tokens:
        raise RuntimeError(
            'Gmail not connected. Please click "Connect Gmail" in the Investor Registry header.'
        )

    creds = get_credentials()
    service = build_google_service("gmail", "v1", credentials=creds)

    message = MIMEMultipart("mixed")
    message["To"] = to
    message["Subject"] = subject
    message.attach(MIMEText(html, "html", "utf-8"))

    for attachment in attachments or []:
        part = MIMEBase("application", "pdf")
        part.set_payload(base64.b64decode(attachment["content"]))
        encoders.encode_base64(part)
        part.add_header(
            "Content-Disposition", f'attachment; filename="{attachment["filename"]}"'
        )
        message.attach(part)

    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
    service.users().messages().send(userId="me", body={"raw": raw}).execute()


# --- Health & AFX proxy -----------------------------------------------------

@app.route("/api/health")
def health():
    return jsonify(status="ok", timestamp=datetime.now(timezone.utc).isoformat())


@app.route("/api/afx-gse")
def afx_gse():
    try:
        resp = requests.get(
            "https://afx.kwayisi.org/gse/", headers={"User-Agent": AFX_UA}, timeout=15
        )
        if not resp.ok:
            return Response("Failed to fetch from AFX", status=resp.status_code)
        return Response(resp.text, mimetype="text/html")
    except Exception as e:  # noqa: BLE001
        return jsonify(error=str(e) or "AFX fetch error"), 500


# --- Google OAuth ------------------------------------------------------------

@app.route("/api/auth/google/url")
def google_auth_url():
    flow = build_oauth_flow()
    auth_url, _ = flow.authorization_url(access_type="offline", prompt="consent")
    return jsonify(url=auth_url)


@app.route("/auth/google/callback", strict_slashes=False)
def google_auth_callback():
    code = request.args.get("code")
    try:
        flow = build_oauth_flow()
        flow.fetch_token(code=code)
        save_tokens(flow.credentials)
        return """
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
        """
    except Exception as e:  # noqa: BLE001
        print(f"Google Auth Error: {e}")
        return "Authentication failed", 500


@app.route("/api/auth/google/status")
def google_auth_status():
    return jsonify(connected=bool(google_tokens))


# --- Email sending -----------------------------------------------------------

@app.route("/api/send-statement", methods=["POST"])
def send_statement():
    data = request.get_json(force=True) or {}
    investor_email = data.get("investorEmail")
    investor_name = data.get("investorName", "")
    pdf_base64 = data.get("pdfBase64")
    start_date = data.get("startDate")
    end_date = data.get("endDate")
    fund_name = data.get("fundName") or "Investment"

    html = f"""
        <div style="font-family: sans-serif; color: #334155; line-height: 1.6;">
          <h2 style="color: #10b981;">{fund_name} Statement</h2>
          <p>Dear {investor_name},</p>
          <p>Please find attached your investment statement for the period <strong>{start_date}</strong> to <strong>{end_date}</strong>.</p>
          <p>This statement includes a summary of your investment performance, current valuation, and transaction history.</p>
          <p>If you have any questions, please contact our support team.</p>
          <br />
          <p style="font-size: 12px; color: #94a3b8;">Best regards,<br />The {fund_name} Team</p>
        </div>
      """

    try:
        filename = f"{investor_name.replace(' ', '_')}_Statement_{start_date}_to_{end_date}.pdf"
        send_gmail(
            investor_email,
            f"Investment Statement: {start_date} to {end_date}",
            html,
            [{"filename": filename, "content": pdf_base64}],
        )
        return jsonify(success=True)
    except Exception as e:  # noqa: BLE001
        print(f"Gmail Send Error: {e}")
        return jsonify(error=str(e) or "Failed to send email"), 500


@app.route("/api/send-certificate", methods=["POST"])
def send_certificate():
    data = request.get_json(force=True) or {}
    investor_email = data.get("investorEmail")
    investor_name = data.get("investorName", "")
    pdf_base64 = data.get("pdfBase64")
    certificate_serial = data.get("certificateSerial")
    fund_name = data.get("fundName") or "OmniFund"
    issue_date = data.get("issueDate") or datetime.now().strftime("%m/%d/%Y")
    body_message = data.get("bodyMessage") or (
        f"We are pleased to formally issue your official, one-time Certificate of "
        f"Membership in <strong>{fund_name}</strong>."
    )

    html = f"""
        <div style="font-family: sans-serif; color: #1e293b; line-height: 1.6; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; padding: 28px; background: #ffffff;">
          <div style="text-align: center; padding-bottom: 20px; border-bottom: 2px solid #f1f5f9;">
            <h2 style="color: #0f172a; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">Official Certificate of Membership</h2>
            <p style="color: #0284c7; margin-top: 4px; font-size: 14px; font-weight: 600;">{fund_name}</p>
          </div>
          <div style="padding: 24px 0;">
            <p style="font-size: 16px; font-weight: 600; color: #0f172a;">Dear {investor_name},</p>
            <p style="font-size: 14px; color: #334155;">{body_message}</p>
            <p style="font-size: 14px; color: #334155;">Your official high-resolution certificate is attached to this email.</p>
            <div style="margin: 20px 0; padding: 16px; background: #f8fafc; border-radius: 12px; border: 1px dashed #cbd5e1; font-size: 13px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                <span style="color: #64748b;">Certificate Serial:</span>
                <strong style="font-family: monospace; color: #0f172a;">{certificate_serial}</strong>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #64748b;">Issue Date:</span>
                <strong style="color: #0f172a;">{issue_date}</strong>
              </div>
            </div>
            <p style="font-size: 13px; color: #64748b;">Please store this official record safely in your permanent financial archives.</p>
          </div>
          <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; text-align: center; font-size: 12px; color: #94a3b8;">
            <p style="margin: 0;">This is an automated certificate distribution notice from {fund_name} Administrative Services.</p>
          </div>
        </div>
      """

    try:
        filename = f"Certificate_of_Membership_{investor_name.replace(' ', '_')}_{certificate_serial}.pdf"
        send_gmail(
            investor_email,
            f"Certificate of Membership - {investor_name} ({certificate_serial})",
            html,
            [{"filename": filename, "content": pdf_base64}],
        )
        return jsonify(success=True)
    except Exception as e:  # noqa: BLE001
        print(f"Send Certificate Error: {e}")
        return jsonify(error=str(e) or "Failed to send certificate"), 500


@app.route("/api/send-email", methods=["POST"])
def send_email():
    data = request.get_json(force=True) or {}
    to = data.get("to")
    subject = data.get("subject")
    body = data.get("body", "")
    investor_name = data.get("investorName", "")
    fund_name = data.get("fundName") or "Investment"

    html = f"""
        <div style="font-family: sans-serif; color: #334155; line-height: 1.6;">
          <h2 style="color: #10b981;">{fund_name} Notification</h2>
          <p>Dear {investor_name},</p>
          <div style="margin: 20px 0; padding: 20px; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
            {body.replace(chr(10), '<br/>')}
          </div>
          <p>If you have any questions, please contact our support team.</p>
          <br />
          <p style="font-size: 12px; color: #94a3b8;">Best regards,<br />The {fund_name} Team</p>
        </div>
      """

    try:
        send_gmail(to, subject, html)
        return jsonify(success=True)
    except Exception as e:  # noqa: BLE001
        print(f"Gmail Send Error: {e}")
        return jsonify(error=str(e) or "Failed to send email"), 500


@app.route("/api/send-bulk-email", methods=["POST"])
def send_bulk_email():
    data = request.get_json(force=True) or {}
    investors = data.get("investors", [])
    subject = data.get("subject")
    body = data.get("body", "")
    fund_name = data.get("fundName")

    if not google_tokens:
        return jsonify(error="Gmail not connected"), 401

    results = {"success": 0, "failed": 0, "errors": []}

    for investor in investors:
        try:
            investor_fund_name = investor.get("fundName") or fund_name or "Investment"
            html = f"""
          <div style="font-family: sans-serif; color: #334155; line-height: 1.6;">
            <h2 style="color: #10b981;">{investor_fund_name} Update</h2>
            <p>Dear {investor.get('name')},</p>
            <div style="margin: 20px 0; padding: 20px; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
              {body.replace(chr(10), '<br/>')}
            </div>
            <p>If you have any questions, please contact our support team.</p>
            <br />
            <p style="font-size: 12px; color: #94a3b8;">Best regards,<br />The {investor_fund_name} Team</p>
          </div>
        """
            send_gmail(investor.get("email"), subject, html)
            results["success"] += 1
        except Exception as e:  # noqa: BLE001
            results["failed"] += 1
            results["errors"].append(f"{investor.get('name')}: {e}")

    return jsonify(results)


# --- AI Account Copilot -------------------------------------------------------

SYSTEM_INSTRUCTION_TEMPLATE = """You are OmniFund AI Account Copilot, a powerful and precise AI agent for managing investment account ledger and data.
Your goal is to assist the user by answering queries about the investment account, and formulating structured data-modification "operations" when asked to edit account information or modify data.

Here is the current account context:
- Account details: __ACCOUNT__
- Active Portfolio/Asset Holdings: __PORTFOLIO__
- Investors: __INVESTORS__
- Transaction history (recent): __TRANSACTIONS__

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
3. Be direct, helpful, and strictly adhere to formats. If the user only asked a question without wanting to modify data, return "operations" as an empty array []"""


@app.route("/api/account-chat", methods=["POST"])
def account_chat():
    data = request.get_json(force=True) or {}
    message = data.get("message")
    chat_history = data.get("chatHistory") or []
    account = data.get("account")
    portfolio = data.get("portfolio")
    investors = data.get("investors")
    transactions = data.get("transactions") or []

    if not message:
        return jsonify(error="Message is required"), 400

    try:
        client = get_gemini()

        system_instruction = (
            SYSTEM_INSTRUCTION_TEMPLATE.replace("__ACCOUNT__", json.dumps(account))
            .replace("__PORTFOLIO__", json.dumps(portfolio))
            .replace("__INVESTORS__", json.dumps(investors))
            .replace("__TRANSACTIONS__", json.dumps(transactions[:50]))
        )

        contents = []
        for item in chat_history:
            role = "user" if item.get("role") == "user" else "model"
            text = item.get("content") or item.get("text")
            contents.append({"role": role, "parts": [{"text": text}]})
        contents.append({"role": "user", "parts": [{"text": message}]})

        operation_types = [
            "UPDATE_ACCOUNT",
            "ADD_PORTFOLIO_ASSET",
            "UPDATE_PORTFOLIO_ASSET",
            "DELETE_PORTFOLIO_ASSET",
            "ADD_TRANSACTION",
            "ADD_INVESTOR",
            "UPDATE_INVESTOR",
        ]

        response_schema = genai_types.Schema(
            type=genai_types.Type.OBJECT,
            properties={
                "text": genai_types.Schema(
                    type=genai_types.Type.STRING,
                    description="The assistant response text explaining what it did and answering queries.",
                ),
                "operations": genai_types.Schema(
                    type=genai_types.Type.ARRAY,
                    description="Staged data modifications to be approved and executed.",
                    items=genai_types.Schema(
                        type=genai_types.Type.OBJECT,
                        properties={
                            "type": genai_types.Schema(
                                type=genai_types.Type.STRING,
                                enum=operation_types,
                                description="Operation type: " + ", ".join(operation_types),
                            ),
                            "data": genai_types.Schema(
                                type=genai_types.Type.OBJECT,
                                description="The payload data matching the operation requirements.",
                            ),
                            "description": genai_types.Schema(
                                type=genai_types.Type.STRING,
                                description="A friendly, short human-readable description of this specific action.",
                            ),
                        },
                        required=["type", "data", "description"],
                    ),
                ),
            },
            required=["text", "operations"],
        )

        response = client.models.generate_content(
            model="gemini-3.5-flash",
            contents=contents,
            config=genai_types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                response_schema=response_schema,
            ),
        )

        parsed = json.loads(response.text or "{}")
        return jsonify(parsed)
    except Exception as e:  # noqa: BLE001
        print(f"AI Account Chat Error: {e}")
        return jsonify(error=str(e) or "Failed to process AI chat"), 500


# --- Static frontend -----------------------------------------------------------

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    if not DIST_DIR.exists():
        return (
            "Frontend build not found. Run `npm install && npm run build` first, "
            "then restart the Python server.",
            503,
        )
    full_path = DIST_DIR / path
    if path and full_path.is_file():
        return send_from_directory(DIST_DIR, path)
    return send_from_directory(DIST_DIR, "index.html")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 3000))
    app.run(host="0.0.0.0", port=port)
