import { GoogleGenerativeAI } from "@google/generative-ai";
import { getAiUserId } from "./aiContext";
import { consumeAiQuota } from "./aiQuota";
import { AiRateLimitError, AiTimeoutError } from "./aiErrors";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const CHAT_MODEL = "gemini-2.5-flash-lite";
const AI_TIMEOUT_MS = 30_000;
export { AiRateLimitError, AiTimeoutError } from "./aiErrors";

export async function callGemini<T>(
  call: () => Promise<T>,
  timeoutMs = AI_TIMEOUT_MS,
): Promise<T> {
  const userId = getAiUserId();
  if (userId) await consumeAiQuota(userId);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      call(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new AiTimeoutError()), timeoutMs);
      }),
    ]);
  } catch (error) {
    if (error instanceof AiTimeoutError) throw error;
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
export const EMBEDDING_DIMENSIONS = 3072;
export type PracticeQuestionGenerationLabel =
  | "AI-generated from web research"
  | "AI-generated";
export type PracticeQuestionSource = { site: string; url: string };
export const PRACTICE_GROUNDING_TOOLS = [{ googleSearch: {} }] as const;

function isPrivateHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  ) {
    return true;
  }
  const parts = normalized.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    parts[0] === 0
  );
}

export function extractPracticeGroundingSources(
  response: unknown,
): PracticeQuestionSource[] {
  const candidates = (response as any)?.candidates;
  if (!Array.isArray(candidates)) return [];

  const sources = new Map<string, PracticeQuestionSource>();
  for (const candidate of candidates) {
    const chunks = candidate?.groundingMetadata?.groundingChunks;
    if (!Array.isArray(chunks)) continue;
    for (const chunk of chunks) {
      const rawUri = chunk?.web?.uri;
      if (typeof rawUri !== "string" || rawUri.length > 2048) continue;
      try {
        const url = new URL(rawUri);
        if (
          url.protocol !== "https:" ||
          url.username ||
          url.password ||
          (url.port && url.port !== "443") ||
          isPrivateHostname(url.hostname)
        ) {
          continue;
        }
        url.hash = "";
        const canonicalUrl =
          url.pathname === "/" && !url.search
            ? `${url.origin}/`
            : url.toString().replace(/\/$/, "");
        if (sources.has(canonicalUrl)) continue;
        const rawTitle =
          typeof chunk.web.title === "string" ? chunk.web.title : "";
        const site =
          rawTitle.trim().replace(/\s+/g, " ").slice(0, 120) ||
          url.hostname.replace(/^www\./, "");
        sources.set(canonicalUrl, { site, url: canonicalUrl });
        if (sources.size >= 5) return [...sources.values()];
      } catch {
        continue;
      }
    }
  }
  return [...sources.values()];
}

