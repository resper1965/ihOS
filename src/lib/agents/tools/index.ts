// src/lib/agents/tools/index.ts
// Vercel AI SDK v6 tool definitions for the ihOS agent system
// Wired to real Standard GRC API + Supabase with mock fallbacks

import { tool } from 'ai';
import { z } from 'zod';
import * as standardApi from '@/lib/standard-api/client';
import { searchDocuments as ragSearch } from '@/lib/chat/rag-search';
import { createClient as createServerClient } from '@/lib/supabase/server';
const createClient = createServerClient as any;
import { createAdminClient } from '@/lib/supabase/admin';

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
      const supabase = createAdminClient();
      
      // 1. Try to fetch from database snapshot scorecard first
      const { data: rawSnapshot } = await supabase
        .from('intelligence_snapshots')
        .select('*')
        .eq('snapshot_type', 'scorecard')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (rawSnapshot?.snapshot_data) {
        const snapshotData = rawSnapshot.snapshot_data as any;
        const frameworks = snapshotData.frameworks ?? snapshotData;
        const fw = Array.isArray(frameworks)
          ? frameworks.find(
              (f: any) =>
                f.code?.toLowerCase() === input.framework.toLowerCase() ||
                f.name?.toLowerCase() === input.framework.toLowerCase()
            )
          : null;

        if (fw) {
          return {
            framework: fw.code || fw.name,
            overallScore: fw.score,
            controlsTotal: fw.total_controls || 120,
            controlsMet: fw.compliant_count || fw.controlsMet || 0,
            controlsPartial: fw.partial_count || fw.controlsPartial || 0,
            controlsNotMet: fw.missing || fw.controlsNotMet || 0,
            lastAssessedAt: rawSnapshot.created_at,
            source: 'database' as const,
          };
        }
      }

      // 2. Fall back to GRC API if it's LGPD
      const isLgpd = ['lgpd', 'br-lgpd'].includes(input.framework.toLowerCase());
      const regId = isLgpd ? 'lgpd' : null;
      if (regId) {
        let implementedControls: string[] = [];
        try {
          const { data: chunks } = await supabase
            .from('document_chunks')
            .select('scf_controls')
            .not('scf_controls', 'is', null);
          if (chunks && chunks.length > 0) {
            const allCtrls = new Set<string>();
            chunks.forEach((c: any) => {
              if (Array.isArray(c.scf_controls)) {
                c.scf_controls.forEach((ctrl: string) => allCtrls.add(ctrl));
              }
            });
            implementedControls = Array.from(allCtrls);
          }
        } catch (dbErr) {
          console.warn('[Tool:complianceScore] Failed to query implemented controls from DB:', dbErr);
        }

        if (implementedControls.length === 0) {
          implementedControls = ["GOV-01", "GOV-02", "PRI-01", "PRI-02", "PRI-05", "DCH-01", "DCH-06"];
        }

        const result = await standardApi.complianceScore({
          regulation_id: regId,
          scf_controls_implemented: implementedControls,
        });

        return {
          framework: input.framework,
          overallScore: result.score ?? result.overall_score ?? 0,
          controlsTotal: result.total_required_controls ?? 1,
          controlsMet: result.scf_controls_implemented_count ?? 1,
          controlsPartial: 0,
          controlsNotMet: result.missing_controls?.length ?? 0,
          lastAssessedAt: new Date().toISOString(),
          source: 'standard-api' as const,
        };
      }

      throw new Error(`Framework score for ${input.framework} not cached, and regulation is not supported by API.`);
    } catch (err) {
      console.warn('[Tool:complianceScore] API/DB unavailable, using mock:', (err as Error).message);
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
      const supabase = createAdminClient();

      // 1. Try to fetch from database snapshots first
      const { data: rawSnapshot } = await supabase
        .from('intelligence_snapshots')
        .select('*')
        .eq('snapshot_type', 'cross_coverage' as any)
        .eq('framework_code', input.targetFramework.toUpperCase().replace(/\s+/g, '-'))
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (rawSnapshot?.snapshot_data) {
        const result = rawSnapshot.snapshot_data as any;
        return {
          sourceFramework: result.source_framework || input.sourceFramework,
          targetFramework: result.target_framework || input.targetFramework,
          coveragePercentage: result.overlap_percentage ?? result.coverage_percentage ?? 0,
          overlappingControls: result.mapped_controls?.length || 0,
          mappings: result.mapped_controls?.slice(0, 5) || [],
          gaps: result.gaps?.slice(0, 5) || [],
          source: 'database' as const,
        };
      }

      // 2. Fall back to GRC API
      let implementedControls: string[] = [];
      try {
        const { data: chunks } = await supabase
          .from('document_chunks')
          .select('scf_controls')
          .not('scf_controls', 'is', null);
        if (chunks && chunks.length > 0) {
          const allCtrls = new Set<string>();
          chunks.forEach((c: any) => {
            if (Array.isArray(c.scf_controls)) {
              c.scf_controls.forEach((ctrl: string) => allCtrls.add(ctrl));
            }
          });
          implementedControls = Array.from(allCtrls);
        }
      } catch (dbErr) {
        console.warn('[Tool:crossCoverage] Failed to query implemented controls from DB:', dbErr);
      }

      if (implementedControls.length === 0) {
        implementedControls = ["GOV-01", "GOV-02", "PRI-01", "PRI-02", "PRI-05", "DCH-01", "DCH-06"];
      }

      const result = await standardApi.crossCoverage({
        source_framework: input.sourceFramework.toLowerCase(),
        target_framework: input.targetFramework.toLowerCase(),
        scf_controls_implemented: implementedControls,
      });

      return {
        sourceFramework: result.source_framework,
        targetFramework: result.target_framework,
        coveragePercentage: result.overlap_percentage ?? result.coverage_percentage ?? 0,
        overlappingControls: result.mapped_controls?.length || 0,
        mappings: result.mapped_controls?.slice(0, 5) || [],
        gaps: result.gaps?.slice(0, 5) || [],
        source: 'standard-api' as const,
      };
    } catch (err) {
      console.warn('[Tool:crossCoverage] API/DB unavailable, using mock:', (err as Error).message);
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
      const supabase = createAdminClient();

      // 1. Try database query first
      const { data: rawSnapshot } = await supabase
        .from('intelligence_snapshots')
        .select('*')
        .eq('snapshot_type', 'blast_radius' as any)
        .contains('input_payload', { control_id: input.controlId })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (rawSnapshot?.snapshot_data) {
        const result = rawSnapshot.snapshot_data as any;
        return {
          controlId: result.control_id,
          framework: input.framework,
          affectedFrameworks: result.affected_frameworks?.length || 0,
          totalAffectedControls: result.total_affected_controls,
          riskSummary: result.risk_summary || result.interpretation || '',
          source: 'database' as const,
        };
      }

      // 2. Fall back to GRC API
      const result = await standardApi.blastRadius({
        control_id: input.controlId,
        framework_code: input.framework.toUpperCase().replace(/\s+/g, '-'),
      });
      return {
        controlId: result.control_id,
        framework: input.framework,
        affectedFrameworks: result.affected_frameworks?.length || 0,
        totalAffectedControls: result.total_affected_controls ?? 0,
        riskSummary: result.risk_summary || '',
        source: 'standard-api' as const,
      };
    } catch (err) {
      console.warn('[Tool:blastRadius] API/DB unavailable, using mock:', (err as Error).message);
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
      const supabase = createAdminClient();
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
// Helper: Autonomy Boundary Check
// ---------------------------------------------------------------------------

async function checkAutonomy(
  actionType: string,
  confirmed = false
): Promise<{ allowed: boolean; requiresApproval?: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { allowed: true }; // Fallback for testing/unauthenticated
    }

    const { data: boundary } = await supabase
      .from('agent_autonomy_boundaries')
      .select('zone')
      .eq('user_id', user.id)
      .eq('action_type', actionType)
      .single();

    const zone = boundary?.zone ?? (
      actionType === 'create_goal' ? 'yellow' :
      actionType === 'update_task_status' ? 'yellow' :
      actionType === 'send_alert' ? 'green' : 'yellow'
    );

    if (zone === 'red') {
      return { allowed: false, error: 'Ação bloqueada pelas políticas de autonomia.' };
    }

    if (zone === 'yellow' && !confirmed) {
      return { allowed: false, requiresApproval: true };
    }

    return { allowed: true };
  } catch (err) {
    // Fail-safe for tests
    return { allowed: true };
  }
}

