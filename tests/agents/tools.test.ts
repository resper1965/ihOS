// tests/agents/tools.test.ts
// Unit tests for agent tool definitions (src/lib/agents/tools/index.ts)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSupabaseAdmin, mockSupabaseServer } from '../setup';

// ---------------------------------------------------------------------------
// Import tools — mocks are already loaded via setup.ts
// ---------------------------------------------------------------------------

import {
  complianceScore,
  searchDocuments,
  listFrameworks,
  createGoal,
  recordUserCorrection,
  agentTools,
} from '@/lib/agents/tools/index';

import * as standardApi from '@/lib/standard-api/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reset all mock return values between tests */
function resetSupabaseMocks() {
  // Reset all chainable methods to return `this` and terminal calls to defaults
  for (const client of [mockSupabaseAdmin, mockSupabaseServer]) {
    client.from.mockReturnThis();
    client.select.mockReturnThis();
    client.insert.mockReturnThis();
    client.update.mockReturnThis();
    client.delete.mockReturnThis();
    client.eq.mockReturnThis();
    client.neq.mockReturnThis();
    client.in.mockReturnThis();
    client.not.mockReturnThis();
    client.contains.mockReturnThis();
    client.order.mockReturnThis();
    client.limit.mockReturnThis();
    client.single.mockResolvedValue({ data: null, error: null });
    client.maybeSingle.mockResolvedValue({ data: null, error: null });
    client.rpc.mockResolvedValue({ data: [], error: null });
    client.auth.getUser.mockResolvedValue({
      data: { user: { id: 'test-user-id', email: 'test@example.com' } },
      error: null,
    });
  }
}

// ---------------------------------------------------------------------------
// Tests: complianceScore
// ---------------------------------------------------------------------------

describe('complianceScore tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSupabaseMocks();
  });

  it('returns score from intelligence_snapshots cache when available', async () => {
    const cachedSnapshot = {
      snapshot_data: {
        frameworks: [
          {
            code: 'SOC2',
            name: 'SOC 2',
            score: 85,
            total_controls: 120,
            compliant_count: 100,
            partial_count: 10,
            missing: 10,
          },
        ],
      },
      created_at: '2024-01-15T00:00:00Z',
    };

    mockSupabaseAdmin.maybeSingle.mockResolvedValue({
      data: cachedSnapshot,
      error: null,
    });

    const result = await (complianceScore as any).execute(
      { framework: 'soc2' },
      { toolCallId: 'test', messages: [], abortSignal: undefined as any },
    );

    expect(result.source).toBe('database');
    expect(result.overallScore).toBe(85);
    expect(result.framework).toBe('SOC2');
  });

  it('falls back to Standard API when cache is empty (LGPD)', async () => {
    // No cached snapshot
    mockSupabaseAdmin.maybeSingle.mockResolvedValue({ data: null, error: null });
    // No document_chunks with scf_controls
    mockSupabaseAdmin.not.mockResolvedValue({ data: [], error: null });

    (standardApi.complianceScore as any).mockResolvedValue({
      score: 65,
      overall_score: 65,
      total_required_controls: 65,
      scf_controls_implemented_count: 42,
      missing_controls: ['PRI-03', 'PRI-04'],
    });

    const result = await (complianceScore as any).execute(
      { framework: 'lgpd' },
      { toolCallId: 'test', messages: [], abortSignal: undefined as any },
    );

    expect(result.source).toBe('standard-api');
    expect(result.overallScore).toBe(65);
    expect(standardApi.complianceScore).toHaveBeenCalled();
  });

  it('falls back to mock data when both DB and API fail', async () => {
    // Force the admin client to throw
    mockSupabaseAdmin.maybeSingle.mockRejectedValue(new Error('DB down'));

    const result = await (complianceScore as any).execute(
      { framework: 'nist-csf' },
      { toolCallId: 'test', messages: [], abortSignal: undefined as any },
    );

    expect(result.source).toBe('mock');
    expect(result.overallScore).toBe(73.5);
  });
});

// ---------------------------------------------------------------------------
// Tests: searchDocuments
// ---------------------------------------------------------------------------

describe('searchDocuments tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSupabaseMocks();
  });

  it('calls RPC match_documents via ragSearch', async () => {
    // The tool uses ragSearch internally which is mocked in setup.ts
    const { searchDocuments: ragSearch } = await import('@/lib/chat/rag-search');

    (ragSearch as any).mockResolvedValue([
      {
        id: 1,
        content: 'Test document content',
        similarity: 0.92,
        metadata: {
          documentId: 100,
          documentTitle: 'Security Policy v3.0',
          framework: 'soc2',
          section: 'Section 1',
        },
      },
    ]);

    const result = await (searchDocuments as any).execute(
      { query: 'access control policy', limit: 5 },
      { toolCallId: 'test', messages: [], abortSignal: undefined as any },
    );

    expect(ragSearch).toHaveBeenCalledWith('access control policy', expect.objectContaining({ limit: 5 }));
    expect(Array.isArray(result)).toBe(true);
    expect((result as any[])[0].content).toBe('Test document content');
  });
});

