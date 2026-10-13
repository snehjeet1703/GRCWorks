import { PDFDocument, PDFFont, PDFPage, StandardFonts, degrees, rgb } from "pdf-lib";

// Demo-only Trust Vault documents, generated at seed time so no binaries live in the repo.
// Every page is stamped "SAMPLE" so nobody mistakes them for real attestations.

type Block =
  | { h: string }
  | { p: string }
  | { bullets: string[] }
  | { table: { head: string[]; rows: string[][]; widths: number[] } };

export type SampleDocument = {
  name: string;
  fileName: string;
  description: string;
  category: string;
  visibility: "PUBLIC" | "ACCESS_REQUIRED";
  permission: "VIEW_ONLY" | "DOWNLOADABLE";
  title: string;
  subtitle: string;
  blocks: Block[];
};

const ORG = "Demo Organization";
const PERIOD = "1 April 2025 to 31 March 2026";

export const SAMPLE_DOCUMENTS: SampleDocument[] = [
  {
    name: "SOC-2-Report",
    fileName: "SOC-2-Type-II-Report.pdf",
    description: "Independent service auditor's report on controls relevant to security and availability.",
    category: "Audit",
    visibility: "ACCESS_REQUIRED",
    permission: "VIEW_ONLY",
    title: "SOC 2 Type II Report",
    subtitle: `${ORG} - Report on controls relevant to Security and Availability for the period ${PERIOD}`,
    blocks: [
      { h: "Section 1: Independent Service Auditor's Report" },
      { p: `We have examined ${ORG}'s description of its cloud platform system for the period ${PERIOD} and the suitability of the design and operating effectiveness of controls to provide reasonable assurance that the service commitments and system requirements were achieved based on the trust services criteria relevant to Security and Availability.` },
      { p: "In our opinion, in all material respects, the description presents the system that was designed and implemented throughout the period, and the controls stated in the description were suitably designed and operated effectively throughout the period." },
      { h: "Section 2: Management's Assertion" },
      { p: `Management of ${ORG} is responsible for designing, implementing, operating and maintaining effective controls within the system throughout the period to provide reasonable assurance that its service commitments and system requirements were achieved.` },
      { h: "Section 3: System Description" },
      { bullets: [
        "Infrastructure hosted on a major cloud provider across two availability zones.",
        "Production access restricted to the on-call engineering team through SSO with MFA.",
        "All customer data encrypted at rest (AES-256) and in transit (TLS 1.2+).",
        "Daily encrypted backups with quarterly restore tests.",
      ] },
      { h: "Section 4: Tests of Controls and Results" },
      { table: {
        head: ["Ref", "Control", "Test performed", "Result"],
        widths: [40, 175, 185, 70],
        rows: [
          ["CC6.1", "Logical access requires SSO and MFA", "Inspected IdP config; sampled 25 logins", "No exceptions"],
          ["CC6.2", "Access is provisioned on approved request", "Sampled 25 new joiners", "No exceptions"],
          ["CC6.3", "Leaver access removed within 24 hours", "Sampled 15 leavers", "No exceptions"],
          ["CC7.2", "Security events are monitored and triaged", "Inspected SIEM alerts and tickets", "No exceptions"],
          ["CC8.1", "Changes are peer reviewed before release", "Sampled 40 production changes", "1 exception"],
          ["A1.2", "Backups run daily and restores are tested", "Inspected backup logs and restore records", "No exceptions"],
        ],
      } },
      { h: "Exception noted" },
      { p: "CC8.1: one of 40 sampled changes was merged without a second reviewer during an incident. Management has since enforced branch protection so emergency changes require retrospective review within 24 hours." },
    ],
  },
  {
    name: "VAPT-Report",
    fileName: "Penetration-Test-Summary.pdf",
    description: "Executive summary of the most recent third-party penetration test.",
    category: "Security",
    visibility: "ACCESS_REQUIRED",
    permission: "DOWNLOADABLE",
    title: "Penetration Test Summary",
    subtitle: `${ORG} - Web application and external infrastructure assessment, September 2026`,
    blocks: [
      { h: "Executive summary" },
      { p: "An independent security firm performed a grey-box penetration test of the customer-facing web application, public APIs and external network perimeter over ten working days. Testing followed the OWASP Web Security Testing Guide and PTES methodology." },
      { p: "No critical findings were identified. All high and medium findings were remediated and verified by a retest before this summary was issued." },
      { h: "Findings by severity" },
      { table: {
        head: ["Severity", "Found", "Remediated", "Open"],
        widths: [130, 110, 120, 110],
        rows: [["Critical", "0", "0", "0"], ["High", "1", "1", "0"], ["Medium", "3", "3", "0"], ["Low", "4", "3", "1"], ["Informational", "6", "-", "-"]],
      } },
      { h: "Notable findings" },
      { table: {
        head: ["ID", "Finding", "Severity", "Status"],
        widths: [45, 255, 80, 90],
        rows: [
          ["H-01", "Missing rate limit on password reset endpoint", "High", "Fixed, retested"],
          ["M-01", "Verbose error messages disclosed framework version", "Medium", "Fixed, retested"],
          ["M-02", "Session not invalidated after password change", "Medium", "Fixed, retested"],
          ["M-03", "CSV export vulnerable to formula injection", "Medium", "Fixed, retested"],
          ["L-04", "Security headers missing on legacy marketing host", "Low", "Accepted, scheduled"],
        ],
      } },
      { h: "Scope" },
      { bullets: ["app.example.com and api.example.com (authenticated and unauthenticated)", "External IP ranges for production", "Out of scope: third-party sub-processors and physical security"] },
    ],
  },
  {
    name: "ISO-27001-Certificate",
    fileName: "ISO-27001-Certificate.pdf",
    description: "Certificate of registration for our information security management system.",
    category: "Certification",
    visibility: "PUBLIC",
    permission: "DOWNLOADABLE",
    title: "Certificate of Registration",
    subtitle: "ISO/IEC 27001:2022 Information Security Management System",
    blocks: [
      { p: "This is to certify that" },
      { h: ORG },
      { p: "operates an Information Security Management System which complies with the requirements of ISO/IEC 27001:2022 for the following scope:" },
      { p: "The design, development, operation and support of the cloud-based governance, risk and compliance platform, in accordance with the Statement of Applicability version 3.1." },
      { table: {
        head: ["Certificate number", "Original registration", "Current issue", "Expiry"],
        widths: [130, 120, 110, 110],
        rows: [["IS 000000 (sample)", "15 May 2024", "15 May 2026", "14 May 2027"]],
      } },
      { p: "Continued validity is subject to satisfactory annual surveillance audits." },
    ],
  },
  {
    name: "Privacy-Policy",
    fileName: "Privacy-Policy.pdf",
    description: "How we collect, use and protect personal data.",
    category: "Legal",
    visibility: "PUBLIC",
    permission: "DOWNLOADABLE",
    title: "Privacy Policy",
    subtitle: `${ORG} - Last updated 1 October 2026`,
    blocks: [
      { h: "1. Who we are" },
      { p: `${ORG} provides a governance, risk and compliance platform to business customers. For customer data processed in the platform we act as a processor; for account and billing data we act as a controller.` },
      { h: "2. Data we collect" },
      { bullets: ["Account details: name, work email, role.", "Usage data: log-in times, IP address, browser type.", "Customer content you upload, which we process only on your instructions."] },
      { h: "3. How we use it" },
      { p: "To provide and secure the service, to support you, and to meet legal obligations. We do not sell personal data or use customer content to train models." },
      { h: "4. Sub-processors and transfers" },
      { p: "We use the sub-processors listed on our Trust Center. Transfers outside your region rely on Standard Contractual Clauses or an adequacy decision." },
      { h: "5. Retention and your rights" },
      { p: "We keep account data while your contract is active and delete customer content within 30 days of termination. You can request access, correction, deletion or a copy of your data at privacy@example.com." },
    ],
  },
  {
    name: "Security-Whitepaper",
    fileName: "Security-Whitepaper.pdf",
    description: "Overview of our security architecture and practices.",
    category: "Security",
    visibility: "PUBLIC",
    permission: "VIEW_ONLY",
    title: "Security Whitepaper",
    subtitle: `How ${ORG} protects customer data`,
    blocks: [
      { h: "Infrastructure" },
      { p: "Production runs in isolated cloud accounts with private networking. Only the load balancer is reachable from the internet, and all administrative access goes through an SSO-protected bastion with MFA and session recording." },
      { h: "Data protection" },
      { bullets: ["AES-256 encryption at rest with keys in a managed KMS.", "TLS 1.2+ for all traffic, HSTS enforced.", "Per-customer logical isolation enforced in every database query.", "Daily backups, 35-day retention, quarterly restore tests."] },
      { h: "Application security" },
      { p: "Every change is peer reviewed and passes automated tests, dependency scanning and static analysis before release. We run an annual third-party penetration test and fix high findings within 30 days." },
      { h: "Monitoring and response" },
      { p: "Centralised logging feeds alerting that pages the on-call engineer 24/7. Our incident response plan is tested twice a year, and customers are notified of incidents affecting their data within 72 hours." },
    ],
  },
];

