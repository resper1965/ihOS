// src/lib/agents/tools/index.ts
// Vercel AI SDK v6 tool definitions for the ihOS agent system
// Wired to real Standard GRC API + Supabase with mock fallbacks

import { tool } from 'ai';
import { z } from 'zod';
import * as standardApi from '@/lib/standard-api/client';
import { searchDocuments as ragSearch } from '@/lib/chat/rag-search';
import { createClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// Tool: complianceScore
// ---------------------------------------------------------------------------

export const complianceScore = tool({
  description:
    'Calculate the current compliance score for a given framework. ' +
    'Returns overall percentage, control counts by status. ' +
    'Use when users ask about compliance posture.',
  inputSchema: z.object({
    framework: z.string().describe('The compliance framework identifier, e.g. "soc2", "iso27001", "lgpd"'),
    scope: z.string().optional().describe('Optional scope filter'),
  }),
  execute: async (input) => {
    try {
      const result = await standardApi.complianceScore({
        framework_code: input.framework.toUpperCase().replace(/\s+/g, '-'),
      });
      return {
        framework: result.framework_code,
        overallScore: result.overall_score,
        controlsTotal: result.control_scores.length,
        controlsMet: result.control_scores.filter((c) => c.status === 'implemented').length,
        controlsPartial: result.control_scores.filter((c) => c.status === 'partial').length,
        controlsNotMet: result.control_scores.filter((c) => c.status === 'not_implemented').length,
        lastAssessedAt: result.assessed_at,
        source: 'standard-api' as const,
      };
    } catch (err) {
      console.warn('[Tool:complianceScore] API unavailable, using mock:', (err as Error).message);
      return {
        framework: input.framework,
        overallScore: 73.5,
        controlsTotal: 120,
        controlsMet: 78,
        controlsPartial: 22,
        controlsNotMet: 20,
        lastAssessedAt: new Date().toISOString(),
        source: 'mock' as const,
      };
    }
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
    try {
      const result = await standardApi.crossCoverage({
        source_framework: input.sourceFramework.toUpperCase().replace(/\s+/g, '-'),
        target_framework: input.targetFramework.toUpperCase().replace(/\s+/g, '-'),
      });
      return {
        sourceFramework: result.source_framework,
        targetFramework: result.target_framework,
        coveragePercentage: result.coverage_percentage,
        overlappingControls: result.mapped_controls.length,
        mappings: result.mapped_controls.slice(0, 5),
        gaps: result.gaps.slice(0, 5),
        source: 'standard-api' as const,
      };
    } catch (err) {
      console.warn('[Tool:crossCoverage] API unavailable, using mock:', (err as Error).message);
      return {
        sourceFramework: input.sourceFramework,
        targetFramework: input.targetFramework,
        overlappingControls: 45,
        totalSourceControls: 120,
        coveragePercentage: 37.5,
        mappings: [
          { sourceControlId: 'CC6.1', targetControlIds: ['A.9.1.1', 'A.9.1.2'], relationship: 'exact' },
          { sourceControlId: 'CC6.2', targetControlIds: ['A.9.2.1'], relationship: 'partial' },
        ],
        source: 'mock' as const,
      };
    }
  },
});

// ---------------------------------------------------------------------------
// Tool: blastRadius
// ---------------------------------------------------------------------------

export const blastRadius = tool({
  description: 'Analyze the impact of a control failure. Shows affected controls, frameworks, and processes.',
  inputSchema: z.object({
    controlId: z.string().describe('The control identifier, e.g. "CC6.1"'),
    framework: z.string().describe('The framework, e.g. "soc2"'),
  }),
  execute: async (input) => {
    try {
      const result = await standardApi.blastRadius({
        control_id: input.controlId,
        framework_code: input.framework.toUpperCase().replace(/\s+/g, '-'),
      });
      return {
        controlId: result.control_id,
        framework: input.framework,
        affectedFrameworks: result.affected_frameworks.length,
        totalAffectedControls: result.total_affected_controls,
        riskSummary: result.risk_summary,
        source: 'standard-api' as const,
      };
    } catch (err) {
      console.warn('[Tool:blastRadius] API unavailable, using mock:', (err as Error).message);
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
        source: 'mock' as const,
      };
    }
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
    try {
      const results = await ragSearch(input.query, {
        framework: input.framework,
        limit: input.limit ?? 5,
      });
      if (results.length > 0) {
        return results.map((r) => ({
          id: String(r.id),
          content: r.content,
          similarity: r.similarity,
          metadata: r.metadata,
          source: 'supabase' as const,
        }));
      }
      return [];
    } catch (err) {
      console.warn('[Tool:searchDocuments] RAG unavailable, using mock:', (err as Error).message);
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
        source: 'mock' as const,
      }));
    }
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
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('scf_framework_mappings')
        .select('framework_code, scf_control_code')
        .order('framework_code');

      if (error) throw error;
      if (data && data.length > 0) {
        const mappings = data as any[];
        const grouped = mappings.reduce<Record<string, number>>((acc, row) => {
          acc[row.framework_code] = (acc[row.framework_code] ?? 0) + 1;
          return acc;
        }, {});
        const frameworks = Object.entries(grouped).map(([code, count]) => ({
          id: code.toLowerCase().replace(/\s+/g, '-'),
          name: code,
          controlCount: count,
          category: inferCategory(code),
        }));
        const filtered = input.category ? frameworks.filter((f) => f.category === input.category) : frameworks;
        return { frameworks: filtered, source: 'supabase' as const };
      }
      throw new Error('No framework data found');
    } catch (err) {
      console.warn('[Tool:listFrameworks] Supabase unavailable, using mock:', (err as Error).message);
      const all = [
        { id: 'soc2', name: 'SOC 2 Type II', controlCount: 120, category: 'security' },
        { id: 'iso27001', name: 'ISO 27001', controlCount: 93, category: 'security' },
        { id: 'nist-csf', name: 'NIST CSF', controlCount: 108, category: 'security' },
        { id: 'lgpd', name: 'LGPD', controlCount: 65, category: 'privacy' },
        { id: 'gdpr', name: 'GDPR', controlCount: 87, category: 'privacy' },
        { id: 'hipaa', name: 'HIPAA', controlCount: 75, category: 'industry' },
        { id: 'scf', name: 'Secure Controls Framework', controlCount: 1468, category: 'security' },
      ];
      return {
        frameworks: input.category ? all.filter((f) => f.category === input.category) : all,
        source: 'mock' as const,
      };
    }
  },
});

