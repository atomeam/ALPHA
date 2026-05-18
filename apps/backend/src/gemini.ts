import { GoogleGenAI } from '@google/genai';

export interface GeminiResult {
  model: string;
  output: string;
}

export interface GeminiCaller {
  generate: (prompt: string, input: string) => Promise<GeminiResult>;
}

/**
 * Real Gemini caller. Constructed lazily so missing GEMINI_API_KEY doesn't crash boot.
 * Tests inject their own caller via the server factory.
 */
export function createGeminiCaller(apiKey: string, model: string): GeminiCaller {
  const ai = new GoogleGenAI({ apiKey });
  return {
    async generate(prompt, input) {
      const r = await ai.models.generateContent({
        model,
        contents: `${prompt}\n\n---\nInput:\n${input}`,
      });
      return { model, output: r.text ?? '' };
    },
  };
}
