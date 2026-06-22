// src/lib/integrations/defectdojo/mapper.ts
// Maps DefectDojo findings to compliance framework controls (ISO 27001, SOC 2, NIST 800-53).

import type { DDFinding } from './client';

// ── Interfaces ───────────────────────────────────────────────────────────────

export interface MappedEvidence {
  /** ISO 27001 Annex A control codes */
  controlCodes: string[];
  /** SOC 2 Trust Services Criteria */
  socCriteria: string[];
  /** NIST 800-53 control families */
  nistControls: string[];
  /** Human-readable compliance impact description */
  complianceImpact: string;
  /** Original severity from the finding */
  severity: string;
  /** Formatted evidence text for compliance documentation */
  evidenceText: string;
}

interface ControlMapping {
  iso: string[];
  soc: string[];
  nist: string[];
}

// ── CWE → Compliance Control Mapping ─────────────────────────────────────────

/**
 * Maps the top 20 CWE IDs to their relevant compliance framework controls.
 * Based on OWASP Top 10 2021 and NIST NVD CWE cross-references.
 */
export const CWE_CONTROL_MAP: Record<number, ControlMapping> = {
  // CWE-89: SQL Injection
  89: {
    iso: ['A.8.26', 'A.8.28'],
    soc: ['CC6.1', 'CC7.1'],
    nist: ['SI-10', 'SI-11'],
  },
  // CWE-79: Cross-site Scripting (XSS)
  79: {
    iso: ['A.8.26', 'A.8.28'],
    soc: ['CC6.1', 'CC7.1'],
    nist: ['SI-10', 'SI-11'],
  },
  // CWE-287: Improper Authentication
  287: {
    iso: ['A.8.5', 'A.5.17'],
    soc: ['CC6.1', 'CC6.2', 'CC6.3'],
    nist: ['IA-2', 'IA-5', 'IA-8'],
  },
  // CWE-798: Use of Hard-coded Credentials
  798: {
    iso: ['A.5.17', 'A.8.4'],
    soc: ['CC6.1', 'CC6.6'],
    nist: ['IA-5', 'SC-12', 'SC-13'],
  },
  // CWE-200: Exposure of Sensitive Information
  200: {
    iso: ['A.5.33', 'A.8.11'],
    soc: ['CC6.5', 'CC6.7'],
    nist: ['SI-11', 'SC-28'],
  },
  // CWE-22: Path Traversal
  22: {
    iso: ['A.8.26', 'A.8.3'],
    soc: ['CC6.1', 'CC6.6'],
    nist: ['SI-10', 'AC-3'],
  },
  // CWE-352: Cross-Site Request Forgery (CSRF)
  352: {
    iso: ['A.8.26', 'A.8.5'],
    soc: ['CC6.1', 'CC7.1'],
    nist: ['SI-10', 'SC-23'],
  },
  // CWE-918: Server-Side Request Forgery (SSRF)
  918: {
    iso: ['A.8.26', 'A.8.20'],
    soc: ['CC6.1', 'CC6.6'],
    nist: ['SI-10', 'SC-7'],
  },
  // CWE-502: Deserialization of Untrusted Data
  502: {
    iso: ['A.8.26', 'A.8.28'],
    soc: ['CC6.1', 'CC7.1'],
    nist: ['SI-10', 'SI-2'],
  },
  // CWE-78: Improper Neutralization of OS Commands
  78: {
    iso: ['A.8.26', 'A.8.28'],
    soc: ['CC6.1', 'CC7.1'],
    nist: ['SI-10', 'SI-3'],
  },
  // CWE-434: Unrestricted File Upload
  434: {
    iso: ['A.8.26', 'A.8.23'],
    soc: ['CC6.1', 'CC6.6'],
    nist: ['SI-10', 'CM-7'],
  },
  // CWE-611: XML External Entity (XXE)
  611: {
    iso: ['A.8.26', 'A.8.28'],
    soc: ['CC6.1', 'CC7.1'],
    nist: ['SI-10', 'SC-4'],
  },
  // CWE-306: Missing Authentication for Critical Function
  306: {
    iso: ['A.8.5', 'A.8.3'],
    soc: ['CC6.1', 'CC6.2'],
    nist: ['IA-2', 'AC-3', 'AC-17'],
  },
  // CWE-862: Missing Authorization
  862: {
    iso: ['A.8.3', 'A.5.15'],
    soc: ['CC6.1', 'CC6.3'],
    nist: ['AC-3', 'AC-6'],
  },
  // CWE-276: Incorrect Default Permissions
  276: {
    iso: ['A.8.3', 'A.8.2'],
    soc: ['CC6.1', 'CC6.3'],
    nist: ['AC-3', 'AC-6', 'CM-5'],
  },
  // CWE-327: Use of Broken/Risky Crypto Algorithm
  327: {
    iso: ['A.8.24', 'A.5.17'],
    soc: ['CC6.1', 'CC6.7'],
    nist: ['SC-12', 'SC-13'],
  },
  // CWE-319: Cleartext Transmission of Sensitive Info
  319: {
    iso: ['A.8.24', 'A.5.14'],
    soc: ['CC6.1', 'CC6.7'],
    nist: ['SC-8', 'SC-9'],
  },
  // CWE-532: Insertion of Sensitive Info into Log File
  532: {
    iso: ['A.8.15', 'A.5.33'],
    soc: ['CC6.5', 'CC7.2'],
    nist: ['AU-3', 'SI-11'],
  },
  // CWE-601: Open Redirect
  601: {
    iso: ['A.8.26', 'A.8.28'],
    soc: ['CC6.1', 'CC7.1'],
    nist: ['SI-10', 'SC-18'],
  },
  // CWE-94: Improper Control of Code Generation (Code Injection)
  94: {
    iso: ['A.8.26', 'A.8.28'],
    soc: ['CC6.1', 'CC7.1'],
    nist: ['SI-10', 'SI-3'],
  },
};