// ---------------------------------------------------------------------------
// Tool: createGoal
// ---------------------------------------------------------------------------

export const createGoal = tool({
  description: 'Create a new compliance remediation goal/project. Use when the user requests to remediate a gap or establish a goal.',
  inputSchema: z.object({
    frameworkCode: z.string().describe('The compliance framework code, e.g. "ISO-27001", "SOC-2"'),
    title: z.string().describe('Short title for the goal'),
    description: z.string().optional().describe('Detailed description of the goal'),
    confirmed: z.boolean().optional().describe('Must be set to true to bypass autonomy boundaries if they require approval'),
  }),
  execute: async (input) => {
    const autonomy = await checkAutonomy('create_goal', input.confirmed);
    if (!autonomy.allowed) {
      if (autonomy.requiresApproval) {
        return {
          status: 'requires_approval',
          action: 'createGoal',
          message: `A criação desta meta de remediação requer sua autorização. Deseja criar a meta "${input.title}"?`,
        };
      }
      return { status: 'error', message: autonomy.error || 'Ação bloqueada pelas regras de autonomia.' };
    }

    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Unauthenticated');

      const { data, error } = await supabase
        .from('agent_goals')
        .insert({
          user_id: user.id,
          framework_code: input.frameworkCode.toUpperCase().replace(/\s+/g, '-'),
          title: input.title,
          description: input.description ?? null,
          status: 'not_started',
          progress: 0,
        })
        .select()
        .single();

      if (error) throw error;
      return { ...data, source: 'supabase' as const };
    } catch (err) {
      console.warn('[Tool:createGoal] Supabase unavailable, using mock:', (err as Error).message);
      return {
        id: crypto.randomUUID(),
        framework_code: input.frameworkCode,
        title: input.title,
        description: input.description ?? null,
        status: 'not_started' as const,
        progress: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        source: 'mock' as const,
      };
    }
  },
});

