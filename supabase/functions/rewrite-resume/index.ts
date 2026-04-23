// Edge function: rewrite resume for JD using Lovable AI Gateway (Gemini 2.5 Pro)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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
  type: "function",
  function: {
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
          additionalProperties: false,
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
            additionalProperties: false,
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
            additionalProperties: false,
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
            additionalProperties: false,
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
      additionalProperties: false,
    },
  },
};

// Strip OpenAI-specific keywords ("additionalProperties") so the schema is valid for Gemini.
function cleanSchema(s: any): any {
  if (Array.isArray(s)) return s.map(cleanSchema);
  if (s && typeof s === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(s)) {
      if (k === "additionalProperties") continue;
      out[k] = cleanSchema(v);
    }
    return out;
  }
  return s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { resumeText, jobDescription } = await req.json();
    if (!resumeText || !jobDescription) {
      return new Response(JSON.stringify({ error: "resumeText and jobDescription required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing");

    const userMsg = `JOB DESCRIPTION:\n"""\n${jobDescription}\n"""\n\nORIGINAL RESUME:\n"""\n${resumeText}\n"""\n\nRewrite the resume to optimize for the JD. Focus on professional alignment and meaningful keyword integration rather than verbatim copying. Use the emit_resume tool.`;

    const MODELS = ["gemini-2.0-flash", "gemini-flash-latest"];
    const delays = [2000, 5000, 12000, 25000];

    const callGemini = (model: string) => fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: userMsg }] }],
          tools: [
            {
              functionDeclarations: [
                {
                  name: tool.function.name,
                  description: tool.function.description,
                  parameters: cleanSchema(tool.function.parameters),
                },
              ],
            },
          ],
          toolConfig: {
            functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["emit_resume"] },
          },
        }),
      },
    );

    let aiRes: Response | null = null;
    for (const model of MODELS) {
      aiRes = await callGemini(model);
      let attempt = 0;
      while (aiRes.status === 429 && attempt < delays.length) {
        await aiRes.text();
        await new Promise((r) => setTimeout(r, delays[attempt]));
        attempt++;
        aiRes = await callGemini(model);
      }
      if (aiRes.status !== 429) break;
    }

    if (!aiRes || !aiRes.ok) {
      const errText = aiRes ? await aiRes.text() : "Unknown error";
      return new Response(JSON.stringify({ error: `Gemini error: ${errText.slice(0, 300)}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiRes.json();
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const fnCall = parts.find((p: any) => p.functionCall)?.functionCall;
    
    if (!fnCall?.args) {
      return new Response(JSON.stringify({ error: "AI did not return structured resume" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ resume: fnCall.args }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("rewrite-resume error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
