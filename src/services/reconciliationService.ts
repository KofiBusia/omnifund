import { GoogleGenAI, Type } from "@google/genai";
import { InvestmentAccount, Asset, Investor, Valuation } from "../types";

export interface ReconciliationResult {
  extractedData: {
    asOfDate: string;
    fundName: string;
    totalAum: number;
    totalUnits: number;
    nav: number;
    investorBalances?: { name: string; id?: string; units: number; value: number }[];
    assets?: { tickerMatched: string; name: string; quantity: number; price: number; value: number; confidence: number; reason: string }[];
  };
  discrepancies: {
    aumDiff: number;
    unitsDiff: number;
    navDiff: number;
    needsAdjustment: boolean;
  };
  suggestedActions: string[];
}

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

export class ReconciliationEngine {
  async analyzeDocument(data: string, mimeType: string, currentFund: InvestmentAccount, existingAssets: Asset[], isText: boolean = false): Promise<ReconciliationResult> {
    const assetContext = existingAssets.map(a => `${a.ticker} (${a.name})`).join(", ");
    
    const prompt = `
      You are an expert fund administrator and forensic accountant. 
      Analyze this financial document and extract the exact state of the fund.
      
      Current System Context for reference:
      Fund Name: ${currentFund.name}
      Current AUM: ${currentFund.aum}
      Current Units: ${currentFund.totalUnits}
      Current NAV: ${currentFund.nav}
      Existing Portfolio Assets (Tickers/Names): ${assetContext}

      TASK:
      1. Extract high-level fund data: As of Date, Fund Name, AUM, Total Units, NAV.
      2. Extract individual asset holdings (Line items). 
      3. For each extracted line item, perform "Smart Attribution":
         - Match the line item to an existing asset from the provided context if possible.
         - If it's a new or unknown asset, indicate so.
         - Provide a confidence score (0-1) for the match.
         - Provide a short reason for the mapping (e.g., "Exact ticker match", "Fuzzy name match", "New position").

      Extract the following data into a strict JSON format:
      {
        "asOfDate": "ISO string",
        "fundName": "string",
        "totalAum": number,
        "totalUnits": number,
        "nav": number,
        "investorBalances": [{ "name": "string", "id": "string", "units": number, "value": number }],
        "assets": [
          {
            "tickerMatched": "The Ticker from system context it matches to (or 'NEW')",
            "name": "The name as it appears in the document",
            "quantity": number,
            "price": number,
            "value": number,
            "confidence": number,
            "reason": "string"
          }
        ]
      }

      Be highly precise. 
      IMPORTANT: If the document contains many assets (more than 20), only include the top 20 by value individually, and aggregate the rest into a single 'OTHER ASSETS' entry in the 'assets' array.
      If any values are missing, try to derive them (AUM / Units = NAV).
    `;

    const parts: any[] = [{ text: prompt }];
    if (isText) {
      parts.push({ text: `DOCUMENT CONTENT:\n${data}` });
    } else {
      parts.push({ inlineData: { mimeType, data } });
    }

    let result: any;
    try {
      result = await getAI().models.generateContent({
        model: "gemini-3-flash-preview",
        contents: parts,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
          type: Type.OBJECT,
          properties: {
            asOfDate: { type: Type.STRING },
            fundName: { type: Type.STRING },
            totalAum: { type: Type.NUMBER },
            totalUnits: { type: Type.NUMBER },
            nav: { type: Type.NUMBER },
            investorBalances: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  id: { type: Type.STRING },
                  units: { type: Type.NUMBER },
                  value: { type: Type.NUMBER }
                }
              }
            },
            assets: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  tickerMatched: { type: Type.STRING },
                  name: { type: Type.STRING },
                  quantity: { type: Type.NUMBER },
                  price: { type: Type.NUMBER },
                  value: { type: Type.NUMBER },
                  confidence: { type: Type.NUMBER },
                  reason: { type: Type.STRING }
                }
              }
            }
          }
        }
      }
    });
    } catch (apiError: any) {
      console.error("Gemini API Error:", apiError);
      if (apiError.message?.includes("500") || apiError.status === 500) {
        throw new Error("The AI model is currently experiencing high demand (Internal Error 500). Please try again in 30 seconds or with a smaller file.");
      }
      throw apiError;
    }

    let rawText = "";
    try {
      rawText = result.text || "";
    } catch (e) {
      console.error("Failed to get response text:", e);
      throw new Error("The AI model failed to generate a readable response. Please try again with a smaller file.");
    }

    // Clean the text: sometimes models include markdown or trailing text even with application/json
    let cleanedText = rawText.trim();
    if (cleanedText.startsWith("```json")) {
      cleanedText = cleanedText.replace(/```json\s?|\s?```/g, "");
    }
    
    let extracted: any;
    try {
      extracted = JSON.parse(cleanedText);
    } catch (e) {
      console.error("JSON Parse Error at position:", (e as any).message);
      
      // Advanced JSON repair for truncated strings or missing structures
      try {
        let repaired = cleanedText;
        
        // 1. If it ends and was likely in the middle of a string, close the string
        if (repaired.match(/[a-zA-Z0-9_\-\s]$/)) {
          repaired += '"'; 
        }

        // 2. Count brackets and braces
        let bracketStack = [];
        let inString = false;
        let escaped = false;
        
        for (let i = 0; i < repaired.length; i++) {
          let char = repaired[i];
          if (char === '"' && !escaped) inString = !inString;
          if (!inString) {
            if (char === '{' || char === '[') bracketStack.push(char);
            if (char === '}') bracketStack.pop();
            if (char === ']') bracketStack.pop();
          }
          escaped = char === '\\' && !escaped;
        }
        
        // Close remaining brackets/braces in reverse order
        while (bracketStack.length > 0) {
          let last = bracketStack.pop();
          if (last === '{') repaired += '}';
          if (last === '[') repaired += ']';
        }
        
        extracted = JSON.parse(repaired);
      } catch (innerError) {
        throw new Error(`Failed to parse reconciliation data. The document might be too large. Original error: ${(e as Error).message}`);
      }
    }
    
    // Ensure numeric fields exist and are valid numbers
    const isNum = (v: any) => typeof v === 'number' && !isNaN(v);
    
    extracted.totalAum = isNum(extracted.totalAum) ? extracted.totalAum : currentFund.aum;
    extracted.totalUnits = isNum(extracted.totalUnits) ? extracted.totalUnits : currentFund.totalUnits;
    
    if (!isNum(extracted.nav)) {
      if (extracted.totalUnits > 0) {
        extracted.nav = extracted.totalAum / extracted.totalUnits;
      } else {
        extracted.nav = currentFund.nav;
      }
    }
    
    // Calculate discrepancies
    const aumDiff = extracted.totalAum - currentFund.aum;
    const unitsDiff = extracted.totalUnits - currentFund.totalUnits;
    const navDiff = extracted.nav - currentFund.nav;
    
    const needsAdjustment = Math.abs(aumDiff) > 0.01 || Math.abs(unitsDiff) > 0.01 || Math.abs(navDiff) > 0.0001;

    const suggestedActions = [];
    if (Math.abs(navDiff) > 0) suggestedActions.push(`Update Fund NAV to ${extracted.nav}`);
    if (Math.abs(unitsDiff) > 0) suggestedActions.push(`Reconcile total unit supply (${unitsDiff > 0 ? 'Issue' : 'Redeem'} ${Math.abs(unitsDiff)} units)`);
    if (extracted.investorBalances?.length) suggestedActions.push(`Sync ${extracted.investorBalances.length} investor portfolios`);
    if (extracted.assets?.length) suggestedActions.push(`Revalue ${extracted.assets.filter((a: any) => a.tickerMatched !== 'NEW').length} portfolio holdings`);

    return {
      extractedData: extracted,
      discrepancies: { aumDiff, unitsDiff, navDiff, needsAdjustment },
      suggestedActions
    };
  }
}
