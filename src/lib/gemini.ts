import { RewrittenResume } from "./scoring";

const SYSTEM_PROMPT = `You are a world-class Technical Resume Strategist. Your mission is to re-engineer a candidate's resume to match a Job Description (JD) while maintaining 100% human-professionalism.

STRICT CONTENT RULES:
1. HARD SKILLS ONLY: The 'skills' section MUST contain only technical tools, languages, frameworks, or specific hard methodologies (e.g., "PostgreSQL", "React", "Unit Testing").
2. NO SOFT SKILLS IN SKILLS: Never include soft skills like "collaboration", "communication", "leadership", or "problem-solving" in the skills list. These belong in the Experience bullets where they can be proven with actions.
3. NO VERBS/SENTENCES IN SKILLS: Each item in the skills array must be a noun or a short noun phrase (max 3 words). Never include phrases like "Collaborate with teams" or "Ensure quality".
4. NO VERBATIM COPYING: Never copy distinctive phrases or full sentences from the JD. You must REPHRASE the JD requirements to match the candidate's actual work history.
5. GOOGLE XYZ FORMULA: Every bullet in the 'experience' and 'projects' sections must follow: "Accomplished [X] as measured by [Y], by doing [Z]."
6. AUTHENTICITY: Do not invent facts. If the candidate hasn't done something, don't say they have. Instead, highlight their most relevant transferable skill.

Your goal is a resume that passes ATS because it uses the right technical keywords, but wins the interview because it reads like a real, high-achieving professional wrote it.`;

const tool = {
  name: "emit_resume",
  description: "Emit the rewritten ATS-optimized resume and match analysis.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string" },
      title: { type: "string", description: "Target role title mirrored from JD" },
      contact: {
        type: "object",
        properties: {
          email: { type: "string" },
          phone: { type: "string" },
          location: { type: "string" },
          linkedin: { type: "string" },
          website: { type: "string" },
        },
        required: ["email"],
      },
      summary: { type: "string", description: "3-4 line professional summary. Impact-oriented, JD-aligned but original phrasing." },
      skills: {
        type: "array",
        items: { type: "string" },
        description: "A curated list of EXACTLY 15-20 technical HARD SKILLS only. NO soft skills, NO verbs, NO sentences.",
      },
      experience: {
        type: "array",
        items: {
          type: "object",
          properties: {
            company: { type: "string" },
            role: { type: "string" },
            location: { type: "string" },
            start: { type: "string" },
            end: { type: "string" },
            bullets: {
              type: "array",
              items: { type: "string" },
              description: "XYZ-formula bullets that demonstrate JD requirements through candidate's history. No verbatim copying.",
            },
          },
          required: ["company", "role", "start", "end", "bullets"],
        },
      },
      projects: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            stack: { type: "string" },
            bullets: { type: "array", items: { type: "string" } },
          },
          required: ["name", "bullets"],
        },
      },
      education: {
        type: "array",
        items: {
          type: "object",
          properties: {
            school: { type: "string" },
            degree: { type: "string" },
            start: { type: "string" },
            end: { type: "string" },
            details: { type: "string" },
          },
          required: ["school", "degree"],
        },
      },
      certifications: { type: "array", items: { type: "string" } },
      ai_match_score: {
        type: "number",
        description: "AI's qualitative 0-100 score of how well the resume matches the JD without cheating.",
      },
      jd_keywords: {
        type: "array",
        items: { type: "string" },
        description: "Primary technical keywords from the JD used for optimization.",
      },
      company_name: {
        type: "string",
        description: "Company name from JD.",
      },
    },
    required: [
      "name",
      "title",
      "contact",
      "summary",
      "skills",
      "experience",
      "education",
      "ai_match_score",
      "jd_keywords",
      "company_name",
    ],
  },
};

export async function rewriteResumeWithGemini(resumeText: string, jobDescription: string): Promise<RewrittenResume> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("VITE_GEMINI_API_KEY missing in .env");
  }

  const userMsg = `JOB DESCRIPTION:\n"""\n${jobDescription}\n"""\n\nORIGINAL RESUME:\n"""\n${resumeText}\n"""\n\nRewrite the resume to optimize for the JD. Focus on professional alignment and meaningful keyword integration rather than verbatim copying. Use the emit_resume tool.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userMsg }] }],
        tools: [
          {
            functionDeclarations: [tool],
          },
        ],
        toolConfig: {
          functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["emit_resume"] },
        },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini error: ${errText.slice(0, 300)}`);
  }

  const data = await response.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const fnCall = parts.find((p: any) => p.functionCall)?.functionCall;

  if (!fnCall?.args) {
    throw new Error("AI did not return a structured resume. Please try again.");
  }

  return fnCall.args as RewrittenResume;
}