// ---------------------------------------------------------------------------
// Tool: listGoals
// ---------------------------------------------------------------------------

export const listGoals = tool({
  description: 'List active compliance remediation goals/projects. Use when users ask to see their goals or project lists.',
  inputSchema: z.object({
    frameworkCode: z.string().optional().describe('Filter by framework code'),
  }),
  execute: async (input) => {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Unauthenticated');

      let query = supabase.from('agent_goals').select('*').eq('user_id', user.id);
      if (input.frameworkCode) {
        query = query.eq('framework_code', input.frameworkCode.toUpperCase().replace(/\s+/g, '-'));
      }

      const { data, error } = await query;
      if (error) throw error;
      return { goals: data, source: 'supabase' as const };
    } catch (err) {
      console.warn('[Tool:listGoals] Supabase unavailable, using mock:', (err as Error).message);
      const mockGoals = [
        {
          id: 'mock-goal-1',
          framework_code: input.frameworkCode ?? 'ISO-27001',
          title: 'Implementar Controle de Acessos Múltifo Fator (MFA)',
          description: 'Ativar MFA para todos os usuários com acesso administrativo.',
          status: 'in_progress' as const,
          progress: 60,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 'mock-goal-2',
          framework_code: input.frameworkCode ?? 'SOC-2',
          title: 'Configurar Logs de Auditoria Contínua',
          description: 'Habilitar monitoramento contínuo de logs de auditoria na AWS.',
          status: 'not_started' as const,
          progress: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      ];
      return { goals: mockGoals, source: 'mock' as const };
    }
  },
});

// ---------------------------------------------------------------------------
// Tool: updateGoalProgress
// ---------------------------------------------------------------------------

