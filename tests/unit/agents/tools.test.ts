import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  complianceScore,
  crossCoverage,
  blastRadius,
  searchDocuments,
  listFrameworks,
  getAssessmentStatus,
  agentTools,
} from '@/lib/agents/tools/index';
import * as standardApi from '@/lib/standard-api/client';
import { searchDocuments as ragSearch } from '@/lib/chat/rag-search';

// ---------------------------------------------------------------------------
// agentTools map
// ---------------------------------------------------------------------------
describe('agentTools map', () => {
  it('contains exactly 13 tools', () => {
    expect(Object.keys(agentTools)).toHaveLength(13);
  });

  it('has all expected tool names', () => {
    const keys = Object.keys(agentTools);
    expect(keys).toContain('complianceScore');
    expect(keys).toContain('crossCoverage');
    expect(keys).toContain('blastRadius');
    expect(keys).toContain('searchDocuments');
    expect(keys).toContain('listFrameworks');
    expect(keys).toContain('getAssessmentStatus');
  });
});

// ---------------------------------------------------------------------------
// Tool structure checks
// ---------------------------------------------------------------------------
describe('tool structure', () => {
  const toolEntries = Object.entries(agentTools);

  it.each(toolEntries)('%s has a description', (_name, tool) => {
    expect(tool.description).toBeDefined();
    expect(typeof tool.description).toBe('string');
    expect(tool.description!.length).toBeGreaterThan(10);
  });

  it.each(toolEntries)('%s has inputSchema (not parameters)', (_name, tool) => {
    // Vercel AI SDK v6 uses `inputSchema`, not `parameters`
    expect(tool).toHaveProperty('inputSchema');
    expect((tool as Record<string, unknown>)['parameters']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// complianceScore
// ---------------------------------------------------------------------------
describe('complianceScore execute', () => {
  it('returns compliance score shape', async () => {
    const result = (await complianceScore.execute!(
      { framework: 'soc2' },
      { messages: [], toolCallId: 'test-1' }
    )) as any;
    expect(result).toHaveProperty('framework', 'soc2');
    expect(result).toHaveProperty('overallScore');
    expect(typeof result.overallScore).toBe('number');
    expect(result).toHaveProperty('controlsTotal');
    expect(result).toHaveProperty('controlsMet');
    expect(result).toHaveProperty('controlsPartial');
    expect(result).toHaveProperty('controlsNotMet');
    expect(result).toHaveProperty('lastAssessedAt');
  });

  it('reflects the requested framework in the result', async () => {
    const result = (await complianceScore.execute!(
      { framework: 'iso27001' },
      { messages: [], toolCallId: 'test-2' }
    )) as any;
    expect(result.framework).toBe('iso27001');
  });
});

// ---------------------------------------------------------------------------
// crossCoverage
// ---------------------------------------------------------------------------
describe('crossCoverage execute', () => {
  it('returns cross-coverage shape', async () => {
    const result = (await crossCoverage.execute!(
      { sourceFramework: 'soc2', targetFramework: 'iso27001' },
      { messages: [], toolCallId: 'test-3' }
    )) as any;
    expect(result).toHaveProperty('sourceFramework', 'soc2');
    expect(result).toHaveProperty('targetFramework', 'iso27001');
    expect(result).toHaveProperty('overlappingControls');
    expect(result).toHaveProperty('coveragePercentage');
    expect(result).toHaveProperty('mappings');
    expect(Array.isArray(result.mappings)).toBe(true);
  });

  it('mappings contain relationship types', async () => {
    const result = (await crossCoverage.execute!(
      { sourceFramework: 'soc2', targetFramework: 'iso27001' },
      { messages: [], toolCallId: 'test-4' }
    )) as any;
    for (const mapping of result.mappings) {
      expect(['exact', 'partial', 'related']).toContain(mapping.relationship);
    }
  });
});

// ---------------------------------------------------------------------------
// blastRadius
// ---------------------------------------------------------------------------
describe('blastRadius execute', () => {
  beforeEach(() => {
    (standardApi.blastRadius as any).mockRejectedValue(new Error('Force mock fallback'));
  });

  it('returns blast radius shape', async () => {
    const result = (await blastRadius.execute!(
      { controlId: 'CC6.1', framework: 'soc2' },
      { messages: [], toolCallId: 'test-5' }
    )) as any;
    expect(result).toHaveProperty('controlId', 'CC6.1');
    expect(result).toHaveProperty('framework', 'soc2');
    expect(result).toHaveProperty('impactLevel');
    expect(result).toHaveProperty('affectedControls');
    expect(result).toHaveProperty('affectedProcesses');
    expect(result).toHaveProperty('remediationPriority');
    expect(Array.isArray(result.affectedControls)).toBe(true);
    expect(Array.isArray(result.affectedProcesses)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// searchDocuments
// ---------------------------------------------------------------------------
describe('searchDocuments execute', () => {
  beforeEach(() => {
    (ragSearch as any).mockRejectedValue(new Error('Force mock fallback'));
  });

  it('returns array of search results', async () => {
    const result = (await searchDocuments.execute!(
      { query: 'access control policy', limit: 5 },
      { messages: [], toolCallId: 'test-6' }
    )) as any;
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(5); // default limit
  });

  it('respects limit parameter', async () => {
    const result = (await searchDocuments.execute!(
      { query: 'test', limit: 3 },
      { messages: [], toolCallId: 'test-7' }
    )) as any;
    expect(result.length).toBe(3);
  });

  it('each result has expected shape', async () => {
    const result = (await searchDocuments.execute!(
      { query: 'test', limit: 2 },
      { messages: [], toolCallId: 'test-8' }
    )) as any;
    for (const item of result) {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('content');
      expect(item).toHaveProperty('similarity');
      expect(item).toHaveProperty('metadata');
      expect(item.metadata).toHaveProperty('documentId');
      expect(item.metadata).toHaveProperty('documentTitle');
      expect(item.metadata).toHaveProperty('framework');
    }
  });

  it('applies framework filter in metadata', async () => {
    const result = (await searchDocuments.execute!(
      { query: 'test', framework: 'soc2', limit: 1 },
      { messages: [], toolCallId: 'test-9' }
    )) as any;
    expect(result[0].metadata.framework).toBe('soc2');
  });
});

// ---------------------------------------------------------------------------
// listFrameworks
// ---------------------------------------------------------------------------
describe('listFrameworks execute', () => {
  it('returns all frameworks without category filter', async () => {
    const result = (await listFrameworks.execute!(
      {},
      { messages: [], toolCallId: 'test-10' }
    )) as any;
    expect(Array.isArray(result.frameworks)).toBe(true);
    expect(result.frameworks.length).toBe(7);
  });

  it('filters by category', async () => {
    const result = (await listFrameworks.execute!(
      { category: 'privacy' },
      { messages: [], toolCallId: 'test-11' }
    )) as any;
    expect(result.frameworks.length).toBe(2);
    for (const fw of result.frameworks) {
      expect(fw.category).toBe('privacy');
    }
  });

  it('each framework has expected shape', async () => {
    const result = (await listFrameworks.execute!(
      {},
      { messages: [], toolCallId: 'test-12' }
    )) as any;
    for (const fw of result.frameworks) {
      expect(fw).toHaveProperty('id');
      expect(fw).toHaveProperty('name');
      expect(fw).toHaveProperty('controlCount');
      expect(fw).toHaveProperty('category');
    }
  });
});

// ---------------------------------------------------------------------------
// getAssessmentStatus
// ---------------------------------------------------------------------------
describe('getAssessmentStatus execute', () => {
  it('returns assessment status shape', async () => {
    const result = (await getAssessmentStatus.execute!(
      { framework: 'soc2' },
      { messages: [], toolCallId: 'test-13' }
    )) as any;
    expect(result).toHaveProperty('assessmentId');
    expect(result).toHaveProperty('framework', 'soc2');
    expect(result).toHaveProperty('status', 'in_progress');
    expect(result).toHaveProperty('progress');
    expect(typeof result.progress).toBe('number');
    expect(result).toHaveProperty('controlsAssessed');
    expect(result).toHaveProperty('controlsTotal');
    expect(result).toHaveProperty('startedAt');
    expect(result).toHaveProperty('nextDeadline');
  });

  it('uses provided assessmentId when given', async () => {
    const result = (await getAssessmentStatus.execute!(
      { framework: 'soc2', assessmentId: 'custom-id-123' },
      { messages: [], toolCallId: 'test-14' }
    )) as any;
    expect(result.assessmentId).toBe('custom-id-123');
  });

  it('generates default assessmentId when omitted', async () => {
    const result = (await getAssessmentStatus.execute!(
      { framework: 'iso27001' },
      { messages: [], toolCallId: 'test-15' }
    )) as any;
    expect(result.assessmentId).toContain('iso27001');
  });
});