// ---------------------------------------------------------------------------
// Tests: listFrameworks
// ---------------------------------------------------------------------------

describe('listFrameworks tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSupabaseMocks();
  });

  it('queries scf_framework_mappings from Supabase', async () => {
    // Simulate the chainable query returning final data
    // The tool calls: supabase.from('scf_framework_mappings').select(...).order(...)
    // The last method in the chain (order) should resolve with data
    mockSupabaseAdmin.order.mockResolvedValue({
      data: [
        { framework_code: 'SOC-2', scf_control_code: 'CC6.1' },
        { framework_code: 'SOC-2', scf_control_code: 'CC6.2' },
        { framework_code: 'ISO-27001', scf_control_code: 'A.9.1' },
      ],
      error: null,
    });

    const result = await (listFrameworks as any).execute(
      {},
      { toolCallId: 'test', messages: [], abortSignal: undefined as any },
    );

    expect(result.source).toBe('supabase');
    expect((result as any).frameworks.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: createGoal
// ---------------------------------------------------------------------------

describe('createGoal tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSupabaseMocks();
  });

  it('inserts into agent_goals when autonomy check passes (green zone / confirmed)', async () => {
    // autonomy: checkAutonomy will query agent_autonomy_boundaries
    // Then the tool queries auth.getUser, then inserts
    mockSupabaseServer.single.mockResolvedValueOnce({
      data: { zone: 'green' },
      error: null,
    });

    // For the insert chain: insert().select().single()
    const mockGoalData = {
      id: 'goal-123',
      framework_code: 'ISO-27001',
      title: 'Implement MFA',
      description: null,
      status: 'not_started',
      progress: 0,
      created_at: new Date().toISOString(),
    };

    // The second single() call (from insert chain) should return the goal
    mockSupabaseServer.single.mockResolvedValue({
      data: mockGoalData,
      error: null,
    });

    const result = await (createGoal as any).execute(
      {
        frameworkCode: 'ISO-27001',
        title: 'Implement MFA',
        confirmed: true,
      },
      { toolCallId: 'test', messages: [], abortSignal: undefined as any },
    );

    // Should return supabase data or mock (depending on auth flow)
    expect(result).toBeDefined();
    expect(result.title).toBe('Implement MFA');
  });

  it('returns requires_approval for yellow zone when not confirmed', async () => {
    // autonomy boundary returns yellow
    mockSupabaseServer.single.mockResolvedValueOnce({
      data: { zone: 'yellow' },
      error: null,
    });

    const result = await (createGoal as any).execute(
      {
        frameworkCode: 'SOC-2',
        title: 'Configure audit logs',
      },
      { toolCallId: 'test', messages: [], abortSignal: undefined as any },
    );

    expect(result.status).toBe('requires_approval');
    expect(result.action).toBe('createGoal');
  });
});

// ---------------------------------------------------------------------------
// Tests: recordUserCorrection
// ---------------------------------------------------------------------------

describe('recordUserCorrection tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSupabaseMocks();
  });

  it('inserts into agent_learning_corrections', async () => {
    // auth.getUser returns test user (default)
    // then: supabase.from('conversations').select('id')...
    mockSupabaseServer.limit.mockResolvedValueOnce({
      data: [{ id: 'conv-abc' }],
      error: null,
    });

    // then: supabase.from('agent_learning_corrections').insert(...)
    mockSupabaseServer.single.mockResolvedValue({
      data: { id: 'correction-xyz' },
      error: null,
    });

    const result = await (recordUserCorrection as any).execute(
      {
        userCorrection: 'The correct policy is XYZ.',
        agentMisalignedResponse: 'The policy is ABC.',
        conversationId: 'conv-abc',
      },
      { toolCallId: 'test', messages: [], abortSignal: undefined as any },
    );

    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: agentTools map
// ---------------------------------------------------------------------------

describe('agentTools map', () => {
  it('exports all 13 tools', () => {
    expect(Object.keys(agentTools)).toHaveLength(13);
    expect(agentTools).toHaveProperty('complianceScore');
    expect(agentTools).toHaveProperty('crossCoverage');
    expect(agentTools).toHaveProperty('blastRadius');
    expect(agentTools).toHaveProperty('searchDocuments');
    expect(agentTools).toHaveProperty('listFrameworks');
    expect(agentTools).toHaveProperty('getAssessmentStatus');
    expect(agentTools).toHaveProperty('createGoal');
    expect(agentTools).toHaveProperty('listGoals');
    expect(agentTools).toHaveProperty('updateGoalProgress');
    expect(agentTools).toHaveProperty('createTask');
    expect(agentTools).toHaveProperty('listTasks');
    expect(agentTools).toHaveProperty('updateTaskStatus');
    expect(agentTools).toHaveProperty('recordUserCorrection');
  });
});
