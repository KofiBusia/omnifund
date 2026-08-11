import { GoogleGenAI, Type } from "@google/genai";

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

export interface ExtractedTransaction {
  name: string;
  type: 'BUY' | 'SELL';
  amount: number;
  email?: string;
  phone?: string;
  confidence: number;
  reasoning?: string;
}

export async function processTransactionDocument(
  base64Data: string,
  mimeType: string
): Promise<ExtractedTransaction[]> {
  try {
    const response = await getAI().models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType,
          },
        },
        {
          text: `Extract investment transaction details from this document. 
          Look for investor names, transaction types (BUY/SELL/Subscription/Redemption), amounts, and contact details (email, phone).
          Return the data as a JSON array of objects.
          If the document contains multiple transactions, extract all of them.
          Map all transaction types (Subscription, Deposit, Redemption, Withdrawal, BUY, SELL) to 'BUY'.`,
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: {
                type: Type.STRING,
                description: "The name of the investor.",
              },
              type: {
                type: Type.STRING,
                enum: ["BUY", "SELL"],
                description: "The type of transaction.",
              },
              amount: {
                type: Type.NUMBER,
                description: "The transaction amount in GHS.",
              },
              email: {
                type: Type.STRING,
                description: "The email address of the investor if found.",
              },
              phone: {
                type: Type.STRING,
                description: "The phone number of the investor if found.",
              },
              confidence: {
                type: Type.NUMBER,
                description: "Confidence score from 0 to 1.",
              },
              reasoning: {
                type: Type.STRING,
                description: "Brief explanation of why this was extracted.",
              },
            },
            required: ["name", "type", "amount", "confidence"],
          },
        },
      },
    });

    const text = response.text;
    if (!text) return [];
    
    return JSON.parse(text) as ExtractedTransaction[];
  } catch (error) {
    console.error("Error processing document with Gemini:", error);
    throw error;
  }
}
