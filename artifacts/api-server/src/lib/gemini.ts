import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const CHAT_MODEL = "gemini-2.5-flash-lite";
export const EMBEDDING_DIMENSIONS = 3072;

export async function generateEmbedding(text: string): Promise<number[]> {
  const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
  const result = await model.embedContent(text);
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

  const result = await model.generateContent(prompt);
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

  const result = await model.generateContent(prompt);
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
}): Promise<{ intro: string; firstQuestion: string }> {
  const model = genAI.getGenerativeModel({ model: CHAT_MODEL });

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

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Gemini returned non-JSON");
  return JSON.parse(jsonMatch[0]);
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
  nextQuestion?: string;
  isComplete: boolean;
  summary?: string;
}> {
  const model = genAI.getGenerativeModel({ model: CHAT_MODEL });

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
  "isComplete": true,
  "summary": "<overall session summary: 2-3 sentences on overall performance, specific strengths shown, top 2-3 improvement tips relevant to the Pakistan job market>"
}`
    : `{
  "feedback": "<constructive feedback on this specific answer, 1-2 sentences>",
  "score": <answer quality 1-10>,
  "nextQuestion": "<next interview question — progress naturally, mix behavioral and technical as the session continues>",
  "isComplete": false
}`
}

No extra text outside the JSON.`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Gemini returned non-JSON");
  return JSON.parse(jsonMatch[0]);
}
