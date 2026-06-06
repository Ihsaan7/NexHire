import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function generateEmbedding(text: string): Promise<number[]> {
  const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

export async function analyzeJobMatch(
  cvText: string,
  jobTitle: string,
  jobDescription: string,
): Promise<{
  matchScore: number;
  strengths: string[];
  gaps: string[];
  suggestions: string[];
}> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const prompt = `Given this CV:
${cvText.slice(0, 3000)}

And this job posting:
Title: ${jobTitle}
${jobDescription.slice(0, 2000)}

Return ONLY valid JSON in this exact shape:
{
  "matchScore": <0-100>,
  "strengths": [<3 short bullets>],
  "gaps": [<3 short bullets>],
  "suggestions": [<2 actionable tweaks>]
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Gemini returned non-JSON response");

  return JSON.parse(jsonMatch[0]);
}

export async function generateCvSuggestions(
  cvText: string,
): Promise<string[]> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const prompt = `Review this CV and give 5 specific, actionable improvement suggestions. Focus on Pakistani job market context.

CV:
${cvText.slice(0, 3000)}

Return ONLY a JSON array of 5 strings, each being one actionable suggestion. No other text.`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return ["Unable to generate suggestions at this time."];

  return JSON.parse(jsonMatch[0]);
}