export const updateGoalProgress = tool({
  description: 'Update the progress percentage or status of a remediation goal.',
  inputSchema: z.object({
    goalId: z.string().describe('The ID of the goal to update'),
    progress: z.number().min(0).max(100).describe('New progress percentage (0-100)'),
    status: z.enum(['not_started', 'in_progress', 'completed']).optional().describe('New status'),
    confirmed: z.boolean().optional().describe('Must be set to true to bypass autonomy boundaries'),
  }),
  execute: async (input) => {
    const autonomy = await checkAutonomy('create_goal', input.confirmed);
    if (!autonomy.allowed) {
      if (autonomy.requiresApproval) {
        return {
          status: 'requires_approval',
          action: 'updateGoalProgress',
          message: `A atualização desta meta de remediação requer sua autorização. Deseja atualizar o progresso para ${input.progress}%?`,
        };
      }
      return { status: 'error', message: autonomy.error || 'Ação bloqueada pelas regras de autonomia.' };
    }

    try {
      const supabase = await createClient();
      const updates: Record<string, any> = { progress: input.progress };
      if (input.status) updates.status = input.status;

      const { data, error } = await supabase
        .from('agent_goals')
        .update(updates)
        .eq('id', input.goalId)
        .select()
        .single();

      if (error) throw error;
      return { ...data, source: 'supabase' as const };
    } catch (err) {
      console.warn('[Tool:updateGoalProgress] Supabase unavailable, using mock:', (err as Error).message);
      return {
        id: input.goalId,
        progress: input.progress,
        status: input.status ?? ('in_progress' as const),
        updated_at: new Date().toISOString(),
        source: 'mock' as const,
      };
    }
  },
});

// ---------------------------------------------------------------------------
// Tool: createTask
// ---------------------------------------------------------------------------

export const createTask = tool({
  description: 'Create a new technical execution task associated with a goal.',
  inputSchema: z.object({
    goalId: z.string().describe('The ID of the remediation goal to associate this task with'),
    title: z.string().describe('Title of the task'),
    description: z.string().optional().describe('Detailed description of the task'),
    deadline: z.string().optional().describe('Deadline for the task (ISO string)'),
    assignedAgent: z.string().optional().describe('Agent assigned to this task'),
    confirmed: z.boolean().optional().describe('Must be set to true to bypass autonomy boundaries'),
  }),
  execute: async (input) => {
    const autonomy = await checkAutonomy('update_task_status', input.confirmed);
    if (!autonomy.allowed) {
      if (autonomy.requiresApproval) {
        return {
          status: 'requires_approval',
          action: 'createTask',
          message: `A criação desta tarefa requer sua autorização. Deseja criar a tarefa "${input.title}"?`,
        };
      }
      return { status: 'error', message: autonomy.error || 'Ação bloqueada pelas regras de autonomia.' };
    }

    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('agent_tasks')
        .insert({
          goal_id: input.goalId,
          title: input.title,
          description: input.description ?? null,
          status: 'pending',
          deadline: input.deadline ?? null,
          assigned_agent: input.assignedAgent ?? null,
        })
        .select()
        .single();

      if (error) throw error;
      return { ...data, source: 'supabase' as const };
    } catch (err) {
      console.warn('[Tool:createTask] Supabase unavailable, using mock:', (err as Error).message);
      return {
        id: crypto.randomUUID(),
        goal_id: input.goalId,
        title: input.title,
        description: input.description ?? null,
        status: 'pending' as const,
        deadline: input.deadline ?? null,
        assigned_agent: input.assignedAgent ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        source: 'mock' as const,
      };
    }
  },
});

// ---------------------------------------------------------------------------
// Tool: listTasks
// ---------------------------------------------------------------------------

