import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const CHAT_MODEL = "gemini-2.5-flash-lite";

export async function generateEmbedding(text: string): Promise<number[]> {
  const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

function fallbackSuggestions(cvText: string): string[] {
  const suggestions: string[] = [];
  if (cvText.length < 500) suggestions.push("Your CV is very short — expand each role with 2-3 bullet points on specific achievements and technologies used.");
  if (!cvText.toLowerCase().includes("github") && !cvText.toLowerCase().includes("portfolio")) suggestions.push("Add a GitHub profile or portfolio URL to showcase your work to recruiters.");
  if (!cvText.toLowerCase().includes("skill")) suggestions.push("Add a dedicated Skills section listing programming languages, frameworks, and tools you know.");
  if (!cvText.toLowerCase().includes("result") && !cvText.toLowerCase().includes("impact") && !cvText.toLowerCase().includes("improve")) suggestions.push("Quantify your achievements (e.g. 'Reduced load time by 40%', 'Managed team of 5') instead of listing duties.");
  suggestions.push("Tailor your CV summary to each job by mirroring keywords from the job description to pass ATS filters.");
  suggestions.push("For the Pakistani market, include your city and a WhatsApp-reachable phone number — most recruiters contact via WhatsApp.");
  return suggestions.slice(0, 5);
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
  const model = genAI.getGenerativeModel({ model: CHAT_MODEL });

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
  try {
    const model = genAI.getGenerativeModel({ model: CHAT_MODEL });

    const prompt = `Review this CV and give 5 specific, actionable improvement suggestions for the Pakistani job market. Be concrete — name actual skills, sections, or wording changes needed.

CV:
${cvText.slice(0, 3000)}

Return ONLY a JSON array of 5 strings, each a specific actionable suggestion. No other text.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return fallbackSuggestions(cvText);

    return JSON.parse(jsonMatch[0]);
  } catch (err: any) {
    // 429 quota exhausted — return rule-based fallback instead of crashing
    if (err?.status === 429) {
      return fallbackSuggestions(cvText);
    }
    throw err;
  }
}