// ── Keyword Fallback Mapping ─────────────────────────────────────────────────

interface KeywordMapping {
  pattern: RegExp;
  controls: ControlMapping;
}

/**
 * Regex-based fallback for findings that lack a CWE ID.
 * Matched against finding title + description.
 */
export const KEYWORD_CONTROL_MAP: KeywordMapping[] = [
  {
    pattern: /sql\s*inject|sqli|parameterized\s*query/i,
    controls: CWE_CONTROL_MAP[89],
  },
  {
    pattern: /cross[\s-]*site\s*script|xss|script\s*inject/i,
    controls: CWE_CONTROL_MAP[79],
  },
  {
    pattern: /authenticat|login\s*bypass|credential|password\s*brute/i,
    controls: CWE_CONTROL_MAP[287],
  },
  {
    pattern: /hard[\s-]*coded\s*(credential|password|secret|key|token)/i,
    controls: CWE_CONTROL_MAP[798],
  },
  {
    pattern: /information\s*(disclosure|leak|expos)/i,
    controls: CWE_CONTROL_MAP[200],
  },
  {
    pattern: /path\s*traversal|directory\s*traversal|\.\.\//i,
    controls: CWE_CONTROL_MAP[22],
  },
  {
    pattern: /csrf|cross[\s-]*site\s*request\s*forgery/i,
    controls: CWE_CONTROL_MAP[352],
  },
  {
    pattern: /ssrf|server[\s-]*side\s*request/i,
    controls: CWE_CONTROL_MAP[918],
  },
  {
    pattern: /deserializ|pickle|object\s*inject/i,
    controls: CWE_CONTROL_MAP[502],
  },
  {
    pattern: /command\s*inject|os\s*command|shell\s*inject/i,
    controls: CWE_CONTROL_MAP[78],
  },
  {
    pattern: /file\s*upload|unrestricted\s*upload/i,
    controls: CWE_CONTROL_MAP[434],
  },
  {
    pattern: /xxe|xml\s*external\s*entity/i,
    controls: CWE_CONTROL_MAP[611],
  },
  {
    pattern: /missing\s*auth(entication)?|unauth(enticated|orized)\s*access/i,
    controls: CWE_CONTROL_MAP[306],
  },
  {
    pattern: /missing\s*authori[sz]ation|idor|insecure\s*direct/i,
    controls: CWE_CONTROL_MAP[862],
  },
  {
    pattern: /permission|privilege\s*escalat/i,
    controls: CWE_CONTROL_MAP[276],
  },
  {
    pattern: /weak\s*crypt|broken\s*crypt|md5|sha[\s-]?1|des\b/i,
    controls: CWE_CONTROL_MAP[327],
  },
  {
    pattern: /cleartext|plain[\s-]*text|unencrypted\s*(transmis|communi)/i,
    controls: CWE_CONTROL_MAP[319],
  },
  {
    pattern: /log\s*(inject|sensitive|password|secret|credential)/i,
    controls: CWE_CONTROL_MAP[532],
  },
  {
    pattern: /open\s*redirect|url\s*redirect/i,
    controls: CWE_CONTROL_MAP[601],
  },
  {
    pattern: /code\s*inject|eval\s*inject|remote\s*code/i,
    controls: CWE_CONTROL_MAP[94],
  },
];