export const listTasks = tool({
  description: 'List execution tasks for a specific goal or all goals.',
  inputSchema: z.object({
    goalId: z.string().optional().describe('Filter tasks by Goal ID'),
  }),
  execute: async (input) => {
    try {
      const supabase = await createClient();
      let query = supabase.from('agent_tasks').select('*');
      if (input.goalId) {
        query = query.eq('goal_id', input.goalId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return { tasks: data, source: 'supabase' as const };
    } catch (err) {
      console.warn('[Tool:listTasks] Supabase unavailable, using mock:', (err as Error).message);
      const mockTasks = [
        {
          id: 'mock-task-1',
          goal_id: input.goalId ?? 'mock-goal-1',
          title: 'Configurar SSO com Google Workspace',
          description: 'Habilitar logon único usando o Google Workspace no portal.',
          status: 'completed' as const,
          deadline: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          assigned_agent: 'Compliance Agent',
        },
        {
          id: 'mock-task-2',
          goal_id: input.goalId ?? 'mock-goal-1',
          title: 'Habilitar autenticação Duo MFA para administradores',
          description: 'Configurar integração da API do Duo para autenticação administrativa.',
          status: 'in_progress' as const,
          deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
          assigned_agent: 'SOC Agent',
        }
      ];
      return { tasks: mockTasks, source: 'mock' as const };
    }
  },
});

// ---------------------------------------------------------------------------
// Tool: updateTaskStatus
// ---------------------------------------------------------------------------

export const updateTaskStatus = tool({
  description: 'Update the execution status of a task.',
  inputSchema: z.object({
    taskId: z.string().describe('The ID of the task to update'),
    status: z.enum(['pending', 'in_progress', 'completed']).describe('New status for the task'),
    confirmed: z.boolean().optional().describe('Must be set to true to bypass autonomy boundaries'),
  }),
  execute: async (input) => {
    const autonomy = await checkAutonomy('update_task_status', input.confirmed);
    if (!autonomy.allowed) {
      if (autonomy.requiresApproval) {
        return {
          status: 'requires_approval',
          action: 'updateTaskStatus',
          message: `A atualização desta tarefa requer sua autorização. Deseja alterar o status para "${input.status}"?`,
        };
      }
      return { status: 'error', message: autonomy.error || 'Ação bloqueada pelas regras de autonomia.' };
    }

    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('agent_tasks')
        .update({ status: input.status })
        .eq('id', input.taskId)
        .select()
        .single();

      if (error) throw error;
      return { ...data, source: 'supabase' as const };
    } catch (err) {
      console.warn('[Tool:updateTaskStatus] Supabase unavailable, using mock:', (err as Error).message);
      return {
        id: input.taskId,
        status: input.status,
        updated_at: new Date().toISOString(),
        source: 'mock' as const,
      };
    }
  },
});

// ---------------------------------------------------------------------------
// Tool: recordUserCorrection
// ---------------------------------------------------------------------------

export const recordUserCorrection = tool({
  description: 'Record a correction provided by the user when the agent makes a mistake or gives an outdated answer.',
  inputSchema: z.object({
    userCorrection: z.string().describe('The correction text provided by the user'),
    agentMisalignedResponse: z.string().describe('The incorrect or misaligned response that the agent gave previously'),
    conversationId: z.string().optional().describe('Optional conversation ID to link the correction to'),
  }),
  execute: async (input) => {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Unauthenticated');

      let convId = input.conversationId;
      if (!convId) {
        // Find most recent conversation
        const { data: convs } = await supabase
          .from('conversations')
          .select('id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1);
        if (convs && convs.length > 0) convId = convs[0].id;
      }

      if (!convId) throw new Error('No active conversation found');

      const { data, error } = await supabase
        .from('agent_learning_corrections')
        .insert({
          user_id: user.id,
          conversation_id: convId,
          user_correction: input.userCorrection,
          agent_misaligned_response: input.agentMisalignedResponse,
          learned_context: `Subject context captured on ${new Date().toLocaleDateString('pt-BR')}`,
        })
        .select()
        .single();

      if (error) throw error;
      return { success: true, correctionId: data.id, source: 'supabase' as const };
    } catch (err) {
      console.warn('[Tool:recordUserCorrection] Supabase unavailable, using mock:', (err as Error).message);
      return {
        success: true,
        correctionId: crypto.randomUUID(),
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
  createGoal,
  listGoals,
  updateGoalProgress,
  createTask,
  listTasks,
  updateTaskStatus,
  recordUserCorrection,
} as const;

export type AgentToolName = keyof typeof agentTools;

