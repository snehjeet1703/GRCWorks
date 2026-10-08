import { PrismaClient, UserRole } from "@prisma/client";
import { hash } from "bcryptjs";
import { CONTROL_MAPPINGS, FrameworkName } from "./control-mappings";
import { BUILT_IN_ROLES } from "../src/lib/permissions";
import { TRUST_CONTROL_SUGGESTIONS } from "../src/lib/trust-controls";

const prisma = new PrismaClient();

// ── Frameworks ───────────────────────────────────────────────
// Full per-framework citation lists. Any code that also appears in CONTROL_MAPPINGS
// resolves to the shared underlying control (one implementation, N citations).

type Ctrl = { code: string; title: string };

const SOC2_CONTROLS: Ctrl[] = [
  { code: "CC1.1", title: "COSO principle 1: Demonstrates commitment to integrity and ethical values" },
  { code: "CC1.2", title: "COSO principle 2: Board exercises oversight responsibility" },
  { code: "CC1.3", title: "COSO principle 3: Establishes structure, authority, and responsibility" },
  { code: "CC1.4", title: "COSO principle 4: Demonstrates commitment to competence" },
  { code: "CC1.5", title: "COSO principle 5: Enforces accountability" },
  { code: "CC2.1", title: "Obtains or generates relevant, quality information" },
  { code: "CC2.2", title: "Internally communicates information" },
  { code: "CC2.3", title: "Communicates with external parties" },
  { code: "CC3.1", title: "Specifies suitable objectives" },
  { code: "CC3.2", title: "Identifies and analyzes risk" },
  { code: "CC3.3", title: "Considers the potential for fraud" },
  { code: "CC3.4", title: "Identifies and assesses changes" },
  { code: "CC4.1", title: "Selects, develops, and performs ongoing/separate evaluations" },
  { code: "CC4.2", title: "Evaluates and communicates deficiencies" },
  { code: "CC5.1", title: "Selects and develops control activities" },
  { code: "CC5.2", title: "Selects and develops general controls over technology" },
  { code: "CC5.3", title: "Deploys through policies and procedures" },
  { code: "CC6.1", title: "Logical and physical access controls" },
  { code: "CC6.2", title: "Prior to issuing system credentials and granting access" },
  { code: "CC6.3", title: "Role-based access and least privilege" },
  { code: "CC6.4", title: "Restricts physical access" },
  { code: "CC6.5", title: "Discontinues access when no longer required" },
  { code: "CC6.6", title: "Manages access from outside the boundaries" },
  { code: "CC6.7", title: "Restricts transmission, movement, and removal of information" },
  { code: "CC6.8", title: "Prevents or detects unauthorized or malicious software" },
  { code: "CC7.1", title: "Monitors infrastructure and software for anomalies" },
  { code: "CC7.2", title: "Monitors system components for anomalies" },
  { code: "CC7.3", title: "Evaluates security events" },
  { code: "CC7.4", title: "Responds to identified security incidents" },
  { code: "CC7.5", title: "Identifies and assesses containment and remediation" },
  { code: "CC8.1", title: "Authorizes, designs, develops, configures, and tests changes" },
  { code: "CC9.1", title: "Identifies and manages risk from business partners" },
  { code: "CC9.2", title: "Manages risk associated with vendors and business partners" },
];

