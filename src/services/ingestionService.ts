import { GoogleGenAI, Type } from "@google/genai";
import { InvestmentAccount, Investor, Asset } from "../types";
import * as XLSX from 'xlsx';

let aiInstance: GoogleGenAI | null = null;

function getAI() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not defined. Please set it in the environment.");
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

export interface IngestionResult {
  entities: {
    investors: Partial<Investor>[];
    funds: Partial<InvestmentAccount>[];
    assets: Partial<Asset>[];
  };
  mappings: {
    investorToFund: { investorId: string; fundTicker: string; units: number; value: number }[];
    fundToAsset: { fundTicker: string; assetTicker: string; quantity: number; price: number; value: number }[];
  };
  validationErrors: string[];
  confidence: number;
}

export class IngestionEngine {
  async processCustodianExports(
    files: { data: string; mimeType: string }[],
    existingContext: { accounts: InvestmentAccount[], investors: Investor[] },
    userInstructions?: string
  ): Promise<IngestionResult> {
    const prompt = `
      Act as an Institutional Custodian Data Resolver. 
      Analyze the provided financial data exports (${files.length} files).
      
      OBJECTIVE:
      Programmatically extract, merge, and link all fragmented data points from multiple sources into a unified ledger. 
      You are resolving complex institutional datasets where names might be abbreviated, misspelled, or mismatched.

      ${userInstructions ? `
      USER-SPECIFIED CONTEXTUAL INSTRUCTIONS (PRIORITIZE THESE):
      ${userInstructions}
      ` : ''}
      
      CRITICAL INSTRUCTIONS:
      1. INVESTOR NAMES: Extract the full legal name for every investor (e.g., 'Ahmed Tahiru', 'John Smith'). If the file contains only names as identifiers, use them as both 'name' and 'investorId'.
      2. ONBOARDING DATE: If a clear 'joining date', 'onboarding date', or 'initial subscription date' is visible for an investor, extract it as 'onboardDate' in YYYY-MM-DD format.
      3. RESOLUTION: If an extraction matches an entry in 'Known Investors', map it to that ID.
      4. ASSETS: Extract Tickers, Full Names, and Sectors (e.g., 'AAPL', 'Apple Inc.', 'Technology').
      5. INVESTOR-CENTRIC REPORTS: Some files are organized by Investor Sections. 
         A row with JUST an investor name (e.g. 'Ahmed Tahiru') followed by one or more rows of holdings (e.g. 'YIN Equity Trust Fund') means that investor holds those products (Funds). 
         - In these cases, the investor name might appear once as a header, and their specific holdings follow as subsequent rows.
         - 'Cash' or 'Portfolio' rows within an investor section indicate components of their position.
      6. ACCURACY: If you find a 'NAV' (Net Asset Value) for a fund, extract it exactly.
      7. FUND DATA: If creation of a new fund is implied (e.g. a fund being held by many investors), extract its Ticker and Description from the data context.
      8. NAV RESOLUTION: 'Latest Price' or 'Price' in a fund position report often represents the current NAV of that fund. Capturing this is critical for accurate ledger initialization.
      
      CONTEXT:
      Known Funds: ${JSON.stringify(existingContext.accounts.map(a => ({ id: a.id, ticker: a.ticker, name: a.name })))}
      Known Investors: ${JSON.stringify(existingContext.investors.map(i => ({ id: i.id, investorId: i.investorId, name: i.name })))}

      TASKS:
      1. Identify Entities & Identities: Extract unique Investors, Funds, and Assets. Prioritize capturing full legal names.
      2. Resolve Mapping: 
         - Link Investors to the Funds they hold positions in (capturing units and current market value).
         - Link Assets to the Funds that own them (if the report shows the Fund's internal portfolio).
      3. Integrity: Ensure quantities and values are extracted with high precision. Be careful with 'Total' rows; do not ingest them as separate entities, but use them for cross-validation.
      
      OUTPUT SCHEMA (Strict JSON):
      {
        "entities": {
          "investors": [{"name": string, "investorId": string, "onboardDate": string, "email": string}],
          "funds": [{"ticker": string, "name": string, "nav": number, "baseCurrency": string}],
          "assets": [{"ticker": string, "name": string, "sector": string}]
        },
        "mappings": {
          "investorToFund": [{"investorId": string, "fundTicker": string, "units": number, "value": number}],
          "fundToAsset": [{"fundTicker": string, "assetTicker": string, "quantity": number, "price": number, "value": number}]
        },
        "validationErrors": string[],
        "confidence": number (0-1)
      }

      Handle inconsistencies: If a name is slightly different but context suggests it's an existing entity, map it to the known ID.
    `;

    let parts: any[] = [{ text: prompt }];

    for (const [index, file] of files.entries()) {
      const { data, mimeType } = file;
      const isExcel = mimeType.includes('spreadsheet') || mimeType.includes('excel');
      const isPDF = mimeType === 'application/pdf';

      parts.push({ text: `--- Start of Data Source ${index + 1} (${mimeType}) ---` });

      if (isPDF) {
        parts.push({
          inlineData: {
            mimeType: mimeType,
            data: data
          }
        });
      } else if (isExcel) {
        try {
          const workbook = XLSX.read(data, { type: 'base64' });
          const sheetName = workbook.SheetNames[0];
          const csvData = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
          parts.push({ text: `Source ${index + 1} Contents (as CSV): \n${csvData}` });
        } catch (err) {
          console.error(`Excel conversion failed for file ${index + 1}:`, err);
          parts.push({ text: `Source ${index + 1} Contents (RAW BASE64): \n${data}` });
        }
      } else {
        try {
          const decodedData = atob(data);
          parts.push({ text: `Source ${index + 1} Contents: \n${decodedData}` });
        } catch (err) {
          parts.push({ text: `Source ${index + 1} Contents (RAW BASE64): \n${data}` });
        }
      }
      parts.push({ text: `--- End of Data Source ${index + 1} ---` });
    }

    try {
      const result = await getAI().models.generateContent({
        model: "gemini-3-flash-preview",
        contents: parts,
        config: {
          responseMimeType: "application/json",
        }
      });

      const data = JSON.parse(result.text || "{}") as IngestionResult;
      
      // Institutional-Grade Post-Processing Validation
      this.validateLedgerIntegrity(data);
      
      return data;
    } catch (error) {
      console.error("Ingestion Engine Failure:", error);
      throw new Error("Automated Custodian Ingestion Engine encountered a resolution error.");
    }
  }