export async function generatePracticeContentWithGrounding<T>(
  groundedPrompt: string,
  fallbackPrompt: string,
  parse: (text: string) => T,
  dependencies: {
    generateGrounded: (
      prompt: string,
    ) => Promise<{ text: string; response: unknown }>;
    generateFallback: (prompt: string) => Promise<{ text: string }>;
  } = {
    generateGrounded: async (prompt) => {
      const groundedModel = genAI.getGenerativeModel({
        model: CHAT_MODEL,
        tools: PRACTICE_GROUNDING_TOOLS as any,
      });
      const result = await callGemini(() => groundedModel.generateContent(prompt));
      return {
        text: result.response.text(),
        response: result.response,
      };
    },
    generateFallback: async (prompt) => {
      const fallbackModel = genAI.getGenerativeModel({ model: CHAT_MODEL });
      const result = await callGemini(() => fallbackModel.generateContent(prompt));
      return { text: result.response.text() };
    },
  },
): Promise<{
  value: T;
  generationLabel: PracticeQuestionGenerationLabel;
  sources: PracticeQuestionSource[];
}> {
  try {
    const groundedResult =
      await dependencies.generateGrounded(groundedPrompt);
    const sources = extractPracticeGroundingSources(groundedResult.response);
    if (sources.length > 0) {
      return {
        value: parse(groundedResult.text),
        generationLabel: "AI-generated from web research",
        sources,
      };
    }
  } catch (error) {
    if (error instanceof AiRateLimitError || error instanceof AiTimeoutError) {
      throw error;
    }
    // Grounded generation is optional; regular Gemini remains the fallback.
  }

  const fallbackResult =
    await dependencies.generateFallback(fallbackPrompt);
  return {
    value: parse(fallbackResult.text),
    generationLabel: "AI-generated",
    sources: [],
  };
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
  const result = await callGemini(() => model.embedContent(text));
  const values = result.embedding.values;
  if (
    !Array.isArray(values) ||
    values.length !== EMBEDDING_DIMENSIONS ||
    values.some((value) => !Number.isFinite(value))
  ) {
    throw new Error(
      `Embedding returned ${Array.isArray(values) ? values.length : 0} dimensions; expected ${EMBEDDING_DIMENSIONS}`,
    );
  }
  return values;
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

  const result = await callGemini(() => model.generateContent(prompt));
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

    const result = await callGemini(() => model.generateContent(prompt));
    const text = result.response.text().trim();

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return fallbackSuggestions(cvText);

    return JSON.parse(jsonMatch[0]);
  } catch (err: any) {
    if (err?.status === 429) {
      return fallbackSuggestions(cvText);
    }
    throw err;
  }
}

export async function auditCvPakistan(cvText: string): Promise<{
  score: number;
  issues: { category: string; severity: "high" | "medium" | "low"; problem: string; correction: string }[];
  strengths: string[];
}> {
  const model = genAI.getGenerativeModel({ model: CHAT_MODEL });

  const prompt = `You are a Pakistani HR expert and professional CV writer. Audit this CV specifically for the Pakistani job market standards.

CV:
${cvText.slice(0, 4000)}

Return ONLY valid JSON in this exact shape:
{
  "score": <overall quality score 0-100>,
  "issues": [
    {
      "category": "<one of: Contact Info | Professional Summary | Work Experience | Education | Skills | Formatting & ATS | Pakistan-Specific>",
      "severity": "<high|medium|low>",
      "problem": "<specific problem found, 1 sentence>",
      "correction": "<specific fix to apply, 1-2 sentences>"
    }
  ],
  "strengths": ["<3-5 specific things this CV does well>"]
}

Check for these Pakistan-specific issues:
- Missing WhatsApp number (Pakistani recruiters prefer WhatsApp contact)
- Missing city (Karachi/Lahore/Islamabad — recruiters filter by city)
- Missing LinkedIn URL
- CV too long (>2 pages for <5 years experience) or too short (<1 page)
- Missing CGPA or percentage for fresh graduates (Pakistani employers expect it)
- No references line (standard in PK CVs: "References available upon request")
- Weak or missing professional summary
- Duties listed instead of achievements with metrics
- Skills section missing or poorly structured
- Dates format inconsistency
- Missing objective/summary mismatch for experience level
- Missing github/portfolio for tech roles

Return 5-10 issues covering different categories. No extra text outside the JSON.`;

  const result = await callGemini(() => model.generateContent(prompt));
  const text = result.response.text().trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Gemini returned non-JSON response");
  return JSON.parse(jsonMatch[0]);
}

export async function refineCvForJob(
  cvText: string,
  jobTitle: string,
  jobDescription: string,
): Promise<{ refinedCv: string; changes: string[] }> {
  const model = genAI.getGenerativeModel({ model: CHAT_MODEL });

  const prompt = `You are a professional CV writer for the Pakistani job market. Rewrite the candidate's CV to best match this specific job. Keep all facts accurate (companies, dates, degrees) but rewrite summaries and bullet points to align with the job requirements.

Original CV:
${cvText.slice(0, 3000)}

Target Job:
Title: ${jobTitle}
${jobDescription.slice(0, 2000)}

Return ONLY valid JSON:
{
  "refinedCv": "<the full rewritten CV text, preserving the same general structure and layout>",
  "changes": ["<5-8 specific changes you made and why — be concrete>"]
}

Rules:
- Keep all factual information 100% accurate
- Rewrite the professional summary to match the role
- Reorder and reword bullet points to emphasize relevant experience first
- Add keywords from the JD to pass ATS filters
- Adjust skills section to highlight relevant skills first
- Remove or deprioritize irrelevant content

No extra text outside the JSON.`;

  const result = await callGemini(() => model.generateContent(prompt));
  const text = result.response.text().trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Gemini returned non-JSON response");
  return JSON.parse(jsonMatch[0]);
}