const ISO27001_CONTROLS: Ctrl[] = [
  { code: "A.5.1", title: "Policies for information security" },
  { code: "A.5.2", title: "Information security roles and responsibilities" },
  { code: "A.5.3", title: "Segregation of duties" },
  { code: "A.5.4", title: "Management responsibilities" },
  { code: "A.5.5", title: "Contact with authorities" },
  { code: "A.5.6", title: "Contact with special interest groups" },
  { code: "A.5.7", title: "Threat intelligence" },
  { code: "A.5.8", title: "Information security in project management" },
  { code: "A.5.9", title: "Inventory of information and other associated assets" },
  { code: "A.5.18", title: "Access rights" },
  { code: "A.5.24", title: "Information security incident management planning and preparation" },
  { code: "A.6.1", title: "Screening" },
  { code: "A.6.2", title: "Terms and conditions of employment" },
  { code: "A.6.3", title: "Information security awareness, education and training" },
  { code: "A.6.4", title: "Disciplinary process" },
  { code: "A.6.5", title: "Responsibilities after termination" },
  { code: "A.7.1", title: "Physical security perimeters" },
  { code: "A.7.2", title: "Physical entry" },
  { code: "A.7.3", title: "Securing offices, rooms and facilities" },
  { code: "A.7.4", title: "Physical security monitoring" },
  { code: "A.8.1", title: "User endpoint devices" },
  { code: "A.8.2", title: "Privileged access rights" },
  { code: "A.8.3", title: "Information access restriction" },
  { code: "A.8.4", title: "Access to source code" },
  { code: "A.8.5", title: "Secure authentication" },
  { code: "A.8.6", title: "Capacity management" },
  { code: "A.8.7", title: "Protection against malware" },
  { code: "A.8.8", title: "Management of technical vulnerabilities" },
  { code: "A.8.9", title: "Configuration management" },
  { code: "A.8.10", title: "Information deletion" },
  { code: "A.8.11", title: "Data masking" },
  { code: "A.8.12", title: "Data leakage prevention" },
  { code: "A.8.13", title: "Information backup" },
  { code: "A.8.14", title: "Redundancy of information processing facilities" },
  { code: "A.8.15", title: "Logging" },
  { code: "A.8.16", title: "Monitoring activities" },
  { code: "A.8.17", title: "Clock synchronization" },
  { code: "A.8.18", title: "Use of privileged utility programs" },
  { code: "A.8.19", title: "Installation of software on operational systems" },
  { code: "A.8.20", title: "Network security" },
  { code: "A.8.21", title: "Security of network services" },
  { code: "A.8.22", title: "Segregation of networks" },
  { code: "A.8.23", title: "Web filtering" },
  { code: "A.8.24", title: "Use of cryptography" },
  { code: "A.8.25", title: "Secure development lifecycle" },
  { code: "A.8.26", title: "Application security requirements" },
  { code: "A.8.27", title: "Secure system architecture and engineering principles" },
  { code: "A.8.28", title: "Secure coding" },
  { code: "A.8.32", title: "Change management" },
];

const HIPAA_CONTROLS: Ctrl[] = [
  { code: "164.308(a)(1)(i)", title: "Security management process" },
  { code: "164.308(a)(1)(ii)(A)", title: "Risk analysis" },
  { code: "164.308(a)(1)(ii)(B)", title: "Risk management" },
  { code: "164.308(a)(1)(ii)(C)", title: "Sanction policy" },
  { code: "164.308(a)(1)(ii)(D)", title: "Information system activity review" },
  { code: "164.308(a)(2)", title: "Assigned security responsibility" },
  { code: "164.308(a)(3)(i)", title: "Workforce security" },
  { code: "164.308(a)(3)(ii)(A)", title: "Authorization and/or supervision" },
  { code: "164.308(a)(3)(ii)(B)", title: "Workforce clearance procedure" },
  { code: "164.308(a)(3)(ii)(C)", title: "Termination procedures" },
  { code: "164.308(a)(4)(i)", title: "Information access management" },
  { code: "164.308(a)(4)(ii)(B)", title: "Access authorization" },
  { code: "164.308(a)(4)(ii)(C)", title: "Access establishment and modification" },
  { code: "164.308(a)(5)(i)", title: "Security awareness and training" },
  { code: "164.308(a)(5)(ii)(A)", title: "Security reminders" },
  { code: "164.308(a)(5)(ii)(B)", title: "Protection from malicious software" },
  { code: "164.308(a)(5)(ii)(C)", title: "Log-in monitoring" },
  { code: "164.308(a)(5)(ii)(D)", title: "Password management" },
  { code: "164.308(a)(6)(i)", title: "Security incident procedures" },
  { code: "164.308(a)(6)(ii)", title: "Response and reporting" },
  { code: "164.308(a)(7)(i)", title: "Contingency plan" },
  { code: "164.308(a)(7)(ii)(A)", title: "Data backup plan" },
  { code: "164.308(a)(7)(ii)(B)", title: "Disaster recovery plan" },
  { code: "164.308(a)(7)(ii)(C)", title: "Emergency mode operation plan" },
  { code: "164.308(a)(7)(ii)(D)", title: "Testing and revision procedures" },
  { code: "164.308(a)(8)", title: "Evaluation" },
  { code: "164.308(b)(1)", title: "Business associate contracts and other arrangements" },
  { code: "164.310(a)(1)", title: "Facility access controls" },
  { code: "164.310(a)(2)(ii)", title: "Facility security plan" },
  { code: "164.310(a)(2)(iii)", title: "Access control and validation procedures" },
  { code: "164.310(b)", title: "Workstation use" },
  { code: "164.310(c)", title: "Workstation security" },
  { code: "164.310(d)(1)", title: "Device and media controls" },
  { code: "164.310(d)(2)(i)", title: "Disposal" },
  { code: "164.310(d)(2)(ii)", title: "Media re-use" },
  { code: "164.312(a)(1)", title: "Access control" },
  { code: "164.312(a)(2)(i)", title: "Unique user identification" },
  { code: "164.312(a)(2)(ii)", title: "Emergency access procedure" },
  { code: "164.312(a)(2)(iii)", title: "Automatic logoff" },
  { code: "164.312(a)(2)(iv)", title: "Encryption and decryption" },
  { code: "164.312(b)", title: "Audit controls" },
  { code: "164.312(c)(1)", title: "Integrity" },
  { code: "164.312(d)", title: "Person or entity authentication" },
  { code: "164.312(e)(1)", title: "Transmission security" },
  { code: "164.312(e)(2)(i)", title: "Integrity controls (transmission)" },
  { code: "164.312(e)(2)(ii)", title: "Encryption (transmission)" },
];

