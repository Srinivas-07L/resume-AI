export type ContactInfo = {
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  website?: string;
};

export type ExperienceEntry = {
  company: string;
  role: string;
  location?: string;
  start: string;
  end: string;
  bullets: string[];
};

export type ProjectEntry = {
  name: string;
  stack?: string;
  bullets: string[];
};

export type EducationEntry = {
  school: string;
  degree: string;
  start?: string;
  end?: string;
  details?: string;
};

export type RewrittenResume = {
  name: string;
  title: string;
  contact: ContactInfo;
  summary: string;
  skills: string[];
  experience: ExperienceEntry[];
  projects?: ProjectEntry[];
  education: EducationEntry[];
  certifications?: string[];
  ai_match_score: number;
  jd_keywords: string[];
  company_name: string;
};

const STOPWORDS = new Set([
  "the","and","for","with","you","your","our","are","will","that","this","from","have","has","but","not","any","all","who","what","when","where","why","how","into","out","per","via","etc","able","must","should","would","could","may","can","new","work","working","experience","years","year","plus","using","use","used","include","includes","including","across","over","more","than","such","like","also","based","strong","good","great","ability","preferred","required","role","team","teams","build","building","develop","developing","design","designing"
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9+#./\- ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function ngrams(tokens: string[], n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    out.push(tokens.slice(i, i + n).join(" "));
  }
  return out;
}

function extractKeyPhrases(jd: string): Set<string> {
  const tokens = tokenize(jd);
  const phrases = new Set<string>();
  // unigrams
  for (const t of tokens) {
    if (t.length < 3) continue;
    if (STOPWORDS.has(t)) continue;
    if (/^\d+$/.test(t)) continue;
    phrases.add(t);
  }
  // bigrams & trigrams (skip if all stopwords)
  for (const n of [2, 3]) {
    for (const g of ngrams(tokens, n)) {
      const parts = g.split(" ");
      if (parts.every((p) => STOPWORDS.has(p) || p.length < 3)) continue;
      phrases.add(g);
    }
  }
  return phrases;
}

export function keywordOverlapScore(resumeText: string, jd: string): {
  score: number;
  matched: string[];
  missing: string[];
} {
  const jdPhrases = [...extractKeyPhrases(jd)].filter((p) => p.length >= 3);
  // Normalize resume: collapse all non-alphanumerics to single spaces so
  // word boundaries are detectable regardless of punctuation/newlines.
  const norm = (s: string) =>
    " " + s.toLowerCase().replace(/[^a-z0-9+#./\-]+/g, " ").replace(/\s+/g, " ") + " ";
  const resumeNorm = norm(resumeText);

  const isMatch = (p: string) => resumeNorm.includes(" " + p + " ");

  // Weight phrases: trigrams=3, bigrams=2, unigrams=1.
  const weightOf = (p: string) => p.split(" ").length;

  // Prefer specific multi-word phrases; cap to keep scoring focused.
  const sorted = jdPhrases.sort((a, b) => weightOf(b) - weightOf(a) || b.length - a.length).slice(0, 150);

  let matchedWeight = 0;
  let totalWeight = 0;
  const matched: string[] = [];
  const missing: string[] = [];
  for (const p of sorted) {
    const w = weightOf(p);
    totalWeight += w;
    if (isMatch(p)) {
      matchedWeight += w;
      matched.push(p);
    } else {
      missing.push(p);
    }
  }
  const score = totalWeight === 0 ? 0 : Math.round((matchedWeight / totalWeight) * 100);
  return { score, matched, missing };
}

export function resumeToPlainText(r: RewrittenResume): string {
  const parts: string[] = [];
  parts.push(r.name, r.title, Object.values(r.contact).filter(Boolean).join(" "));
  parts.push(r.summary);
  parts.push(r.skills.join(", "));
  for (const e of r.experience) {
    parts.push(`${e.role} ${e.company} ${e.location ?? ""} ${e.start} ${e.end}`);
    parts.push(e.bullets.join(" "));
  }
  for (const p of r.projects ?? []) {
    parts.push(`${p.name} ${p.stack ?? ""}`);
    parts.push(p.bullets.join(" "));
  }
  for (const ed of r.education) {
    parts.push(`${ed.degree} ${ed.school} ${ed.start ?? ""} ${ed.end ?? ""} ${ed.details ?? ""}`);
  }
  parts.push((r.certifications ?? []).join(", "));
  return parts.join("\n");
}

export function hybridScore(aiScore: number, overlapScore: number): number {
  // Weight deterministic overlap heavily — it's what real ATS systems do.
  // Floor by overlap so a strong keyword match can't be dragged down by a
  // pessimistic AI self-score.
  const blended = Math.round(aiScore * 0.25 + overlapScore * 0.75);
  return Math.max(blended, overlapScore - 2);
}

