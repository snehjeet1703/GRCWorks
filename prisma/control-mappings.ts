// Cross-framework control mapping catalog.
//
// Each entry defines ONE underlying control (a thing you implement once — e.g. "MFA on privileged
// accounts") and the code it appears as in each framework's citation scheme. Implementing the
// control once + attaching evidence once satisfies every mapped framework requirement.
//
// The `canonicalCode` is used internally as Control.code (unique per org). The per-framework
// `code` is stored on FrameworkRequirement.code and is what the auditor sees when browsing that
// specific framework's requirement list.
//
// Sources: control catalogs cross-referenced against the AICPA TSC 2017, ISO 27001:2022 Annex A,
// 45 CFR §164.308-.312, PCI-DSS v4.0.1, GDPR Regulation (EU) 2016/679, and NIST CSF 2.0. Mappings
// are conservative — a concept is only listed under a framework when the framework has a clearly
// dedicated citation for it. ISO/IEC 42001:2023 (AI management systems) clause and Annex A
// references are listed by number with short descriptive titles.

export type FrameworkName =
  | "SOC 2 Type II"
  | "ISO 27001:2022"
  | "HIPAA Security Rule"
  | "PCI-DSS v4.0.1"
  | "GDPR"
  | "NIST CSF 2.0"
  | "ISO 27701:2019"
  | "DPDP Act 2023"
  | "ISO/IEC 42001:2023";

export type ConceptMapping = {
  /** Short slug used as Control.code. Must be unique per org. */
  canonicalCode: string;
  /** Human title for the underlying control. Shown when the control isn't in a framework context. */
  title: string;
  /** How this control appears in each framework the concept is cited under. */
  citations: Partial<Record<FrameworkName, { code: string; title?: string }[]>>;
};