const PCI_DSS_CONTROLS: Ctrl[] = [
  { code: "1.1", title: "Processes and mechanisms for installing and maintaining network security controls" },
  { code: "1.2", title: "Network security controls are configured and maintained" },
  { code: "1.3", title: "Network access to and from the cardholder data environment is restricted" },
  { code: "1.4", title: "Network connections between trusted and untrusted networks are controlled" },
  { code: "2.1", title: "Processes for applying secure configurations to system components" },
  { code: "2.2", title: "System components are configured and managed securely" },
  { code: "2.3", title: "Wireless environments are configured and managed securely" },
  { code: "3.1", title: "Processes for protecting stored account data" },
  { code: "3.2", title: "Storage of account data is kept to a minimum" },
  { code: "3.3", title: "Sensitive authentication data is not stored after authorization" },
  { code: "3.4", title: "Access to displays of full PAN and ability to copy cardholder data are restricted" },
  { code: "3.5", title: "Primary account number (PAN) is secured wherever it is stored" },
  { code: "3.6", title: "Cryptographic keys used to protect stored account data are secured" },
  { code: "3.7", title: "Key management processes and procedures for cryptographic keys are defined" },
  { code: "4.1", title: "Processes for protecting cardholder data with strong cryptography during transmission" },
  { code: "4.2", title: "PAN is protected with strong cryptography during transmission" },
  { code: "5.1", title: "Processes for protecting systems and networks from malicious software" },
  { code: "5.2", title: "Malicious software is prevented, or detected and addressed" },
  { code: "5.3", title: "Anti-malware mechanisms and processes are active, maintained, and monitored" },
  { code: "5.4", title: "Anti-phishing mechanisms protect users against phishing attacks" },
  { code: "6.1", title: "Processes for developing and maintaining secure systems and software" },
  { code: "6.2", title: "Bespoke and custom software are developed securely" },
  { code: "6.3", title: "Security vulnerabilities are identified and addressed" },
  { code: "6.4", title: "Public-facing web applications are protected against attacks" },
  { code: "6.5", title: "Changes to all system components are managed securely" },
  { code: "7.1", title: "Processes for restricting access to system components and cardholder data" },
  { code: "7.2", title: "Access to system components and data is appropriately defined and assigned" },
  { code: "7.3", title: "Access to system components and data is managed via an access control system" },
  { code: "8.1", title: "Processes for identifying users and authenticating access" },
  { code: "8.2", title: "User identification and related accounts are strictly managed" },
  { code: "8.3", title: "Strong authentication for users and administrators is established and managed" },
  { code: "8.4", title: "Multi-factor authentication (MFA) is implemented to secure access" },
  { code: "8.5", title: "MFA systems are configured to prevent misuse" },
  { code: "8.6", title: "Use of application and system accounts and associated authentication factors is managed" },
  { code: "9.1", title: "Processes for restricting physical access to cardholder data" },
  { code: "9.2", title: "Physical access controls manage entry into facilities and systems containing cardholder data" },
  { code: "9.3", title: "Physical access for personnel and visitors is authorized and managed" },
  { code: "9.4", title: "Media with cardholder data is securely stored, accessed, distributed, and destroyed" },
  { code: "9.5", title: "Point of interaction (POI) devices are protected from tampering and unauthorized substitution" },
  { code: "10.1", title: "Processes for logging and monitoring all access to system components and cardholder data" },
  { code: "10.2", title: "Audit logs are implemented to support detection of anomalies and forensic analysis" },
  { code: "10.3", title: "Audit logs are protected from destruction and unauthorized modifications" },
  { code: "10.4", title: "Audit logs are reviewed to identify anomalies or suspicious activity" },
  { code: "10.5", title: "Audit log history is retained and available for analysis" },
  { code: "10.6", title: "Time-synchronization mechanisms support consistent time settings across all systems" },
  { code: "10.7", title: "Failures of critical security control systems are detected, reported, and responded to promptly" },
  { code: "11.1", title: "Processes for regularly testing security of systems and networks" },
  { code: "11.2", title: "Wireless access points are identified and monitored, unauthorized wireless access points are addressed" },
  { code: "11.3", title: "External and internal vulnerabilities are regularly identified, prioritized, and addressed" },
  { code: "11.4", title: "External and internal penetration testing is regularly performed" },
  { code: "11.5", title: "Network intrusions and unexpected file changes are detected and responded to" },
  { code: "11.6", title: "Unauthorized changes on payment pages are detected and responded to" },
  { code: "12.1", title: "A comprehensive information security policy is established, maintained, and communicated" },
  { code: "12.2", title: "Acceptable use policies for end-user technologies are defined and implemented" },
  { code: "12.3", title: "Risks to the cardholder data environment are formally identified, evaluated, and managed" },
  { code: "12.4", title: "PCI DSS compliance is managed" },
  { code: "12.5", title: "PCI DSS scope is documented and validated" },
  { code: "12.6", title: "Security awareness education is an ongoing activity" },
  { code: "12.7", title: "Personnel are screened to reduce risks from insider threats" },
  { code: "12.8", title: "Risk to information assets associated with third-party service provider (TPSP) relationships is managed" },
  { code: "12.9", title: "TPSPs support their customers' PCI DSS compliance" },
  { code: "12.10", title: "Suspected and confirmed security incidents that could impact the cardholder data environment are responded to immediately" },
];

