import { RewrittenResume } from "./scoring";

const SYSTEM_PROMPT = `You are a Universal Career Strategy Expert. Your mission is "Intelligent Technical Tailoring" — bridging a candidate's REAL expertise to a specific Job Description (JD) while maintaining 100% integrity.

THE DYNAMIC IDENTITY PROTOCOL:
1. DETECT IDENTITY: First, analyze the 'ORIGINAL RESUME' to identify the candidate's core field (e.g., ECE, Marketing, Finance, VLSI). 
2. ANALYZE JD: Identify the target role's technical nouns, required tools, and key performance indicators (KPIs).
3. THE BRIDGE: Operate ONLY within the intersection of the candidate's actual experience and the JD requirements. If the resume is Finance and the JD is Banking, act as a Finance expert. If the resume is ECE and the JD is VLSI, act as a VLSI expert.

THE TAILORING ENGINE:
1. NO HALLUCINATIONS: Never invent experience. If a skill is in the JD but missing from the resume, do NOT add it. You may only highlight related transferable skills found in the original resume.
2. STRATEGIC REWRITING: Translate the user's past actions into the 'language' of the JD. Do NOT copy-paste the JD word-for-word.
3. GOOGLE XYZ FORMULA: Every bullet must follow: "Accomplished [X] as measured by [Y], by doing [Z]."

STRICT FORMATTING RULES:
- HARD SKILLS ONLY: The 'skills' section is for technical tools, languages, and hard methodologies only. NO soft skills, NO verbs.
- ATS OPTIMIZED: Return a professional, single-column document structure. Target 1 page, but allow a 2nd page if the candidate's experience is deep and warrants it.

Your goal is a high-impact, authentic resume that fits the JD perfectly using only the facts provided.`;

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

const MODELS = [
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
];

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 2,
  initialDelay = 1000
): Promise<Response> {
  let lastError: any;
  
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      
      if (response.ok) return response;
      
      // If not 429 (Rate Limit) or 5xx (Server Error), don't retry
      if (response.status !== 429 && response.status < 500) {
        return response;
      }
      
      console.warn(`Gemini API attempt ${i + 1} failed with status ${response.status}. Retrying...`);
    } catch (err) {
      lastError = err;
      console.warn(`Gemini API attempt ${i + 1} threw an error. Retrying...`, err);
    }
    
    if (i < maxRetries) {
      const delay = initialDelay * Math.pow(2, i);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError || new Error("Max retries reached");
}

export async function rewriteResumeWithGemini(resumeText: string, jobDescription: string): Promise<RewrittenResume> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("VITE_GEMINI_API_KEY missing in .env");
  }

  const userMsg = `JOB DESCRIPTION:\n"""\n${jobDescription}\n"""\n\nORIGINAL RESUME:\n"""\n${resumeText}\n"""\n\nRewrite the resume to optimize for the JD. Focus on professional alignment and meaningful keyword integration rather than verbatim copying. Use the emit_resume tool.`;

  let lastError: any;

  // Try each model in the fallback chain
  for (const model of MODELS) {
    try {
      console.log(`Attempting rewrite with model: ${model}`);
      const response = await fetchWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
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
        // If it's a rate limit error, we continue to the next model in the loop
        if (response.status === 429) {
          console.warn(`Model ${model} is rate limited. Trying fallback...`);
          continue;
        }
        throw new Error(`Gemini error (${model}): ${errText.slice(0, 300)}`);
      }

      const data = await response.json();
      const parts = data?.candidates?.[0]?.content?.parts ?? [];
      const fnCall = parts.find((p: any) => p.functionCall)?.functionCall;

      if (!fnCall?.args) {
        console.warn(`Model ${model} did not return structured data. Trying fallback...`);
        continue;
      }

      const resume = fnCall.args as RewrittenResume;

      // ===== POST-PROCESSING FILTER (HARD ENFORCEMENT) =====
      if (resume.skills && Array.isArray(resume.skills)) {
        resume.skills = resume.skills
          .map(s => s.trim())
          .filter(s => s.split(/\s+/).length <= 4)
          .filter(s => !/^\d+\./.test(s))
          .filter(s => !/^(collaborate|ensure|understand|perform|deliver|using|working|strong|excellent|responsible)/i.test(s))
          .slice(0, 20);
      }

      return resume;
    } catch (err: any) {
      lastError = err;
      console.error(`Error with model ${model}:`, err);
      // Continue to next model if it's a transient error or rate limit
    }
  }

  throw lastError || new Error("All AI models failed to process the request. Please try again later.");
}