export async function startPracticeSession(params: {
  mode: "cv" | "job" | "custom";
  cvText?: string;
  jobTitle?: string;
  jobDescription?: string;
  topic?: string;
}): Promise<{
  intro: string;
  firstQuestion: string;
  generationLabel: PracticeQuestionGenerationLabel;
  sources: PracticeQuestionSource[];
}> {
  let context = "";
  if (params.mode === "cv" && params.cvText) {
    context = `The candidate's CV:\n${params.cvText.slice(0, 2500)}`;
  } else if (params.mode === "job") {
    context = `Job to prepare for:\nTitle: ${params.jobTitle || "the role"}\n${(params.jobDescription || "").slice(0, 2000)}`;
  } else {
    context = `Topic/Role to practice for: ${params.topic}`;
  }

  const prompt = `You are a friendly but rigorous mock interviewer for the Pakistani job market. Generate a brief opening intro and the first interview question.

${context}

Return ONLY valid JSON:
{
  "intro": "<brief friendly opener, 1-2 sentences, sets context for the session>",
  "firstQuestion": "<first interview question — start with something behavioral or motivational like 'Tell me about yourself' or 'Why do you want this role', not overly technical>"
}

No extra text outside the JSON.`;

  const groundedPrompt = `${prompt}

Before choosing the question, use Google Search to research:
- current interview questions for this role or topic in Pakistan
- remote-job interview expectations for this role
- recent technical test formats for this stack or skill
Use that research as context. Do not put citations or source URLs inside the JSON.`;
  const generated = await generatePracticeContentWithGrounding(
    groundedPrompt,
    prompt,
    (text) => {
      const jsonMatch = text.trim().match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Gemini returned non-JSON");
      const value = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      const intro = typeof value.intro === "string" ? value.intro.trim() : "";
      const firstQuestion =
        typeof value.firstQuestion === "string"
          ? value.firstQuestion.trim()
          : "";
      if (!intro || !firstQuestion) {
        throw new Error("Gemini returned an invalid practice start");
      }
      return { intro, firstQuestion };
    },
  );
  return {
    ...generated.value,
    generationLabel: generated.generationLabel,
    sources: generated.sources,
  };
}

