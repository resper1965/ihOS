// src/lib/agents/tools/index.ts
// Vercel AI SDK v6 tool definitions for the ihOS agent system

import { tool } from 'ai';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Tool: complianceScore
// ---------------------------------------------------------------------------

export const complianceScore = tool({
  description:
    'Calculate the current compliance score for a given framework. ' +
    'Returns overall percentage, control counts by status. ' +
    'Use when users ask about compliance posture.',
  inputSchema: z.object({
    framework: z
      .string()
      .describe('The compliance framework identifier, e.g. "soc2", "iso27001", "lgpd"'),
    scope: z
      .string()
      .optional()
      .describe('Optional scope filter, e.g. a specific business unit'),
  }),
  execute: async (input) => {
    // TODO: wire to Standard GRC API client
    return {
      framework: input.framework,
      overallScore: 73.5,
      controlsTotal: 120,
      controlsMet: 78,
      controlsPartial: 22,
      controlsNotMet: 20,
      lastAssessedAt: new Date().toISOString(),
    };
  },
});

// ---------------------------------------------------------------------------
// Tool: crossCoverage
// ---------------------------------------------------------------------------

export const crossCoverage = tool({
  description:
    'Find overlapping controls between two compliance frameworks. ' +
    'Use when users want to understand framework overlap.',
  inputSchema: z.object({
    sourceFramework: z.string().describe('Source framework, e.g. "soc2"'),
    targetFramework: z.string().describe('Target framework, e.g. "iso27001"'),
  }),
  execute: async (input) => {
    // TODO: wire to Standard GRC API
    return {
      sourceFramework: input.sourceFramework,
      targetFramework: input.targetFramework,
      overlappingControls: 45,
      totalSourceControls: 120,
      coveragePercentage: 37.5,
      mappings: [
        { sourceControlId: 'CC6.1', targetControlIds: ['A.9.1.1', 'A.9.1.2'], relationship: 'exact' },
        { sourceControlId: 'CC6.2', targetControlIds: ['A.9.2.1'], relationship: 'partial' },
        { sourceControlId: 'CC7.1', targetControlIds: ['A.12.4.1'], relationship: 'related' },
      ],
    };
  },
});

// ---------------------------------------------------------------------------
// Tool: blastRadius
// ---------------------------------------------------------------------------

export const blastRadius = tool({
  description:
    'Analyze the impact of a control failure. Shows affected controls, frameworks, and processes.',
  inputSchema: z.object({
    controlId: z.string().describe('The control identifier, e.g. "CC6.1"'),
    framework: z.string().describe('The framework, e.g. "soc2"'),
  }),
  execute: async (input) => {
    // TODO: wire to Standard GRC API
    return {
      controlId: input.controlId,
      framework: input.framework,
      impactLevel: 'high' as const,
      affectedControls: [
        { controlId: 'CC6.2', framework: 'soc2', relationship: 'depends-on' },
        { controlId: 'A.9.1.1', framework: 'iso27001', relationship: 'mapped' },
      ],
      affectedProcesses: ['Access Management', 'User Provisioning', 'Authentication Services'],
      remediationPriority: 1,
    };
  },
});

// ---------------------------------------------------------------------------
// Tool: searchDocuments
// ---------------------------------------------------------------------------

export const searchDocuments = tool({
  description:
    'Search compliance documents using semantic similarity (RAG). ' +
    'Use when users ask about policies, procedures, or compliance topics.',
  inputSchema: z.object({
    query: z.string().describe('The natural-language search query'),
    framework: z.string().optional().describe('Optional framework filter'),
    limit: z.number().int().min(1).max(10).optional().default(5).describe('Max results (1-10)'),
  }),
  execute: async (input) => {
    // TODO: wire to Supabase pgvector similarity search
    const count = input.limit ?? 5;
    return Array.from({ length: count }, (_, i) => ({
      id: `chunk-${i + 1}`,
      content: `Relevant document content for "${input.query}" — chunk ${i + 1}.`,
      similarity: Math.round((0.95 - i * 0.05) * 100) / 100,
      metadata: {
        documentId: `doc-${100 + i}`,
        documentTitle: `Compliance Policy v${3 - Math.min(i, 2)}.0`,
        framework: input.framework ?? 'general',
        section: `Section ${i + 1}`,
      },
    }));
  },
});

// ---------------------------------------------------------------------------
// Tool: listFrameworks
// ---------------------------------------------------------------------------

export const listFrameworks = tool({
  description:
    'List available compliance frameworks with control counts. ' +
    'Use when users ask what frameworks are supported.',
  inputSchema: z.object({
    category: z.string().optional().describe('Optional filter: "security", "privacy", "industry"'),
  }),
  execute: async (input) => {
    const all = [
      { id: 'soc2', name: 'SOC 2 Type II', controlCount: 120, category: 'security' },
      { id: 'iso27001', name: 'ISO 27001', controlCount: 93, category: 'security' },
      { id: 'nist-csf', name: 'NIST CSF', controlCount: 108, category: 'security' },
      { id: 'lgpd', name: 'LGPD', controlCount: 65, category: 'privacy' },
      { id: 'gdpr', name: 'GDPR', controlCount: 87, category: 'privacy' },
      { id: 'hipaa', name: 'HIPAA', controlCount: 75, category: 'industry' },
      { id: 'scf', name: 'Secure Controls Framework', controlCount: 1468, category: 'security' },
    ];
    return input.category ? all.filter((f) => f.category === input.category) : all;
  },
});

// ---------------------------------------------------------------------------
// Tool: getAssessmentStatus
// ---------------------------------------------------------------------------

export const getAssessmentStatus = tool({
  description:
    'Get assessment status and progress for a framework. ' +
    'Use when users ask about audit progress.',
  inputSchema: z.object({
    framework: z.string().describe('Framework to check, e.g. "soc2"'),
    assessmentId: z.string().optional().describe('Specific assessment ID (latest if omitted)'),
  }),
  execute: async (input) => {
    // TODO: wire to Supabase
    return {
      assessmentId: input.assessmentId ?? `assess-${input.framework}-2024`,
      framework: input.framework,
      status: 'in_progress' as const,
      progress: 68,
      controlsAssessed: 82,
      controlsTotal: 120,
      startedAt: '2024-01-15T00:00:00Z',
      nextDeadline: '2024-06-30T00:00:00Z',
    };
  },
});

// ---------------------------------------------------------------------------
// Tools Map (used by streamText)
// ---------------------------------------------------------------------------

export const agentTools = {
  complianceScore,
  crossCoverage,
  blastRadius,
  searchDocuments,
  listFrameworks,
  getAssessmentStatus,
} as const;

export type AgentToolName = keyof typeof agentTools;