// ── Mapping Functions ────────────────────────────────────────────────────────

/**
 * Derives the compliance impact statement from severity.
 */
function deriveComplianceImpact(
  severity: DDFinding['severity'],
  controlCount: number,
): string {
  const severityImpactMap: Record<string, string> = {
    Critical: 'Immediate remediation required — may cause audit non-conformity',
    High: 'High priority — affects multiple compliance control objectives',
    Medium: 'Moderate risk — should be addressed within the current remediation cycle',
    Low: 'Low risk — track for continuous improvement',
    Info: 'Informational — document for awareness',
  };

  const impact = severityImpactMap[severity] ?? 'Unknown severity impact';
  return `${impact}. Affects ${controlCount} compliance control(s).`;
}

/**
 * Maps a DefectDojo finding to relevant compliance framework controls.
 *
 * Resolution order:
 * 1. CWE ID → CWE_CONTROL_MAP (exact match)
 * 2. Title + Description → KEYWORD_CONTROL_MAP (regex fallback)
 * 3. Default generic controls
 */
export function mapFindingToControls(finding: DDFinding): MappedEvidence {
  let mapping: ControlMapping | null = null;

  // 1. Try CWE-based mapping
  if (finding.cwe && CWE_CONTROL_MAP[finding.cwe]) {
    mapping = CWE_CONTROL_MAP[finding.cwe];
  }

  // 2. Fallback to keyword matching
  if (!mapping) {
    const searchText = `${finding.title} ${finding.description}`;
    for (const entry of KEYWORD_CONTROL_MAP) {
      if (entry.pattern.test(searchText)) {
        mapping = entry.controls;
        break;
      }
    }
  }

  // 3. Default generic controls
  if (!mapping) {
    mapping = {
      iso: ['A.8.26'],    // Technical vulnerability management
      soc: ['CC7.1'],     // Detection and monitoring
      nist: ['SI-2'],     // Flaw remediation
    };
  }

  const totalControls = mapping.iso.length + mapping.soc.length + mapping.nist.length;

  return {
    controlCodes: mapping.iso,
    socCriteria: mapping.soc,
    nistControls: mapping.nist,
    complianceImpact: deriveComplianceImpact(finding.severity, totalControls),
    severity: finding.severity,
    evidenceText: formatFindingAsEvidence(finding),
  };
}

/**
 * Formats a DefectDojo finding into a structured evidence text block
 * suitable for compliance documentation and audit trails.
 */
export function formatFindingAsEvidence(finding: DDFinding): string {
  const lines: string[] = [
    `## Finding: ${finding.title}`,
    ``,
    `- **Severity**: ${finding.severity}`,
    `- **Status**: ${finding.active ? 'Active' : 'Closed'}${finding.verified ? ' (Verified)' : ''}`,
    `- **CWE**: ${finding.cwe ? `CWE-${finding.cwe}` : 'N/A'}`,
    `- **CVSS v3**: ${finding.cvssv3 ?? 'N/A'}`,
    `- **Risk Accepted**: ${finding.risk_accepted ? 'Yes' : 'No'}`,
    `- **Mitigated**: ${finding.is_mitigated ? 'Yes' : 'No'}`,
    `- **Discovered**: ${finding.created}`,
  ];

  if (finding.sla_days_remaining !== null) {
    lines.push(`- **SLA Days Remaining**: ${finding.sla_days_remaining}`);
  }

  if (finding.mitigation) {
    lines.push(``, `### Mitigation`, finding.mitigation);
  }

  if (finding.description) {
    lines.push(``, `### Description`, finding.description);
  }

  return lines.join('\n');
}
