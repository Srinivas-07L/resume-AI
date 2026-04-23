import { RewrittenResume } from "./scoring";

const SYSTEM_PROMPT = `You are a world-class VLSI/Layout Engineering Career Consultant. Your mission is "Intelligent Technical Tailoring" — aligning a candidate's REAL expertise with a Job Description without keyword stuffing or identity hallucination.

CANDIDATE IDENTITY: The candidate is a VLSI/Layout Engineer. Maintain an academic yet industrial tone.

THE ANALYSIS PROTOCOL:
1. ANALYZE JD: Identify core technical challenges (e.g., Power Management, LDO/Bandgap, Interface protocols) and specific EDA tools (e.g., Cadence Virtuoso, Synopsys).
2. ANALYZE RESUME: Read the candidate's actual projects (e.g., Aero-Touch, Project Traksha) and Honors coursework.
3. STRATEGIC REWRITING: Do NOT copy-paste the JD. Instead, rewrite existing bullet points to highlight how the candidate's real work meets the JD's technical needs. 
   - Example: If JD mentions "LDO/Bandgap" and candidate has "Analog Circuits" experience, rewrite lab work to emphasize design/simulation of those specific blocks.
4. GOOGLE XYZ FORMULA: Every bullet must follow: "Accomplished [X] as measured by [Y], by doing [Z]."

STRICT INTEGRITY RULES:
1. NO HALLUCINATIONS: Never add skills the candidate does not have. If a skill is in the JD but not in the resume, leave it out or (if relevant to their ECE degree) list it under "Familiarity/Exposure". NEVER invent software testing skills for a VLSI engineer.
2. HARD SKILLS ONLY: The 'skills' section is for technical tools, languages, and methodologies (max 3 words per item). NO soft skills, NO verbs, NO sentences.
3. NO VERBATIM JD COPYING: Never copy more than 3 consecutive words from the JD.

OUTPUT: Create a strictly professional, one-page, ATS-optimized document.`;

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

  const resume = fnCall.args as RewrittenResume;

  // ===== POST-PROCESSING FILTER (HARD ENFORCEMENT) =====
  // If the AI still tries to dump sentences into the skills, we clean it up here.
  if (resume.skills && Array.isArray(resume.skills)) {
    resume.skills = resume.skills
      .map(s => s.trim())
      // Remove anything that looks like a sentence (more than 4 words)
      .filter(s => s.split(/\s+/).length <= 4)
      // Remove anything that contains numbers followed by a dot (e.g. "1. collaborate")
      .filter(s => !/^\d+\./.test(s))
      // Remove common soft skill/verb starters
      .filter(s => !/^(collaborate|ensure|understand|perform|deliver|using|working|strong|excellent|responsible)/i.test(s))
      // Take only the top 20
      .slice(0, 20);
  }

  return resume;
}
