// Edge function: rewrite resume for JD using Lovable AI Gateway (Gemini 2.5 Pro)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are a Senior Technical Recruiter and ATS optimization expert. You will rewrite a candidate's resume to maximally match a provided Job Description (JD).

CORE RULES (NON-NEGOTIABLE):
- Domain Agnostic: Whether VLSI, Full Stack, Mechanical, Finance, Marketing — identify the EXACT technical verbs and nouns in the JD.
- Keyword Mirroring: Use the EXACT strings from the JD. If the JD says "Object-Oriented Programming", do NOT write "OOP". If JD says "RTL design", do not write "register transfer level".
- Google XYZ Formula: Every bullet MUST follow: "Accomplished [X] as measured by [Y], by doing [Z]." Use strong action verbs and quantified metrics.
- The 95% Rule: Remove ALL fluff. No "passionate", "team player", "hardworking", "results-driven". Only hard skills, tools, frameworks, and quantified outcomes.
- Preserve truth: do not invent employers, degrees, or fake numbers. If the original has a metric, keep/sharpen it. If none, use a realistic conservative estimate clearly tied to the original work.
- Single column, plain text only. No tables, no icons, no columns.

OUTPUT: Return ONLY a tool call to "emit_resume" with the structured rewritten resume and a match analysis. No prose.`;

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
        summary: { type: "string", description: "3-4 line professional summary, JD-mirrored, no fluff" },
        skills: {
          type: "array",
          items: { type: "string" },
          description: "Flat list of exact JD-mirrored hard skills/tools/keywords",
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
                description: "XYZ-formula bullets, each ending with a period.",
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
          description: "AI's qualitative 0-100 score of how well the rewritten resume matches the JD.",
        },
        jd_keywords: {
          type: "array",
          items: { type: "string" },
          description: "Critical exact-string keywords/phrases extracted from the JD that an ATS would scan for.",
        },
        company_name: {
          type: "string",
          description: "Best-guess company name extracted from the JD, single token (e.g. 'Google'). Empty string if unknown.",
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

    const userMsg = `JOB DESCRIPTION:\n"""\n${jobDescription}\n"""\n\nORIGINAL RESUME (raw text from PDF):\n"""\n${resumeText}\n"""\n\nRewrite this resume to maximize ATS match for the JD. Mirror the JD's exact keywords. Apply the XYZ formula to every bullet. Then call the emit_resume function.`;

    // Google AI Studio: free tier on gemini-2.0-flash / gemini-1.5-flash
    // Try the stronger model first; fall back to the lighter one if it stays rate-limited.
    const MODELS = ["gemini-2.0-flash", "gemini-flash-latest"];
    const delays = [2000, 5000, 12000, 25000]; // up to 5 attempts per model

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
      console.log(`Trying model: ${model}`);
      aiRes = await callGemini(model);
      let attempt = 0;
      while (aiRes.status === 429 && attempt < delays.length) {
        await aiRes.text();
        console.log(`429 on ${model} — retry ${attempt + 1}/${delays.length} in ${delays[attempt]}ms`);
        await new Promise((r) => setTimeout(r, delays[attempt]));
        attempt++;
        aiRes = await callGemini(model);
      }
      if (aiRes.status !== 429) break; // success or non-429 error: stop trying models
      console.log(`${model} exhausted retries, falling back...`);
    }

    if (!aiRes || !aiRes.ok) {
      if (!aiRes) {
        return new Response(JSON.stringify({ error: "Gemini call failed to initialize" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiRes.text();
      console.error("Gemini error", aiRes.status, errText);
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Gemini free-tier rate limit hit. Wait a minute and retry." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: `Gemini error: ${errText.slice(0, 300)}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiRes.json();
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const fnCall = parts.find((p: any) => p.functionCall)?.functionCall;
    if (!fnCall?.args) {
      console.error("No functionCall in response", JSON.stringify(data).slice(0, 1500));
      return new Response(JSON.stringify({ error: "AI did not return structured resume" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const resume = fnCall.args;

    return new Response(JSON.stringify({ resume }), {
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
