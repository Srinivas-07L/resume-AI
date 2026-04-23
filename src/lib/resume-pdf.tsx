import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  pdf,
} from "@react-pdf/renderer";
import type { RewrittenResume } from "./scoring";

// Use Helvetica (built-in PostScript font, always text-searchable)
Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 40,
    paddingLeft: 50,
    paddingRight: 50,
    fontFamily: "Helvetica",
    fontSize: 12,
    color: "#000000",
    lineHeight: 1.4,
  },
  name: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 12,
    marginBottom: 6,
    color: "#444444",
  },
  contactLine: {
    fontSize: 11,
    marginBottom: 12,
  },
  sectionHeader: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    marginTop: 14,
    marginBottom: 6,
    textTransform: "uppercase",
    borderBottomWidth: 1,
    borderBottomColor: "#000000",
    paddingBottom: 2,
  },
  paragraph: { marginBottom: 6, fontSize: 12 },
  jobHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  jobLeft: { fontFamily: "Helvetica-Bold", fontSize: 12 },
  jobRight: { fontSize: 11 },
  subLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  italic: { fontFamily: "Helvetica-Oblique", fontSize: 11 },
  bulletRow: { flexDirection: "row", marginBottom: 3 },
  bulletDot: { width: 12, fontSize: 12 },
  bulletText: { flex: 1, fontSize: 12 },
  skills: { fontSize: 12 },
});

function ATSResumeDoc({ resume }: { resume: RewrittenResume }) {
  const c = resume.contact;
  const contactParts = [c.email, c.phone, c.location, c.linkedin, c.website].filter(Boolean);

  return (
    <Document
      title={`${resume.name} Resume`}
      author={resume.name}
      subject={`Resume for ${resume.title}`}
      creator="ATS Resume Re-engineer"
      producer="ATS Resume Re-engineer"
    >
      <Page size="LETTER" style={styles.page} wrap>
        <Text style={styles.name}>{resume.name}</Text>
        <Text style={styles.title}>{resume.title}</Text>
        <Text style={styles.contactLine}>{contactParts.join(" | ")}</Text>

        <Text style={styles.sectionHeader}>Summary</Text>
        <Text style={styles.paragraph}>{resume.summary}</Text>

        <Text style={styles.sectionHeader}>Skills</Text>
        <Text style={styles.skills}>{resume.skills.join(", ")}</Text>

        <Text style={styles.sectionHeader}>Experience</Text>
        {resume.experience.map((exp, i) => (
          <View key={i} wrap={false}>
            <View style={styles.jobHeader}>
              <Text style={styles.jobLeft}>{exp.role}</Text>
              <Text style={styles.jobRight}>
                {exp.start} – {exp.end}
              </Text>
            </View>
            <View style={styles.subLine}>
              <Text style={styles.italic}>
                {exp.company}
                {exp.location ? `, ${exp.location}` : ""}
              </Text>
            </View>
            {exp.bullets.map((b, j) => (
              <View key={j} style={styles.bulletRow}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>{b}</Text>
              </View>
            ))}
          </View>
        ))}

        {resume.projects && resume.projects.length > 0 && (
          <>
            <Text style={styles.sectionHeader}>Projects</Text>
            {resume.projects.map((p, i) => (
              <View key={i} wrap={false}>
                <View style={styles.jobHeader}>
                  <Text style={styles.jobLeft}>{p.name}</Text>
                  {p.stack ? <Text style={styles.jobRight}>{p.stack}</Text> : <Text />}
                </View>
                {p.bullets.map((b, j) => (
                  <View key={j} style={styles.bulletRow}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={styles.bulletText}>{b}</Text>
                  </View>
                ))}
              </View>
            ))}
          </>
        )}

        <Text style={styles.sectionHeader}>Education</Text>
        {resume.education.map((ed, i) => (
          <View key={i} wrap={false}>
            <View style={styles.jobHeader}>
              <Text style={styles.jobLeft}>{ed.degree}</Text>
              <Text style={styles.jobRight}>
                {ed.start ? `${ed.start} – ` : ""}{ed.end ?? ""}
              </Text>
            </View>
            <Text style={styles.italic}>{ed.school}</Text>
            {ed.details ? <Text style={styles.paragraph}>{ed.details}</Text> : null}
          </View>
        ))}

        {resume.certifications && resume.certifications.length > 0 && (
          <>
            <Text style={styles.sectionHeader}>Certifications</Text>
            <Text style={styles.skills}>{resume.certifications.join(", ")}</Text>
          </>
        )}
      </Page>
    </Document>
  );
}

export async function generateResumePdfBlob(resume: RewrittenResume): Promise<Blob> {
  const blob = await pdf(<ATSResumeDoc resume={resume} />).toBlob();
  return blob;
}

export function buildPdfFilename(resume: RewrittenResume): string {
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9]+/g, "");
  const name = safe(resume.name || "Resume");
  const company = safe(resume.company_name || "Company");
  return `${name}_Resume_${company}.pdf`;
}