const GDPR_CONTROLS: Ctrl[] = [
  { code: "Art. 5(1)(a)", title: "Lawfulness, fairness and transparency" },
  { code: "Art. 5(1)(b)", title: "Purpose limitation" },
  { code: "Art. 5(1)(c)", title: "Data minimisation" },
  { code: "Art. 5(1)(d)", title: "Accuracy" },
  { code: "Art. 5(1)(e)", title: "Storage limitation" },
  { code: "Art. 5(1)(f)", title: "Integrity and confidentiality (security)" },
  { code: "Art. 5(2)", title: "Accountability" },
  { code: "Art. 6", title: "Lawfulness of processing (legal basis)" },
  { code: "Art. 7", title: "Conditions for consent" },
  { code: "Art. 9", title: "Processing of special categories of personal data" },
  { code: "Art. 13", title: "Information to be provided when personal data is collected from the data subject" },
  { code: "Art. 14", title: "Information to be provided when personal data has not been obtained from the data subject" },
  { code: "Art. 15", title: "Right of access by the data subject" },
  { code: "Art. 16", title: "Right to rectification" },
  { code: "Art. 17", title: "Right to erasure ('right to be forgotten')" },
  { code: "Art. 18", title: "Right to restriction of processing" },
  { code: "Art. 20", title: "Right to data portability" },
  { code: "Art. 21", title: "Right to object" },
  { code: "Art. 22", title: "Automated individual decision-making, including profiling" },
  { code: "Art. 24", title: "Responsibility of the controller" },
  { code: "Art. 25", title: "Data protection by design and by default" },
  { code: "Art. 26", title: "Joint controllers" },
  { code: "Art. 28", title: "Processor" },
  { code: "Art. 30", title: "Records of processing activities" },
  { code: "Art. 32", title: "Security of processing" },
  { code: "Art. 33", title: "Notification of a personal data breach to the supervisory authority" },
  { code: "Art. 34", title: "Communication of a personal data breach to the data subject" },
  { code: "Art. 35", title: "Data protection impact assessment" },
  { code: "Art. 37", title: "Designation of the data protection officer" },
  { code: "Art. 44", title: "General principle for transfers" },
  { code: "Art. 46", title: "Transfers subject to appropriate safeguards" },
];

