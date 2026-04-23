import { useCallback, useMemo, useRef, useState } from "react";
import { FileUp, Sparkles, Download, FileText, Target, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { extractPdfText } from "@/lib/pdf-extract";
import {
  hybridScore,
  keywordOverlapScore,
  resumeToPlainText,
  type RewrittenResume,
} from "@/lib/scoring";
import { buildPdfFilename, generateResumePdfBlob } from "@/lib/resume-pdf";

type Phase = "idle" | "extracting" | "rewriting" | "done";

export default function Index() {
  const [jd, setJd] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [resume, setResume] = useState<RewrittenResume | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const inputRef = useRef<HTMLInputElement>(null);

  const beforeAnalysis = useMemo(() => {
    if (!resumeText || !jd) return null;
    return keywordOverlapScore(resumeText, jd);
  }, [resumeText, jd]);

  const afterAnalysis = useMemo(() => {
    if (!resume || !jd) return null;
    return keywordOverlapScore(resumeToPlainText(resume), jd);
  }, [resume, jd]);

  const beforeScore = beforeAnalysis?.score ?? 0;
  const afterScore = useMemo(() => {
    if (!resume || !afterAnalysis) return 0;
    return hybridScore(resume.ai_match_score ?? 0, afterAnalysis.score);
  }, [resume, afterAnalysis]);

  const onFile = useCallback(async (f: File | null) => {
    if (!f) return;
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Please upload a PDF file.");
      return;
    }
    setFile(f);
    setPhase("extracting");
    try {
      const text = await extractPdfText(f);
      if (!text || text.length < 50) {
        toast.error("Could not extract text. Is this a scanned/image PDF?");
        setPhase("idle");
        return;
      }
      setResumeText(text);
      setPhase("idle");
      toast.success("Resume parsed successfully.");
    } catch (e) {
      console.error(e);
      toast.error("Failed to read PDF.");
      setPhase("idle");
    }
  }, []);

  const handleRewrite = async () => {
    if (!resumeText) return toast.error("Upload your resume PDF first.");
    if (jd.trim().length < 50) return toast.error("Paste the full job description (50+ chars).");
    setPhase("rewriting");
    setResume(null);
    try {
      const { data, error } = await supabase.functions.invoke("rewrite-resume", {
        body: { resumeText, jobDescription: jd },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const r = (data as any)?.resume as RewrittenResume;
      if (!r) throw new Error("Empty response");
      setResume(r);
      setPhase("done");
      toast.success("Resume re-engineered.");
    } catch (e: any) {
      console.error(e);
      const msg = e?.message ?? "Rewrite failed";
      if (msg.toLowerCase().includes("rate")) toast.error("Rate limited. Try again in a moment.");
      else if (msg.toLowerCase().includes("credit") || msg.includes("402")) toast.error("AI credits exhausted. Add funds in Workspace settings.");
      else toast.error(msg);
      setPhase("idle");
    }
  };

  const handleDownload = async () => {
    if (!resume) return;
    try {
      const blob = await generateResumePdfBlob(resume);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = buildPdfFilename(resume);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      toast.error("PDF generation failed.");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Hero */}
      <header className="border-b border-border/60 bg-background/70 backdrop-blur sticky top-0 z-10">
        <div className="container mx-auto flex items-center justify-between py-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-gradient-hero flex items-center justify-center text-primary-foreground">
              <Target className="h-4 w-4" />
            </div>
            <span className="font-display font-semibold tracking-tight">ATS Re-engineer</span>
          </div>
          <Badge variant="secondary" className="hidden sm:inline-flex">Powered by AI</Badge>
        </div>
      </header>

      <main className="container mx-auto py-10">
        <section className="max-w-3xl">
          <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight leading-tight">
            Universal Resume Re-engineer
          </h1>
          <p className="mt-3 text-muted-foreground text-lg">
            Convert any resume into a <strong className="text-foreground">95%+ ATS-compliant PDF</strong> tailored to any job description — VLSI, Full Stack, Mechanical, Finance, anything.
          </p>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-2">
          {/* JD */}
          <Card className="p-6 shadow-card">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <h2 className="font-semibold">Job Description</h2>
              </div>
              <span className="text-xs text-muted-foreground">{jd.length} chars</span>
            </div>
            <Textarea
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              placeholder="Paste the full JD here. Include responsibilities, requirements, tech stack, qualifications…"
              className="min-h-[280px] font-mono text-sm"
            />
          </Card>

          {/* Resume upload */}
          <Card className="p-6 shadow-card">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileUp className="h-4 w-4 text-primary" />
                <h2 className="font-semibold">Your Resume (PDF)</h2>
              </div>
              {resumeText && (
                <span className="text-xs text-success flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Parsed
                </span>
              )}
            </div>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                onFile(e.dataTransfer.files?.[0] ?? null);
              }}
              onClick={() => inputRef.current?.click()}
              className="cursor-pointer rounded-lg border-2 border-dashed border-border hover:border-primary/50 transition-colors p-8 text-center bg-muted/30"
            >
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                hidden
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
              {phase === "extracting" ? (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  Extracting text…
                </div>
              ) : file ? (
                <div className="flex flex-col items-center gap-1">
                  <FileText className="h-8 w-8 text-primary" />
                  <p className="font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(0)} KB · click to replace
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1 text-muted-foreground">
                  <FileUp className="h-8 w-8" />
                  <p className="font-medium text-foreground">Drop your PDF here, or click to browse</p>
                  <p className="text-xs">Text-based PDFs only (not scanned images)</p>
                </div>
              )}
            </div>

            <Button
              onClick={handleRewrite}
              disabled={phase === "rewriting" || !resumeText || jd.trim().length < 50}
              className="w-full mt-5 bg-gradient-hero hover:opacity-95 shadow-elegant"
              size="lg"
            >
              {phase === "rewriting" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Re-engineering with AI…
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Re-engineer Resume
                </>
              )}
            </Button>
          </Card>
        </section>

        {/* Comparison */}
        {(beforeAnalysis || resume) && (
          <section className="mt-10">
            <h2 className="font-display text-2xl font-bold tracking-tight">Comparison Mode</h2>
            <p className="text-muted-foreground text-sm mt-1">
              Match Score uses a hybrid of deterministic JD keyword overlap and AI judgment.
            </p>

            <div className="grid gap-6 md:grid-cols-2 mt-6">
              <ScoreCard
                label="Before"
                tone="muted"
                score={beforeScore}
                matched={beforeAnalysis?.matched.length ?? 0}
                missing={beforeAnalysis?.missing.slice(0, 12) ?? []}
              />
              <ScoreCard
                label="After"
                tone="primary"
                score={afterScore}
                matched={afterAnalysis?.matched.length ?? 0}
                missing={afterAnalysis?.missing.slice(0, 12) ?? []}
                highlight
              />
            </div>

            {resume && (
              <Card className="mt-6 p-6 shadow-card">
                <div className="flex items-start justify-between flex-wrap gap-4">
                  <div>
                    <h3 className="font-display text-xl font-semibold">{resume.name}</h3>
                    <p className="text-muted-foreground">{resume.title}</p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {resume.skills.slice(0, 14).map((s, i) => (
                        <Badge key={i} variant="secondary" className="font-normal">{s}</Badge>
                      ))}
                    </div>
                  </div>
                  <Button onClick={handleDownload} size="lg" className="bg-foreground text-background hover:bg-foreground/90">
                    <Download className="mr-2 h-4 w-4" />
                    Download ATS PDF
                  </Button>
                </div>

                <div className="mt-6 space-y-5">
                  <Section title="Summary"><p className="text-sm leading-relaxed">{resume.summary}</p></Section>
                  <Section title="Experience">
                    <div className="space-y-4">
                      {resume.experience.map((exp, i) => (
                        <div key={i}>
                          <div className="flex justify-between text-sm font-medium">
                            <span>{exp.role} — <span className="text-muted-foreground font-normal">{exp.company}</span></span>
                            <span className="text-muted-foreground">{exp.start} – {exp.end}</span>
                          </div>
                          <ul className="list-disc pl-5 mt-1 text-sm space-y-1">
                            {exp.bullets.map((b, j) => (<li key={j}>{b}</li>))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </Section>
                </div>
              </Card>
            )}
          </section>
        )}

        <footer className="mt-16 py-8 text-center text-xs text-muted-foreground">
          Output PDF: single-column, Helvetica, no tables/images/columns — fully text-searchable for ATS parsers.
        </footer>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-2">{title}</h4>
      {children}
    </div>
  );
}

function ScoreCard({
  label,
  score,
  matched,
  missing,
  tone,
  highlight,
}: {
  label: string;
  score: number;
  matched: number;
  missing: string[];
  tone: "muted" | "primary";
  highlight?: boolean;
}) {
  const color = score >= 90 ? "text-success" : score >= 70 ? "text-primary" : score >= 50 ? "text-warning" : "text-destructive";
  return (
    <Card className={`p-6 shadow-card ${highlight ? "ring-2 ring-primary/30" : ""}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <Badge variant={tone === "primary" ? "default" : "secondary"}>Match Score</Badge>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className={`font-display text-5xl font-bold ${color}`}>{score}</span>
        <span className="text-muted-foreground">/100</span>
      </div>
      <Progress value={score} className="mt-3" />
      <p className="text-xs text-muted-foreground mt-3">{matched} JD keywords matched</p>
      {missing.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium mb-1 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> Missing keywords
          </p>
          <div className="flex flex-wrap gap-1.5">
            {missing.map((m, i) => (
              <span key={i} className="text-[11px] px-2 py-0.5 rounded bg-muted text-muted-foreground">{m}</span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
