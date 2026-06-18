// src/lib/assessment/frameworks.ts
// Shared framework definitions — safe to import from both client and server code.

export const DEFAULT_FRAMEWORKS = [
  { id: 'iso27001', name: 'ISO/IEC 27001:2022' },
  { id: 'soc2', name: 'SOC 2 Type II' },
  { id: 'hipaa', name: 'HIPAA' },
  { id: 'nist_800_53', name: 'NIST 800-53' },
  { id: 'tx-ramp-level-2', name: 'TX-RAMP Level 2' },
  { id: 'fedramp', name: 'FedRAMP' },
];