  private validateLedgerIntegrity(data: IngestionResult) {
    // 1. Cross-Check Fund Totals
    for (const fund of data.entities.funds) {
      const fundAssets = data.mappings.fundToAsset.filter(m => m.fundTicker === fund.ticker);
      const calculatedAum = fundAssets.reduce((sum, a) => sum + a.value, 0);
      
      if (calculatedAum === 0 && fundAssets.length > 0) {
        data.validationErrors.push(`Zero-value portfolio detected for Fund [${fund.ticker}]. Verification required.`);
      }
    }

    // 2. Identity Collision Detection
    const investorNames = new Set();
    data.entities.investors.forEach(inv => {
      if (investorNames.has(inv.name)) {
        data.validationErrors.push(`Identity Collision: Duplicate investor name [${inv.name}] found in ingestion stream.`);
      }
      investorNames.add(inv.name);
    });

    // 3. Entity Reference Integrity
    data.mappings.investorToFund.forEach(m => {
      const fundExists = data.entities.funds.some(f => f.ticker === m.fundTicker);
      if (!fundExists) {
        data.validationErrors.push(`Orphaned Mapping: Investor [${m.investorId}] mapped to non-existent Fund [${m.fundTicker}].`);
      }
    });

    data.confidence = Math.max(0.1, data.confidence - (data.validationErrors.length * 0.05));
  }
}
