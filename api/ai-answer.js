
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "Method not allowed. Please use POST."
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error:
        "GEMINI_API_KEY is missing. Add it in Vercel Settings > Environment Variables and redeploy."
    });
  }

  try {
    const body = req.body || {};

    const mode =
      body.mode === "evaluate" ? "evaluate" : "generate";

    const question = String(body.question || "")
      .trim()
      .slice(0, 5000);

    const exam = String(
      body.exam || "UPSC Sociology Optional"
    ).slice(0, 120);

    const length = String(
      body.length || "250 Words (15 Marks)"
    ).slice(0, 80);

    const answer = String(body.answer || "")
      .trim()
      .slice(0, 18000);

    if (!question) {
      return res.status(400).json({
        error: "Please enter an exam question."
      });
    }

    if (mode === "evaluate" && !answer) {
      return res.status(400).json({
        error: "Please paste your written answer for evaluation."
      });
    }

    const systemInstruction =
      mode === "evaluate"
        ? `You are Social Prism's UPSC Sociology answer evaluator.

Evaluate the student's answer constructively and fairly.

Return a detailed evaluation with these headings:

1. Overall Assessment
2. Indicative Marks and Reasoning
3. Strengths of the Answer
4. Areas Requiring Improvement
5. Evaluation Criteria:
   - Relevance to the question
   - Introduction and definition
   - Conceptual accuracy
   - Sociological thinkers and theories
   - Examples and evidence
   - Analysis and critical perspective
   - Structure and presentation
   - Conclusion
6. Missing Points and Value Additions
7. Suggested Improved Answer Outline
8. One Priority for the Next Attempt

Respect the exam's marks and word limit.
Be specific to the question and student's answer.
Do not invent facts, statistics, quotations or references.
Marks must be indicative, not official UPSC marks.`
        : `You are Social Prism's UPSC CSE and Sociology mentor.

Generate a high-quality, exam-ready model answer.

Include, where relevant:
- A concise introduction and definition
- Clear analytical headings
- Relevant sociological thinkers and theories
- Indian and contemporary examples
- Critical analysis and alternative perspectives
- A balanced, direct conclusion

Follow the requested examination and word limit.
Answer the exact question asked.
Do not invent statistics, quotations, books, cases or citations.
Use accurate, relevant sociological concepts.
Write in clear, readable plain text.`;

    const prompt =
      mode === "evaluate"
        ? `Exam: ${exam}
Target length: ${length}

Question:
${question}

Student's answer:
${answer}

Evaluate this answer using the requested rubric.`
        : `Exam: ${exam}
Target length: ${length}

Question:
${question}

Write the complete model answer.`;

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      50000
    );

    let response;

    try {
      response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: systemInstruction }]
            },
            contents: [
              {
                role: "user",
                parts: [{ text: prompt }]
              }
            ],
            generationConfig: {
              temperature: 0.4,
              maxOutputTokens: 4096
            }
          }),
          signal: controller.signal
        }
      );
    } finally {
      clearTimeout(timeout);
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 429) {
        return res.status(429).json({
          error:
            "Gemini API quota or rate limit reached. Check your API quota and billing settings."
        });
      }

      if (
        response.status === 401 ||
        response.status === 403
      ) {
        return res.status(502).json({
          error:
            "Gemini rejected the API key. Check GEMINI_API_KEY in Vercel and verify the key's API access."
        });
      }

      console.error(
        "Gemini API error:",
        response.status,
        data?.error?.message
      );

      return res.status(502).json({
        error:
          "Gemini could not process the request. Check your API configuration and try again."
      });
    }

    const text = (data.candidates || [])
      .flatMap(candidate =>
        candidate.content?.parts || []
      )
      .map(part => part.text || "")
      .join("\n")
      .trim();

    if (!text) {
      return res.status(502).json({
        error:
          "Gemini returned an empty answer. Please try again."
      });
    }

    return res.status(200).json({
      success: true,
      mode,
      text
    });
  } catch (error) {
    console.error("AI Answer API error:", error);

    if (error.name === "AbortError") {
      return res.status(504).json({
        error:
          "The AI request timed out. Please try again."
      });
    }

    return res.status(500).json({
      error:
        "Internal AI service error. Check Vercel Function Logs."
    });
  }
}