const ISO27701_CONTROLS: Ctrl[] = [
  { code: "A.7.2.1", title: "Identify and document purpose" },
  { code: "A.7.2.2", title: "Identify lawful basis" },
  { code: "A.7.2.3", title: "Determining new or changed purposes" },
  { code: "A.7.2.4", title: "Obtaining consent" },
  { code: "A.7.2.5", title: "Privacy impact assessment" },
  { code: "A.7.2.6", title: "Contracts with PII processors" },
  { code: "A.7.2.7", title: "Joint PII controller" },
  { code: "A.7.2.8", title: "Records related to processing PII" },
  { code: "A.7.3.1", title: "Providing notice to PII principals" },
  { code: "A.7.3.2", title: "Determining information for PII principals" },
  { code: "A.7.3.3", title: "PII principals access" },
  { code: "A.7.3.4", title: "Mechanism for requests regarding PII processing" },
  { code: "A.7.3.5", title: "Providing mechanism for modification/withdrawal of consent" },
  { code: "A.7.3.6", title: "Access, correction, erasure" },
  { code: "A.7.3.7", title: "PII controllers obligations to inform third parties" },
  { code: "A.7.3.8", title: "Notification of PII breaches" },
  { code: "A.7.3.9", title: "PII protection in automated decision making" },
  { code: "A.7.3.10", title: "PII collection limitation" },
  { code: "A.7.4.1", title: "Limit collection" },
  { code: "A.7.4.2", title: "Limit processing" },
  { code: "A.7.4.3", title: "Accuracy and quality" },
  { code: "A.7.4.4", title: "PII minimization objectives" },
  { code: "A.7.4.5", title: "PII de-identification and deletion at the end of processing" },
  { code: "A.7.4.6", title: "Temporary files" },
  { code: "A.7.4.7", title: "Retention" },
  { code: "A.7.4.8", title: "Disposal" },
  { code: "A.7.4.9", title: "PII transmission controls" },
  { code: "A.7.5.1", title: "Identify basis for PII transfer" },
  { code: "A.7.5.2", title: "Identify basis for PII transfer between jurisdictions" },
  { code: "A.7.5.3", title: "Records of PII transfer" },
  { code: "A.7.5.4", title: "Records of PII disclosure to third parties" },
];

const DPDP_CONTROLS: Ctrl[] = [
  { code: "S.4(1)", title: "Processing for lawful purpose with consent" },
  { code: "S.4(2)", title: "Purpose limitation for personal data" },
  { code: "S.5", title: "Notice to Data Principal" },
  { code: "S.6", title: "Consent of Data Principal" },
  { code: "S.6(4)", title: "Withdrawal of consent" },
  { code: "S.6(6)", title: "Consent Manager requirements" },
  { code: "S.7", title: "Certain legitimate uses" },
  { code: "S.8(1)", title: "General obligations of Data Fiduciary" },
  { code: "S.8(2)", title: "Data Processor engagement obligations" },
  { code: "S.8(3)", title: "Completeness and accuracy of data" },
  { code: "S.8(4)", title: "Reasonable security safeguards" },
  { code: "S.8(5)", title: "Data retention limitation" },
  { code: "S.8(6)", title: "Breach notification to the Board and affected Data Principals" },
  { code: "S.8(7)", title: "Erasure on withdrawal of consent or specified purpose" },
  { code: "S.8(8)", title: "Grievance redressal mechanism" },
  { code: "S.9", title: "Processing of children's personal data" },
  { code: "S.10(1)", title: "Additional obligations of Significant Data Fiduciary" },
  { code: "S.10(2)", title: "Appointment of Data Protection Officer" },
  { code: "S.10(3)", title: "Data Protection Impact Assessment" },
  { code: "S.10(4)", title: "Periodic audit by independent data auditor" },
  { code: "S.11", title: "Right to access information about personal data" },
  { code: "S.12", title: "Right to correction and erasure of personal data" },
  { code: "S.13", title: "Right to grievance redressal" },
  { code: "S.14", title: "Right to nominate" },
  { code: "S.16", title: "Transfer of personal data outside India" },
  { code: "S.17(1)", title: "Exemptions for State instrumentalities" },
];

const NIST_CSF_CONTROLS: Ctrl[] = [
  { code: "GV.OC", title: "Organizational Context" },
  { code: "GV.RM", title: "Risk Management Strategy" },
  { code: "GV.RR", title: "Roles, Responsibilities, and Authorities" },
  { code: "GV.PO", title: "Policy" },
  { code: "GV.OV", title: "Oversight" },
  { code: "GV.SC", title: "Cybersecurity Supply Chain Risk Management" },
  { code: "ID.AM", title: "Asset Management" },
  { code: "ID.RA", title: "Risk Assessment" },
  { code: "ID.IM", title: "Improvement" },
  { code: "PR.AA", title: "Identity Management, Authentication, and Access Control" },
  { code: "PR.AT", title: "Awareness and Training" },
  { code: "PR.DS", title: "Data Security" },
  { code: "PR.PS", title: "Platform Security" },
  { code: "PR.IR", title: "Technology Infrastructure Resilience" },
  { code: "DE.CM", title: "Continuous Monitoring" },
  { code: "DE.AE", title: "Adverse Event Analysis" },
  { code: "RS.MA", title: "Incident Management" },
  { code: "RS.AN", title: "Incident Analysis" },
  { code: "RS.CO", title: "Incident Response Reporting and Communication" },
  { code: "RS.MI", title: "Incident Mitigation" },
  { code: "RC.RP", title: "Incident Recovery Plan Execution" },
  { code: "RC.CO", title: "Incident Recovery Communication" },
];