export async function continuePracticeSession(params: {
  mode: "cv" | "job" | "custom";
  cvText?: string;
  jobTitle?: string;
  jobDescription?: string;
  topic?: string;
  history: { role: "ai" | "user"; content: string }[];
  userAnswer: string;
  questionNumber: number;
}): Promise<{
  feedback: string;
  score: number;
  category: string | null;
  nextQuestion?: string;
  isComplete: boolean;
  summary?: string;
  nextQuestionGenerationLabel: PracticeQuestionGenerationLabel | null;
  nextQuestionSources: PracticeQuestionSource[];
}> {
  let context = "";
  if (params.mode === "cv" && params.cvText) {
    context = `Candidate background (from CV):\n${params.cvText.slice(0, 1200)}`;
  } else if (params.mode === "job") {
    context = `Job: ${params.jobTitle || "the role"}\n${(params.jobDescription || "").slice(0, 800)}`;
  } else {
    context = `Practice topic: ${params.topic}`;
  }

  const isLastQuestion = params.questionNumber >= 5;
  const historyStr = params.history
    .map((m) => `${m.role === "ai" ? "Interviewer" : "Candidate"}: ${m.content}`)
    .join("\n\n");

  const prompt = `You are a mock interviewer for the Pakistani job market. Evaluate the candidate's latest answer and ${isLastQuestion ? "provide a final session summary" : "ask the next question"}.

Context: ${context}

Interview so far:
${historyStr}

Candidate's latest answer: "${params.userAnswer}"

Return ONLY valid JSON:
${
  isLastQuestion
    ? `{
  "feedback": "<constructive feedback on this specific answer, 2-3 sentences, mention what was good and what could improve>",
  "score": <answer quality 1-10>,
  "category": "<concise skill category for this question, such as Communication, Behavioural, or Technical — Node.js>",
  "isComplete": true,
  "summary": "<overall session summary: 2-3 sentences on overall performance, specific strengths shown, top 2-3 improvement tips relevant to the Pakistan job market>"
}`
    : `{
  "feedback": "<constructive feedback on this specific answer, 1-2 sentences>",
  "score": <answer quality 1-10>,
  "category": "<concise skill category for this question, such as Communication, Behavioural, or Technical — Node.js>",
  "nextQuestion": "<next interview question — progress naturally, mix behavioral and technical as the session continues>",
  "isComplete": false
}`
}

No extra text outside the JSON.`;

  let parsed;
  let nextQuestionGenerationLabel: PracticeQuestionGenerationLabel | null =
    null;
  let nextQuestionSources: PracticeQuestionSource[] = [];
  if (isLastQuestion) {
    const model = genAI.getGenerativeModel({ model: CHAT_MODEL });
    const result = await callGemini(() => model.generateContent(prompt));
    parsed = parsePracticeContinuationResponse(
      result.response.text(),
      isLastQuestion,
    );
  } else {
    const groundedPrompt = `${prompt}

Before choosing the next question, use Google Search to research:
- current interview questions for this role or topic in Pakistan
- remote-job interview expectations for this role
- recent technical test formats for this stack or skill
Use that research as context. Do not put citations or source URLs inside the JSON.`;
    const generated = await generatePracticeContentWithGrounding(
      groundedPrompt,
      prompt,
      (text) => parsePracticeContinuationResponse(text, false),
    );
    parsed = generated.value;
    nextQuestionGenerationLabel = generated.generationLabel;
    nextQuestionSources = generated.sources;
  }
  if (parsed.category === null) {
    console.warn("Gemini practice response did not include a valid category");
  }
  return {
    ...parsed,
    nextQuestionGenerationLabel,
    nextQuestionSources,
  };
}

export function parsePracticeContinuationResponse(
  text: string,
  isLastQuestion: boolean,
): {
  feedback: string;
  score: number;
  category: string | null;
  nextQuestion?: string;
  isComplete: boolean;
  summary?: string;
} {
  const jsonMatch = text.trim().match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Gemini returned non-JSON");

  const value = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  const feedback =
    typeof value.feedback === "string" ? value.feedback.trim() : "";
  if (!feedback) {
    throw new Error("Gemini practice response is missing feedback");
  }
  if (
    typeof value.score !== "number" ||
    !Number.isFinite(value.score) ||
    value.score < 1 ||
    value.score > 10
  ) {
    throw new Error("Gemini practice response has an invalid score");
  }
  if (
    typeof value.isComplete !== "boolean" ||
    value.isComplete !== isLastQuestion
  ) {
    throw new Error("Gemini practice response has an invalid completion state");
  }

  const normalizedCategory =
    typeof value.category === "string"
      ? value.category.trim().replace(/\s+/g, " ").slice(0, 100)
      : "";
  const category = normalizedCategory || null;

  if (isLastQuestion) {
    const summary =
      typeof value.summary === "string" ? value.summary.trim() : "";
    if (!summary) {
      throw new Error("Gemini final practice response is missing a summary");
    }
    return {
      feedback,
      score: value.score,
      category,
      isComplete: true,
      summary,
    };
  }

  const nextQuestion =
    typeof value.nextQuestion === "string" ? value.nextQuestion.trim() : "";
  if (!nextQuestion) {
    throw new Error("Gemini practice response is missing the next question");
  }
  return {
    feedback,
    score: value.score,
    category,
    nextQuestion,
    isComplete: false,
  };
}
