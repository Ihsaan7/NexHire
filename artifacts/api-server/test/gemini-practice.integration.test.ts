import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePracticeContinuationResponse } from "../src/lib/gemini.ts";

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