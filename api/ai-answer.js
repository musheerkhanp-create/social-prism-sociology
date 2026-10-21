import { GoogleGenAI } from '@google/genai';

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
      error: "GEMINI_API_KEY is missing. Add it in Vercel Settings > Environment Variables and redeploy."
    });
  }

  try {
    const body = req.body || {};

    const mode = body.mode === "evaluate" ? "evaluate" : "generate";
    const question = String(body.question || "").trim().slice(0, 5000);
    const exam = String(body.exam || "UPSC Sociology Optional").slice(0, 120);
    const length = String(body.length || "250 Words (15 Marks)").slice(0, 80);
    
    // Uploaded file data (base64) from frontend
    const fileData = body.fileData || null;
    const mimeType = body.mimeType || "image/jpeg";

    if (!question) {
      return res.status(400).json({
        error: "Please enter an exam question."
      });
    }

    if (mode === "evaluate" && !fileData) {
      return res.status(400).json({
        error: "Please upload your answer sheet for evaluation."
      });
    }

    const systemInstruction =
      mode === "evaluate"
        ? `You are Social Prism's UPSC Sociology answer evaluator. Evaluate the student's uploaded answer sheet constructively and fairly. Return a detailed evaluation with clear headings including overall assessment, indicative marks, strengths, areas for improvement, and missing points.`
        : `You are Social Prism's UPSC CSE and Sociology mentor. Generate a high-quality, exam-ready model answer with an introduction, analytical subheadings, relevant thinkers, examples, and conclusion.`;

    const userParts = [
      { 
        text: mode === "evaluate" 
          ? `Exam: ${exam}\nTarget length: ${length}\nQuestion: ${question}\nPlease evaluate the attached answer sheet.` 
          : `Exam: ${exam}\nTarget length: ${length}\nQuestion: ${question}\nWrite the complete model answer.` 
      }
    ];

    if (mode === "evaluate" && fileData) {
      userParts.push({
        inline_data: {
          mime_type: mimeType,
          data: fileData
        }
      });
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: userParts }],
      config: {
        systemInstruction: systemInstruction
      }
    });

    const text = response.text();
    return res.status(200).json({
      success: true,
      mode,
      text
    });
  } catch (error) {
    console.error("AI Answer API error:", error);
    return res.status(500).json({
      error: "Internal AI service error. Check Vercel Function Logs."
    });
  }
}