function inferCategory(code: string): string {
  const upper = code.toUpperCase();
  if (['LGPD', 'GDPR', 'CCPA', 'PIPEDA'].some((p) => upper.includes(p))) return 'privacy';
  if (['HIPAA', 'PCI', 'HITRUST'].some((p) => upper.includes(p))) return 'industry';
  return 'security';
}

// ---------------------------------------------------------------------------
// Tool: getAssessmentStatus
// ---------------------------------------------------------------------------

export const getAssessmentStatus = tool({
  description: 'Get assessment status and progress for a framework. Use when users ask about audit progress.',
  inputSchema: z.object({
    framework: z.string().describe('Framework to check, e.g. "soc2"'),
    assessmentId: z.string().optional().describe('Specific assessment ID (latest if omitted)'),
  }),
  execute: async (input) => {
    try {
      const supabase = await createClient();
      let query = supabase.from('compliance_assessments').select('*')
        .eq('framework_code', input.framework.toUpperCase().replace(/\s+/g, '-'));

      if (input.assessmentId) {
        query = query.eq('id', input.assessmentId);
      } else {
        query = query.order('created_at', { ascending: false }).limit(1);
      }

      const { data, error } = await query.single();
      if (error) throw error;
      if (data) {
        const row = data as any;
        return {
          assessmentId: row.id,
          framework: row.framework_code,
          status: row.observation_end_date && new Date() > new Date(row.observation_end_date) ? 'completed' : 'in_progress',
          observationStart: row.observation_start_date,
          observationEnd: row.observation_end_date,
          createdAt: row.created_at,
          source: 'supabase' as const,
        };
      }
      throw new Error('No assessment found');
    } catch (err) {
      console.warn('[Tool:getAssessmentStatus] Supabase unavailable, using mock:', (err as Error).message);
      return {
        assessmentId: input.assessmentId ?? `assess-${input.framework}-2024`,
        framework: input.framework,
        status: 'in_progress' as const,
        progress: 68,
        controlsAssessed: 82,
        controlsTotal: 120,
        startedAt: '2024-01-15T00:00:00Z',
        nextDeadline: '2024-06-30T00:00:00Z',
        source: 'mock' as const,
      };
    }
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