export const CONTROL_MAPPINGS: ConceptMapping[] = [
  {
    canonicalCode: "MFA-ADMIN",
    title: "Multi-factor authentication for privileged accounts",
    citations: {
      "SOC 2 Type II": [{ code: "CC6.1", title: "Logical and physical access controls" }],
      "ISO 27001:2022": [{ code: "A.8.5", title: "Secure authentication" }],
      "HIPAA Security Rule": [{ code: "164.312(d)", title: "Person or entity authentication" }],
      "PCI-DSS v4.0.1": [
        { code: "8.3", title: "Strong authentication for users and administrators is established and managed" },
        { code: "8.4", title: "Multi-factor authentication (MFA) is implemented to secure access" },
      ],
      "NIST CSF 2.0": [{ code: "PR.AA", title: "Identity Management, Authentication, and Access Control" }],
    },
  },
  {
    canonicalCode: "LEAST-PRIVILEGE",
    title: "Role-based access and least privilege",
    citations: {
      "SOC 2 Type II": [{ code: "CC6.3", title: "Role-based access and least privilege" }],
      "ISO 27001:2022": [
        { code: "A.8.2", title: "Privileged access rights" },
        { code: "A.8.3", title: "Information access restriction" },
      ],
      "HIPAA Security Rule": [{ code: "164.308(a)(4)(i)", title: "Information access management" }],
      "PCI-DSS v4.0.1": [
        { code: "7.2", title: "Access to system components and data is appropriately defined and assigned" },
      ],
      "NIST CSF 2.0": [{ code: "PR.AA", title: "Identity Management, Authentication, and Access Control" }],
    },
  },
  {
    canonicalCode: "ACCESS-REVIEW",
    title: "Periodic access reviews",
    citations: {
      "SOC 2 Type II": [{ code: "CC6.2", title: "Prior to issuing system credentials and granting access" }],
      "ISO 27001:2022": [{ code: "A.5.18", title: "Access rights" }],
      "HIPAA Security Rule": [{ code: "164.308(a)(4)(ii)(C)", title: "Access establishment and modification" }],
      "PCI-DSS v4.0.1": [{ code: "7.3", title: "Access to system components and data is managed via an access control system" }],
    },
  },
  {
    canonicalCode: "OFFBOARDING",
    title: "Access revoked on termination",
    citations: {
      "SOC 2 Type II": [{ code: "CC6.5", title: "Discontinues access when no longer required" }],
      "ISO 27001:2022": [{ code: "A.6.5", title: "Responsibilities after termination" }],
      "HIPAA Security Rule": [{ code: "164.308(a)(3)(ii)(C)", title: "Termination procedures" }],
    },
  },
  {
    canonicalCode: "ENCRYPTION-AT-REST",
    title: "Encryption of data at rest",
    citations: {
      "SOC 2 Type II": [{ code: "CC6.7", title: "Restricts transmission, movement, and removal of information" }],
      "ISO 27001:2022": [{ code: "A.8.24", title: "Use of cryptography" }],
      "HIPAA Security Rule": [{ code: "164.312(a)(2)(iv)", title: "Encryption and decryption" }],
      "PCI-DSS v4.0.1": [{ code: "3.5", title: "Primary account number (PAN) is secured wherever it is stored" }],
      "GDPR": [{ code: "Art. 32", title: "Security of processing" }],
      "ISO 27701:2019": [{ code: "A.7.4.5", title: "PII de-identification and deletion at the end of processing" }],
      "DPDP Act 2023": [{ code: "S.8(4)", title: "Reasonable security safeguards" }],
    },
  },
  {
    canonicalCode: "ENCRYPTION-IN-TRANSIT",
    title: "Encryption of data in transit (TLS)",
    citations: {
      "SOC 2 Type II": [{ code: "CC6.7", title: "Restricts transmission, movement, and removal of information" }],
      "ISO 27001:2022": [{ code: "A.8.24", title: "Use of cryptography" }],
      "HIPAA Security Rule": [
        { code: "164.312(e)(1)", title: "Transmission security" },
        { code: "164.312(e)(2)(ii)", title: "Encryption (transmission)" },
      ],
      "PCI-DSS v4.0.1": [{ code: "4.2", title: "PAN is protected with strong cryptography during transmission" }],
    },
  },
  {
    canonicalCode: "BACKUP",
    title: "Information backup and restoration testing",
    citations: {
      "ISO 27001:2022": [{ code: "A.8.13", title: "Information backup" }],
      "HIPAA Security Rule": [
        { code: "164.308(a)(7)(ii)(A)", title: "Data backup plan" },
        { code: "164.308(a)(7)(ii)(B)", title: "Disaster recovery plan" },
      ],
      "NIST CSF 2.0": [{ code: "RC.RP", title: "Incident Recovery Plan Execution" }],
    },
  },
  {
    canonicalCode: "LOGGING",
    title: "Security event logging and retention",
    citations: {
      "ISO/IEC 42001:2023": [{ code: "A.6.2.8", title: "AI system recording of event logs" }],
      "SOC 2 Type II": [{ code: "CC7.2", title: "Monitors system components for anomalies" }],
      "ISO 27001:2022": [{ code: "A.8.15", title: "Logging" }],
      "HIPAA Security Rule": [{ code: "164.312(b)", title: "Audit controls" }],
      "PCI-DSS v4.0.1": [
        { code: "10.2", title: "Audit logs are implemented to support detection of anomalies and forensic analysis" },
        { code: "10.5", title: "Audit log history is retained and available for analysis" },
      ],
      "NIST CSF 2.0": [{ code: "DE.CM", title: "Continuous Monitoring" }],
    },
  },
  {
    canonicalCode: "MONITORING",
    title: "Continuous security monitoring",
    citations: {
      "ISO/IEC 42001:2023": [{ code: "A.6.2.6", title: "AI system operation and monitoring" }],
      "SOC 2 Type II": [{ code: "CC7.1", title: "Monitors infrastructure and software for anomalies" }],
      "ISO 27001:2022": [{ code: "A.8.16", title: "Monitoring activities" }],
      "PCI-DSS v4.0.1": [{ code: "10.4", title: "Audit logs are reviewed to identify anomalies or suspicious activity" }],
      "NIST CSF 2.0": [{ code: "DE.CM", title: "Continuous Monitoring" }],
    },
  },
  {
    canonicalCode: "INCIDENT-RESPONSE",
    title: "Security incident response",
    citations: {
      "ISO/IEC 42001:2023": [{ code: "A.8.4", title: "Communication of incidents" }],
      "SOC 2 Type II": [
        { code: "CC7.3", title: "Evaluates security events" },
        { code: "CC7.4", title: "Responds to identified security incidents" },
        { code: "CC7.5", title: "Identifies and assesses containment and remediation" },
      ],
      "ISO 27001:2022": [{ code: "A.5.24", title: "Information security incident management planning and preparation" }],
      "HIPAA Security Rule": [
        { code: "164.308(a)(6)(i)", title: "Security incident procedures" },
        { code: "164.308(a)(6)(ii)", title: "Response and reporting" },
      ],
      "PCI-DSS v4.0.1": [{ code: "12.10", title: "Suspected and confirmed security incidents are responded to immediately" }],
      "GDPR": [
        { code: "Art. 33", title: "Notification of a personal data breach to the supervisory authority" },
        { code: "Art. 34", title: "Communication of a personal data breach to the data subject" },
      ],
      "NIST CSF 2.0": [
        { code: "RS.MA", title: "Incident Management" },
        { code: "RS.AN", title: "Incident Analysis" },
        { code: "RS.CO", title: "Incident Response Reporting and Communication" },
      ],
      "DPDP Act 2023": [{ code: "S.8(6)", title: "Breach notification to the Board and affected Data Principals" }],
    },
  },
  {
    canonicalCode: "VULNERABILITY-MGMT",
    title: "Vulnerability management",
    citations: {
      "SOC 2 Type II": [{ code: "CC7.1", title: "Monitors infrastructure and software for anomalies" }],
      "ISO 27001:2022": [{ code: "A.8.8", title: "Management of technical vulnerabilities" }],
      "PCI-DSS v4.0.1": [
        { code: "6.3", title: "Security vulnerabilities are identified and addressed" },
        { code: "11.3", title: "External and internal vulnerabilities are regularly identified, prioritized, and addressed" },
      ],
      "NIST CSF 2.0": [{ code: "ID.RA", title: "Risk Assessment" }],
    },
  },
  {
    canonicalCode: "MALWARE-PROTECTION",
    title: "Malware / anti-virus protection",
    citations: {
      "SOC 2 Type II": [{ code: "CC6.8", title: "Prevents or detects unauthorized or malicious software" }],
      "ISO 27001:2022": [{ code: "A.8.7", title: "Protection against malware" }],
      "HIPAA Security Rule": [{ code: "164.308(a)(5)(ii)(B)", title: "Protection from malicious software" }],
      "PCI-DSS v4.0.1": [
        { code: "5.2", title: "Malicious software is prevented, or detected and addressed" },
        { code: "5.3", title: "Anti-malware mechanisms and processes are active, maintained, and monitored" },
      ],
    },
  },
  {
    canonicalCode: "CHANGE-MGMT",
    title: "Change management",
    citations: {
      "SOC 2 Type II": [{ code: "CC8.1", title: "Authorizes, designs, develops, configures, and tests changes" }],
      "ISO 27001:2022": [{ code: "A.8.32", title: "Change management" }],
      "PCI-DSS v4.0.1": [{ code: "6.5", title: "Changes to all system components are managed securely" }],
    },
  },
  {
    canonicalCode: "SECURE-DEV",
    title: "Secure software development lifecycle",
    citations: {
      "ISO/IEC 42001:2023": [{ code: "A.6.1.3", title: "Processes for responsible AI system design and development" }],
      "ISO 27001:2022": [
        { code: "A.8.25", title: "Secure development lifecycle" },
        { code: "A.8.28", title: "Secure coding" },
      ],
      "PCI-DSS v4.0.1": [
        { code: "6.1", title: "Processes for developing and maintaining secure systems and software" },
        { code: "6.2", title: "Bespoke and custom software are developed securely" },
      ],
    },
  },
  {
    canonicalCode: "SECURITY-TRAINING",
    title: "Security awareness training",
    citations: {
      "ISO/IEC 42001:2023": [{ code: "A.4.6", title: "Human resources (competence for AI)" }],
      "ISO 27001:2022": [{ code: "A.6.3", title: "Information security awareness, education and training" }],
      "HIPAA Security Rule": [
        { code: "164.308(a)(5)(i)", title: "Security awareness and training" },
        { code: "164.308(a)(5)(ii)(A)", title: "Security reminders" },
      ],
      "PCI-DSS v4.0.1": [{ code: "12.6", title: "Security awareness education is an ongoing activity" }],
      "NIST CSF 2.0": [{ code: "PR.AT", title: "Awareness and Training" }],
    },
  },
  {
    canonicalCode: "VENDOR-RISK",
    title: "Third-party / vendor risk management",
    citations: {
      "ISO/IEC 42001:2023": [{ code: "A.10.3", title: "Suppliers" }],
      "SOC 2 Type II": [
        { code: "CC9.1", title: "Identifies and manages risk from business partners" },
        { code: "CC9.2", title: "Manages risk associated with vendors and business partners" },
      ],
      "HIPAA Security Rule": [{ code: "164.308(b)(1)", title: "Business associate contracts and other arrangements" }],
      "PCI-DSS v4.0.1": [
        { code: "12.8", title: "Risk to information assets associated with third-party service provider (TPSP) relationships is managed" },
        { code: "12.9", title: "TPSPs support their customers' PCI DSS compliance" },
      ],
      "GDPR": [{ code: "Art. 28", title: "Processor" }],
      "NIST CSF 2.0": [{ code: "GV.SC", title: "Cybersecurity Supply Chain Risk Management" }],
      "ISO 27701:2019": [{ code: "A.7.2.6", title: "Contracts with PII processors" }],
      "DPDP Act 2023": [{ code: "S.8(2)", title: "Data Processor engagement obligations" }],
    },
  },
  {
    canonicalCode: "RISK-ASSESSMENT",
    title: "Risk assessment and treatment",
    citations: {
      "ISO/IEC 42001:2023": [{ code: "6.1.2", title: "AI risk assessment" }, { code: "6.1.3", title: "AI risk treatment" }],
      "SOC 2 Type II": [{ code: "CC3.2", title: "Identifies and analyzes risk" }],
      "HIPAA Security Rule": [
        { code: "164.308(a)(1)(ii)(A)", title: "Risk analysis" },
        { code: "164.308(a)(1)(ii)(B)", title: "Risk management" },
      ],
      "PCI-DSS v4.0.1": [{ code: "12.3", title: "Risks to the cardholder data environment are formally identified, evaluated, and managed" }],
      "GDPR": [{ code: "Art. 35", title: "Data protection impact assessment" }],
      "NIST CSF 2.0": [
        { code: "ID.RA", title: "Risk Assessment" },
        { code: "GV.RM", title: "Risk Management Strategy" },
      ],
      "ISO 27701:2019": [{ code: "A.7.2.5", title: "Privacy impact assessment" }],
    },
  },
  {
    canonicalCode: "INFOSEC-POLICY",
    title: "Information security policy",
    citations: {
      "ISO 27001:2022": [{ code: "A.5.1", title: "Policies for information security" }],
      "PCI-DSS v4.0.1": [{ code: "12.1", title: "A comprehensive information security policy is established, maintained, and communicated" }],
      "NIST CSF 2.0": [{ code: "GV.PO", title: "Policy" }],
    },
  },
  {
    canonicalCode: "ASSET-INVENTORY",
    title: "Asset inventory and classification",
    citations: {
      "ISO/IEC 42001:2023": [{ code: "A.4.2", title: "Resource documentation" }],
      "ISO 27001:2022": [{ code: "A.5.9", title: "Inventory of information and other associated assets" }],
      "PCI-DSS v4.0.1": [{ code: "12.5", title: "PCI DSS scope is documented and validated" }],
      "NIST CSF 2.0": [{ code: "ID.AM", title: "Asset Management" }],
    },
  },
  {
    canonicalCode: "DATA-BREACH-NOTIFICATION",
    title: "Personal-data breach notification",
    citations: {
      "GDPR": [
        { code: "Art. 33", title: "Notification of a personal data breach to the supervisory authority" },
        { code: "Art. 34", title: "Communication of a personal data breach to the data subject" },
      ],
      "HIPAA Security Rule": [{ code: "164.308(a)(6)(ii)", title: "Response and reporting" }],
      "ISO 27701:2019": [{ code: "A.7.3.8", title: "Notification of PII breaches" }],
      "DPDP Act 2023": [{ code: "S.8(6)", title: "Breach notification to the Board and affected Data Principals" }],
    },
  },
  // ─── Privacy-specific cross-framework concepts ─────────────
  {
    canonicalCode: "CONSENT-MGMT",
    title: "Consent management and lawful basis for processing",
    citations: {
      "GDPR": [
        { code: "Art. 6", title: "Lawfulness of processing (legal basis)" },
        { code: "Art. 7", title: "Conditions for consent" },
      ],
      "ISO 27701:2019": [
        { code: "A.7.2.3", title: "Determining new or changed purposes" },
        { code: "A.7.2.4", title: "Obtaining consent" },
      ],
      "DPDP Act 2023": [
        { code: "S.6", title: "Consent of Data Principal" },
        { code: "S.6(4)", title: "Withdrawal of consent" },
      ],
    },
  },
  {
    canonicalCode: "DATA-SUBJECT-RIGHTS",
    title: "Data subject / Data Principal rights management",
    citations: {
      "GDPR": [
        { code: "Art. 15", title: "Right of access by the data subject" },
        { code: "Art. 16", title: "Right to rectification" },
        { code: "Art. 17", title: "Right to erasure ('right to be forgotten')" },
        { code: "Art. 20", title: "Right to data portability" },
      ],
      "ISO 27701:2019": [
        { code: "A.7.3.2", title: "Determining information for PII principals" },
        { code: "A.7.3.5", title: "Providing mechanism for modification/withdrawal of consent" },
        { code: "A.7.3.6", title: "Access, correction, erasure" },
      ],
      "DPDP Act 2023": [
        { code: "S.11", title: "Right to access information about personal data" },
        { code: "S.12", title: "Right to correction and erasure of personal data" },
        { code: "S.13", title: "Right to grievance redressal" },
        { code: "S.14", title: "Right to nominate" },
      ],
    },
  },
  {
    canonicalCode: "PRIVACY-NOTICE",
    title: "Privacy notice and transparency",
    citations: {
      "GDPR": [
        { code: "Art. 13", title: "Information to be provided when personal data is collected from the data subject" },
        { code: "Art. 14", title: "Information to be provided when data has not been obtained from the data subject" },
      ],
      "ISO 27701:2019": [{ code: "A.7.3.2", title: "Determining information for PII principals" }],
      "DPDP Act 2023": [{ code: "S.5", title: "Notice to Data Principal" }],
    },
  },
  {
    canonicalCode: "DATA-MINIMIZATION",
    title: "Data minimization and purpose limitation",
    citations: {
      "GDPR": [
        { code: "Art. 5(1)(b)", title: "Purpose limitation" },
        { code: "Art. 5(1)(c)", title: "Data minimisation" },
      ],
      "ISO 27701:2019": [{ code: "A.7.4.2", title: "Limit processing" }],
      "DPDP Act 2023": [{ code: "S.4(2)", title: "Purpose limitation for personal data" }],
    },
  },
  {
    canonicalCode: "CROSS-BORDER-TRANSFER",
    title: "Cross-border data transfers",
    citations: {
      "GDPR": [
        { code: "Art. 44", title: "General principle for transfers" },
        { code: "Art. 46", title: "Transfers subject to appropriate safeguards" },
      ],
      "ISO 27701:2019": [{ code: "A.7.5.2", title: "Identify basis for PII transfer between jurisdictions" }],
      "DPDP Act 2023": [{ code: "S.16", title: "Transfer of personal data outside India" }],
    },
  },
  {
    canonicalCode: "CHILDREN-DATA",
    title: "Children's data protection",
    citations: {
      "GDPR": [{ code: "Art. 8", title: "Conditions applicable to child's consent" }],
      "DPDP Act 2023": [{ code: "S.9", title: "Processing of children's personal data" }],
    },
  },
  {
    canonicalCode: "DPO-APPOINTMENT",
    title: "Data protection officer / privacy governance",
    citations: {
      "GDPR": [{ code: "Art. 37", title: "Designation of the data protection officer" }],
      "ISO 27701:2019": [{ code: "A.7.2.1", title: "Identify and document purpose" }],
      "DPDP Act 2023": [{ code: "S.10(2)", title: "Appointment of Data Protection Officer" }],
    },
  },
  {
    canonicalCode: "PROCESSING-RECORDS",
    title: "Records of processing activities",
    citations: {
      "GDPR": [{ code: "Art. 30", title: "Records of processing activities" }],
      "ISO 27701:2019": [{ code: "A.7.2.8", title: "Records related to processing PII" }],
    },
  },
  // ── ISO/IEC 42001:2023: AI management system ──
  {
    canonicalCode: "AIMS-CONTEXT",
    title: "AI management system scope and context",
    citations: {
      "ISO/IEC 42001:2023": [
        { code: "4.1", title: "Understanding the organization and its context" },
        { code: "4.3", title: "Determining the scope of the AI management system" },
      ],
    },
  },
  {
    canonicalCode: "AI-POLICY",
    title: "AI policy approved and reviewed",
    citations: {
      "ISO/IEC 42001:2023": [
        { code: "5.2", title: "AI policy" },
        { code: "A.2.2", title: "AI policy" },
        { code: "A.2.3", title: "Alignment with other organizational policies" },
        { code: "A.2.4", title: "Review of the AI policy" },
      ],
    },
  },
  {
    canonicalCode: "AI-ROLES",
    title: "AI roles, responsibilities and reporting of concerns",
    citations: {
      "ISO/IEC 42001:2023": [
        { code: "A.3.2", title: "AI roles and responsibilities" },
        { code: "A.3.3", title: "Reporting of concerns" },
      ],
    },
  },
  {
    canonicalCode: "AI-RESOURCES",
    title: "AI data, tooling and computing resources documented",
    citations: {
      "ISO/IEC 42001:2023": [
        { code: "A.4.3", title: "Data resources" },
        { code: "A.4.4", title: "Tooling resources" },
        { code: "A.4.5", title: "System and computing resources" },
      ],
    },
  },
  {
    canonicalCode: "AI-IMPACT-ASSESSMENT",
    title: "AI system impact assessments",
    citations: {
      "ISO/IEC 42001:2023": [
        { code: "6.1.4", title: "AI system impact assessment" },
        { code: "A.5.2", title: "AI system impact assessment process" },
        { code: "A.5.3", title: "Documentation of AI system impact assessments" },
        { code: "A.5.4", title: "Assessing AI system impact on individuals or groups of individuals" },
        { code: "A.5.5", title: "Assessing societal impacts of AI systems" },
      ],
    },
  },
  {
    canonicalCode: "AI-DESIGN",
    title: "Responsible AI objectives, requirements and design records",
    citations: {
      "ISO/IEC 42001:2023": [
        { code: "A.6.1.2", title: "Objectives for responsible development of AI system" },
        { code: "A.6.2.2", title: "AI system requirements and specification" },
        { code: "A.6.2.3", title: "Documentation of AI system design and development" },
      ],
    },
  },
  {
    canonicalCode: "AI-VALIDATION",
    title: "AI system verification and validation before release",
    citations: {
      "ISO/IEC 42001:2023": [
        { code: "A.6.2.4", title: "AI system verification and validation" },
      ],
    },
  },
  {
    canonicalCode: "AI-DEPLOYMENT",
    title: "Controlled AI system deployment",
    citations: {
      "ISO/IEC 42001:2023": [
        { code: "A.6.2.5", title: "AI system deployment" },
      ],
    },
  },
  {
    canonicalCode: "AI-DOCUMENTATION",
    title: "AI system technical and user documentation",
    citations: {
      "ISO/IEC 42001:2023": [
        { code: "A.6.2.7", title: "AI system technical documentation" },
        { code: "A.8.2", title: "System documentation and information for users" },
      ],
    },
  },
  {
    canonicalCode: "AI-DATA-QUALITY",
    title: "AI training and input data quality and provenance",
    citations: {
      "ISO/IEC 42001:2023": [
        { code: "A.7.2", title: "Data for development and enhancement of AI system" },
        { code: "A.7.3", title: "Acquisition of data" },
        { code: "A.7.4", title: "Quality of data for AI systems" },
        { code: "A.7.5", title: "Data provenance" },
        { code: "A.7.6", title: "Data preparation" },
      ],
    },
  },
  {
    canonicalCode: "AI-TRANSPARENCY",
    title: "Information for interested parties about AI systems",
    citations: {
      "ISO/IEC 42001:2023": [
        { code: "A.8.3", title: "External reporting" },
        { code: "A.8.5", title: "Information for interested parties" },
      ],
    },
  },
  {
    canonicalCode: "AI-RESPONSIBLE-USE",
    title: "Responsible and intended use of AI systems",
    citations: {
      "ISO/IEC 42001:2023": [
        { code: "A.9.2", title: "Processes for responsible use of AI systems" },
        { code: "A.9.3", title: "Objectives for responsible use of AI system" },
        { code: "A.9.4", title: "Intended use of the AI system" },
      ],
    },
  },
  {
    canonicalCode: "AI-THIRD-PARTY",
    title: "AI responsibilities with third parties and customers",
    citations: {
      "ISO/IEC 42001:2023": [
        { code: "A.10.2", title: "Allocating responsibilities" },
        { code: "A.10.4", title: "Customers" },
      ],
    },
  },
  {
    canonicalCode: "AIMS-REVIEW",
    title: "AI management system internal audit and management review",
    citations: {
      "ISO/IEC 42001:2023": [
        { code: "9.2", title: "Internal audit" },
        { code: "9.3", title: "Management review" },
        { code: "10.2", title: "Nonconformity and corrective action" },
      ],
    },
  },
];