const FRAMEWORKS: {
  name: FrameworkName;
  version: string;
  description: string;
  controls: Ctrl[];
}[] = [
  {
    name: "SOC 2 Type II",
    version: "2017",
    description: "AICPA Trust Services Criteria for Security, Availability, Processing Integrity, Confidentiality, and Privacy.",
    controls: SOC2_CONTROLS,
  },
  {
    name: "ISO 27001:2022",
    version: "2022",
    description: "Information security management systems — Requirements (Annex A controls).",
    controls: ISO27001_CONTROLS,
  },
  {
    name: "HIPAA Security Rule",
    version: "45 CFR §164.308-.312",
    description: "US health-data security safeguards: administrative, physical, and technical (Security Rule under HIPAA).",
    controls: HIPAA_CONTROLS,
  },
  {
    name: "PCI-DSS v4.0.1",
    version: "4.0.1",
    description: "Payment Card Industry Data Security Standard, twelve top-level requirements.",
    controls: PCI_DSS_CONTROLS,
  },
  {
    name: "GDPR",
    version: "2016/679",
    description: "EU General Data Protection Regulation — operationally-relevant articles for a security program.",
    controls: GDPR_CONTROLS,
  },
  {
    name: "NIST CSF 2.0",
    version: "2.0",
    description: "NIST Cybersecurity Framework 2.0 — 22 categories across Govern, Identify, Protect, Detect, Respond, Recover.",
    controls: NIST_CSF_CONTROLS,
  },
  {
    name: "ISO 27701:2019",
    version: "2019",
    description: "Privacy information management — extension to ISO 27001/ISO 27002 for PII controllers and processors.",
    controls: ISO27701_CONTROLS,
  },
  {
    name: "DPDP Act 2023",
    version: "2023",
    description: "India's Digital Personal Data Protection Act — obligations for Data Fiduciaries and rights of Data Principals.",
    controls: DPDP_CONTROLS,
  },
];

const SAMPLE_RISKS = [
  { title: "Data breach via unauthorized access", category: "Security", likelihood: 3, impact: 5 },
  { title: "Service outage exceeding SLA", category: "Availability", likelihood: 2, impact: 4 },
  { title: "Employee credential compromise", category: "Security", likelihood: 4, impact: 4 },
  { title: "Third-party vendor data exposure", category: "Vendor", likelihood: 2, impact: 3 },
  { title: "Non-compliance with data retention laws", category: "Compliance", likelihood: 2, impact: 5 },
];

const SAMPLE_POLICIES: {
  title: string;
  status: "APPROVED" | "IN_REVIEW" | "DRAFT";
}[] = [
  { title: "Information Security Policy", status: "APPROVED" },
  { title: "Acceptable Use Policy", status: "APPROVED" },
  { title: "Access Control Policy", status: "DRAFT" },
  { title: "Incident Response Plan", status: "IN_REVIEW" },
  { title: "Data Classification Policy", status: "DRAFT" },
  { title: "Business Continuity Plan", status: "DRAFT" },
];

const SAMPLE_SUBPROCESSORS = [
  { name: "Amazon Web Services", purpose: "Cloud hosting and storage", location: "India", website: "https://aws.amazon.com" },
  { name: "Cloudflare", purpose: "CDN and DDoS protection", location: "United States", website: "https://www.cloudflare.com" },
  { name: "SendGrid", purpose: "Transactional email", location: "United States", website: "https://sendgrid.com" },
  { name: "Google Workspace", purpose: "Internal collaboration", location: "United States", website: "https://workspace.google.com" },
  { name: "Atlassian", purpose: "Issue tracking and support", location: "Australia", website: "https://www.atlassian.com" },
  { name: "Datadog", purpose: "Infrastructure monitoring", location: "United States", website: "https://www.datadoghq.com" },
  { name: "Stripe", purpose: "Payment processing", location: "Ireland", website: "https://stripe.com" },
];

// Demo-only: real orgs load suggestions disabled from the admin UI and opt in per control.
async function seedTrustVault(organizationId: string) {
  const config =
    (await prisma.trustVaultConfig.findUnique({ where: { organizationId } })) ??
    (await prisma.trustVaultConfig.create({
      data: {
        organizationId,
        enabled: true,
        heroTitle: "Demo Organization",
        heroDescription:
          "We are committed to the highest standards of security, privacy, and compliance. Our platform undergoes rigorous testing and certification to ensure your data is protected.",
      },
    }));

  let controls = 0;
  if ((await prisma.trustControl.count({ where: { configId: config.id } })) === 0) {
    const rows = TRUST_CONTROL_SUGGESTIONS.flatMap(({ category, items }, ci) =>
      items.map((name, i) => ({ configId: config.id, category, name, enabled: true, sortOrder: ci * 100 + i }))
    );
    controls = (await prisma.trustControl.createMany({ data: rows })).count;
  }

  let subprocessors = 0;
  if ((await prisma.trustSubprocessor.count({ where: { configId: config.id } })) === 0) {
    subprocessors = (
      await prisma.trustSubprocessor.createMany({
        data: SAMPLE_SUBPROCESSORS.map((s, i) => ({ ...s, configId: config.id, sortOrder: i })),
      })
    ).count;
  }

  return { controls, subprocessors };
}

