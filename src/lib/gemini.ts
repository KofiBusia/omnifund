import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const fetchGSEPrices = async (tickers: string[]) => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Fetch the latest market prices in GHS for the following GSE tickers from https://afx.kwayisi.org/gse/: ${tickers.join(', ')}. Return only a JSON object where keys are tickers and values are numbers.`,
    config: {
      tools: [{ urlContext: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: tickers.reduce((acc: any, ticker) => {
          acc[ticker] = { type: Type.NUMBER };
          return acc;
        }, {})
      }
    }
  });
  
  try {
    return JSON.parse(response.text);
  } catch (e) {
    console.error("Failed to parse GSE prices", e);
    return null;
  }
};

export const getGeminiResponse = async (prompt: string, context: string) => {
  const model = ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `
      System Instruction: You are OmniFund AI, a senior financial analyst and administrative assistant for a mutual fund management system.
      Your goal is to provide accurate, professional, and helpful insights based on the provided fund data.
      Context: ${context}
      User Query: ${prompt}
    `,
  });
  const response = await model;
  return response.text;
};
