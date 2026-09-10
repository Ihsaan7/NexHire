import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractPracticeGroundingSources,
  generatePracticeContentWithGrounding,
  parsePracticeContinuationResponse,
  PRACTICE_GROUNDING_TOOLS,
  callGemini,
} from "../src/lib/gemini.ts";
import { AiTimeoutError } from "../src/lib/aiErrors.ts";

test("classifies Gemini calls that exceed their deadline", async () => {
  await assert.rejects(
    callGemini(
      () => new Promise<string>(() => undefined),
      5,
    ),
    AiTimeoutError,
  );
});

test("does not hide a grounded AI timeout behind fallback generation", async () => {
  let fallbackCalled = false;
  await assert.rejects(
    generatePracticeContentWithGrounding(
      "grounded",
      "fallback",
      (text) => text,
      {
        generateGrounded: async () => {
          throw new AiTimeoutError();
        },
        generateFallback: async () => {
          fallbackCalled = true;
          return { text: "fallback" };
        },
      },
    ),
    AiTimeoutError,
  );
  assert.equal(fallbackCalled, false);
});

test("silently falls back when grounding fails or returns no sources", async () => {
  for (const groundedBehavior of ["throw", "empty"] as const) {
    let fallbackCalls = 0;
    const generated = await generatePracticeContentWithGrounding(
      "grounded prompt",
      "fallback prompt",
      (text) => text,
      {
        generateGrounded: async () => {
          if (groundedBehavior === "throw") {
            throw new Error("grounding unavailable");
          }
          return {
            text: "unused grounded text",
            response: { candidates: [] },
          };
        },
        generateFallback: async (prompt) => {
          fallbackCalls += 1;
          assert.equal(prompt, "fallback prompt");
          return { text: "plain Gemini result" };
        },
      },
    );
    assert.equal(fallbackCalls, 1);
    assert.equal(generated.value, "plain Gemini result");
    assert.equal(generated.generationLabel, "AI-generated");
    assert.deepEqual(generated.sources, []);
  }
});

test("uses grounded content when valid sources exist", async () => {
  let fallbackCalls = 0;
  const generated = await generatePracticeContentWithGrounding(
    "grounded prompt",
    "fallback prompt",
    (text) => text,
    {
      generateGrounded: async (prompt) => {
        assert.equal(prompt, "grounded prompt");
        return {
          text: "grounded Gemini result",
          response: {
            candidates: [
              {
                groundingMetadata: {
                  groundingChunks: [
                    {
                      web: {
                        title: "Interview Guide",
                        uri: "https://example.com/interview-guide",
                      },
                    },
                  ],
                },
              },
            ],
          },
        };
      },
      generateFallback: async () => {
        fallbackCalls += 1;
        return { text: "unexpected" };
      },
    },
  );
  assert.equal(fallbackCalls, 0);
  assert.equal(generated.value, "grounded Gemini result");
  assert.equal(generated.generationLabel, "AI-generated from web research");
  assert.equal(generated.sources[0]?.site, "Interview Guide");
});

test("uses the required Google Search grounding tool", () => {
  assert.deepEqual(PRACTICE_GROUNDING_TOOLS, [{ googleSearch: {} }]);
});

test("extracts, validates, and deduplicates grounded web sources", () => {
  const sources = extractPracticeGroundingSources({
    candidates: [
      {
        groundingMetadata: {
          groundingChunks: [
            {
              web: {
                title: "  Pakistan   Careers  ",
                uri: "https://www.example.com/interviews#section",
              },
            },
            {
              web: {
                title: "Duplicate",
                uri: "https://www.example.com/interviews",
              },
            },
            { web: { uri: "https://remote.example.org/" } },
            { web: { title: "Insecure", uri: "http://example.com/" } },
            { web: { title: "Private", uri: "https://127.0.0.1/test" } },
            {
              web: {
                title: "Credentials",
                uri: "https://user:pass@example.com/test",
              },
            },
          ],
        },
      },
    ],
  });

  assert.deepEqual(sources, [
    {
      site: "Pakistan Careers",
      url: "https://www.example.com/interviews",
    },
    {
      site: "remote.example.org",
      url: "https://remote.example.org/",
    },
  ]);
  assert.deepEqual(extractPracticeGroundingSources({ candidates: [] }), []);
});

test("normalizes practice categories and accepts an explicit null fallback", () => {
  const categorized = parsePracticeContinuationResponse(
    JSON.stringify({
      feedback: "A clear answer.",
      score: 8,
      category: "  Technical   —   Node.js  ",
      nextQuestion: "How did you measure the result?",
      isComplete: false,
    }),
    false,
  );
  assert.equal(categorized.category, "Technical — Node.js");
  assert.equal(categorized.score, 8);
  assert.equal(categorized.isComplete, false);

  const uncategorized = parsePracticeContinuationResponse(
    JSON.stringify({
      feedback: "A useful final answer.",
      score: 7,
      isComplete: true,
      summary: "Solid overall performance.",
    }),
    true,
  );
  assert.equal(uncategorized.category, null);
});

test("rejects invalid practice evaluation payloads", () => {
  assert.throws(
    () =>
      parsePracticeContinuationResponse(
        JSON.stringify({
          feedback: "Out-of-range score.",
          score: 11,
          category: "Communication",
          nextQuestion: "Next?",
          isComplete: false,
        }),
        false,
      ),
    /invalid score/,
  );

  assert.throws(
    () =>
      parsePracticeContinuationResponse(
        JSON.stringify({
          feedback: "Missing continuation.",
          score: 6,
          category: "Behavioural",
          isComplete: false,
        }),
        false,
      ),
    /missing the next question/,
  );
});