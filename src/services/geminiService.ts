import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface ExtractedTransaction {
  name: string;
  type: 'BUY' | 'SELL';
  amount: number;
  confidence: number;
  reasoning?: string;
}

export async function processTransactionDocument(
  base64Data: string,
  mimeType: string
): Promise<ExtractedTransaction[]> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType,
            },
          },
          {
            text: `Extract investment transaction details from this document. 
            Look for investor names, transaction types (BUY/SELL/Subscription/Redemption), and amounts.
            Return the data as a JSON array of objects.
            If the document contains multiple transactions, extract all of them.
            If a transaction type is 'Subscription' or 'Deposit', map it to 'BUY'.
            If a transaction type is 'Redemption' or 'Withdrawal', map it to 'SELL'.`,
          },
        ],
      },
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