const A4 = { w: 595, h: 842 };
const MARGIN = 62;
const INK = rgb(0.1, 0.12, 0.16);
const MUTED = rgb(0.42, 0.45, 0.5);
const ACCENT = rgb(0.31, 0.27, 0.9);
const LINE = rgb(0.86, 0.87, 0.9);

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderSamplePdf(doc: SampleDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${doc.title} (sample)`);
  pdf.setAuthor(ORG);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const width = A4.w - MARGIN * 2;

  let page!: PDFPage;
  let y = 0;
  const newPage = () => {
    page = pdf.addPage([A4.w, A4.h]);
    y = A4.h - MARGIN;
    page.drawRectangle({ x: 0, y: A4.h - 6, width: A4.w, height: 6, color: ACCENT });
  };
  const ensure = (needed: number) => {
    if (y - needed < MARGIN + 20) newPage();
  };
  const text = (s: string, size: number, f = font, color = INK, indent = 0) => {
    for (const l of wrap(s, f, size, width - indent)) {
      ensure(size + 4);
      page.drawText(l, { x: MARGIN + indent, y: y - size, size, font: f, color });
      y -= size + 4;
    }
  };

  newPage();
  page.drawText(ORG.toUpperCase(), { x: MARGIN, y: y - 10, size: 9, font: bold, color: ACCENT });
  y -= 34;
  text(doc.title, 24, bold);
  y -= 4;
  text(doc.subtitle, 11, font, MUTED);
  y -= 10;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: A4.w - MARGIN, y }, thickness: 1, color: LINE });
  y -= 18;

  for (const b of doc.blocks) {
    if ("h" in b) {
      ensure(40);
      y -= 6;
      text(b.h, 13, bold);
      y -= 4;
    } else if ("p" in b) {
      text(b.p, 10.5);
      y -= 8;
    } else if ("bullets" in b) {
      for (const item of b.bullets) {
        ensure(16);
        page.drawCircle({ x: MARGIN + 4, y: y - 6.5, size: 1.8, color: INK });
        text(item, 10.5, font, INK, 14);
        y -= 2;
      }
      y -= 6;
    } else {
      const { head, rows, widths } = b.table;
      const drawRow = (cells: string[], f: PDFFont, fill?: ReturnType<typeof rgb>) => {
        const wrapped = cells.map((c, i) => wrap(c, f, 9, widths[i] - 10));
        const h = Math.max(...wrapped.map((w) => w.length)) * 12 + 8;
        ensure(h);
        if (fill) page.drawRectangle({ x: MARGIN, y: y - h, width: widths.reduce((a, c) => a + c, 0), height: h, color: fill });
        let x = MARGIN;
        wrapped.forEach((lines, i) => {
          lines.forEach((l, j) => page.drawText(l, { x: x + 5, y: y - 13 - j * 12, size: 9, font: f, color: INK }));
          x += widths[i];
        });
        y -= h;
        page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + widths.reduce((a, c) => a + c, 0), y }, thickness: 0.5, color: LINE });
      };
      drawRow(head, bold, rgb(0.95, 0.95, 0.98));
      rows.forEach((r) => drawRow(r, font));
      y -= 14;
    }
  }

  // Stamp every page so the files can never pass for real reports.
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawText("SAMPLE", { x: 150, y: 330, size: 110, font: bold, color: ACCENT, opacity: 0.06, rotate: degrees(35) });
    p.drawText(`Sample document generated for the ${ORG} demo. Not a real report or attestation.`, { x: MARGIN, y: 34, size: 7.5, font, color: MUTED });
    p.drawText(`${i + 1} / ${pages.length}`, { x: A4.w - MARGIN - 20, y: 34, size: 7.5, font, color: MUTED });
  });

  return pdf.save();
}