// ── Mapping-aware seeder (idempotent) ────────────────────────

async function main() {
  console.log("Seeding database…");

  const org = await prisma.organization.upsert({
    where: { slug: "demo" },
    update: {},
    create: { name: "Demo Organization", slug: "demo" },
  });

  const existingAdmin = await prisma.user.findUnique({ where: { email: "admin@demo.com" } });
  const admin = existingAdmin
    ? existingAdmin
    : await prisma.user.create({
        data: {
          email: "admin@demo.com",
          name: "Admin User",
          passwordHash: await hash("admin123", 12),
          role: UserRole.ADMIN,
          organizationId: org.id,
        },
      });

  // ── Seed built-in roles ──────────────────────────────────────
  const roleIdByName = new Map<string, string>();
  for (const template of BUILT_IN_ROLES) {
    const existing = await prisma.role.findUnique({
      where: { organizationId_name: { organizationId: org.id, name: template.name } },
    });
    if (existing) {
      // Update permissions if the template changed, but keep custom edits on non-built-in roles
      if (existing.isBuiltIn) {
        await prisma.role.update({
          where: { id: existing.id },
          data: { description: template.description, permissions: template.permissions },
        });
      }
      roleIdByName.set(template.name, existing.id);
    } else {
      const role = await prisma.role.create({
        data: {
          organizationId: org.id,
          name: template.name,
          description: template.description,
          isBuiltIn: true,
          permissions: template.permissions,
        },
      });
      roleIdByName.set(template.name, role.id);
    }
  }

  // Assign admin user to Admin role if they don't have one yet
  if (!admin.roleId && roleIdByName.has("Admin")) {
    await prisma.user.update({
      where: { id: admin.id },
      data: { roleId: roleIdByName.get("Admin")! },
    });
  }

  // ── Seed demo users with different roles ─────────────────────
  const demoUsers = [
    { email: "analyst@demo.com", name: "Risk Analyst User", legacyRole: UserRole.EDITOR, roleName: "Risk Analyst" },
    { email: "auditor@demo.com", name: "Auditor User", legacyRole: UserRole.VIEWER, roleName: "Auditor" },
    { email: "viewer@demo.com", name: "Viewer User", legacyRole: UserRole.VIEWER, roleName: "Viewer" },
  ];
  for (const du of demoUsers) {
    const existing = await prisma.user.findUnique({ where: { email: du.email } });
    if (!existing) {
      await prisma.user.create({
        data: {
          email: du.email,
          name: du.name,
          passwordHash: await hash("demo123", 12),
          role: du.legacyRole,
          organizationId: org.id,
          roleId: roleIdByName.get(du.roleName) ?? null,
        },
      });
      console.log(`  Created user: ${du.email} (${du.roleName})`);
    } else if (!existing.roleId && roleIdByName.has(du.roleName)) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { roleId: roleIdByName.get(du.roleName)! },
      });
    }
  }

  // Assign any users without a roleId to the matching built-in role
  const unassignedUsers = await prisma.user.findMany({
    where: { organizationId: org.id, roleId: null },
  });
  for (const u of unassignedUsers) {
    const matchingRoleName =
      u.role === "ADMIN" ? "Admin" : u.role === "EDITOR" ? "Editor" : "Viewer";
    const roleId = roleIdByName.get(matchingRoleName);
    if (roleId) {
      await prisma.user.update({ where: { id: u.id }, data: { roleId } });
    }
  }

  // Build a lookup: (frameworkName, frameworkCode) -> canonicalCode.
  const canonicalFor = new Map<string, string>();
  for (const concept of CONTROL_MAPPINGS) {
    for (const [fwName, cites] of Object.entries(concept.citations)) {
      for (const c of cites ?? []) {
        canonicalFor.set(`${fwName}::${c.code}`, concept.canonicalCode);
      }
    }
  }

  // Create every framework row.
  const frameworkByName = new Map<string, string>(); // name -> id
  for (const fw of FRAMEWORKS) {
    const existing = await prisma.framework.findFirst({
      where: { organizationId: org.id, name: fw.name },
    });
    const row =
      existing ??
      (await prisma.framework.create({
        data: {
          organizationId: org.id,
          name: fw.name,
          version: fw.version,
          description: fw.description,
          isTemplate: true,
        },
      }));
    frameworkByName.set(fw.name, row.id);
  }

  // First pass: create the shared (mapped) Control rows so downstream FrameworkControls can point to them.
  for (const concept of CONTROL_MAPPINGS) {
    await prisma.control.upsert({
      where: { organizationId_code: { organizationId: org.id, code: concept.canonicalCode } },
      update: {}, // never overwrite a customized title/status
      create: {
        organizationId: org.id,
        code: concept.canonicalCode,
        title: concept.title,
      },
    });
  }

  // Second pass: walk each framework's citation list; for each cited code, either link the shared
  // Control (if the code is in the mapping) or upsert a solo Control unique to this framework.
  let framework_linksAdded = 0;
  for (const fw of FRAMEWORKS) {
    const frameworkId = frameworkByName.get(fw.name)!;
    for (const cite of fw.controls) {
      const canonical = canonicalFor.get(`${fw.name}::${cite.code}`);
      let controlId: string;

      if (canonical) {
        const shared = await prisma.control.findUniqueOrThrow({
          where: { organizationId_code: { organizationId: org.id, code: canonical } },
        });
        controlId = shared.id;
      } else {
        const solo = await prisma.control.upsert({
          where: { organizationId_code: { organizationId: org.id, code: cite.code } },
          update: {},
          create: {
            organizationId: org.id,
            code: cite.code,
            title: cite.title,
          },
        });
        controlId = solo.id;
      }

      const existingReq = await prisma.frameworkRequirement.findUnique({
        where: { frameworkId_code: { frameworkId, code: cite.code } },
      });
      let reqId: string;
      if (existingReq) {
        reqId = existingReq.id;
      } else {
        const createdReq = await prisma.frameworkRequirement.create({
          data: { frameworkId, code: cite.code, title: cite.title },
        });
        reqId = createdReq.id;
        framework_linksAdded++;
      }
      const existingMapping = await prisma.controlMapping.findUnique({
        where: { controlId_frameworkRequirementId: { controlId, frameworkRequirementId: reqId } },
      });
      if (!existingMapping) {
        await prisma.controlMapping.create({
          data: { controlId, frameworkRequirementId: reqId },
        });
      } else if (existingMapping.controlId !== controlId) {
        await prisma.controlMapping.update({
          where: { id: existingMapping.id },
          data: { controlId },
        });
      }
    }
  }

  const [riskCount, policyCount] = await Promise.all([
    prisma.risk.count({ where: { organizationId: org.id } }),
    prisma.policy.count({ where: { organizationId: org.id } }),
  ]);
  if (riskCount === 0) {
    for (const risk of SAMPLE_RISKS) {
      await prisma.risk.create({ data: { organizationId: org.id, ownerId: admin.id, ...risk } });
    }
  }
  if (policyCount === 0) {
    for (const policy of SAMPLE_POLICIES) {
      await prisma.policy.create({
        data: {
          organizationId: org.id,
          approverId: policy.status === "APPROVED" ? admin.id : null,
          approvedAt: policy.status === "APPROVED" ? new Date() : null,
          ...policy,
        },
      });
    }
  }

  const trust = await seedTrustVault(org.id);

  const totalCitations = FRAMEWORKS.reduce((n, f) => n + f.controls.length, 0);
  const distinctControls = await prisma.control.count({ where: { organizationId: org.id } });
  const sharedControls = distinctControls - (totalCitations - framework_linksAdded); // rough log info
  console.log("Seed complete.");
  console.log(`  Organization : ${org.name} (${org.slug})`);
  console.log(`  Admin login  : admin@demo.com / admin123`);
  console.log(`  Frameworks   : ${FRAMEWORKS.length}`);
  console.log(`  Citations    : ${totalCitations} across all frameworks`);
  console.log(`  Controls     : ${distinctControls} distinct underlying controls`);
  console.log(`  Mapped       : ${CONTROL_MAPPINGS.length} cross-framework concepts`);
  console.log(`  New links    : ${framework_linksAdded} framework-citations added this run`);
  console.log(`  Sample risks : ${riskCount === 0 ? SAMPLE_RISKS.length : `${riskCount} already present`}`);
  console.log(`  Sample policies: ${policyCount === 0 ? SAMPLE_POLICIES.length : `${policyCount} already present`}`);
  console.log(`  Roles        : ${roleIdByName.size} built-in roles seeded`);
  console.log(`  Trust Vault  : ${trust.controls} controls, ${trust.subprocessors} sub-processors added (0 = already present)`);
  void sharedControls;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
