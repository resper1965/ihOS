import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/cron/agentic-triggers/route';
import { createAdminClient } from '@/lib/supabase/admin';

// Mock the admin client
vi.mock('@/lib/supabase/admin', () => {
  const mockQueryBuilder = (table: string) => {
    const builder: any = {};

    const getMockData = () => {
      if (table === 'profiles') {
        return [{ id: 'mock-user-uuid' }];
      }
      if (table === 'agent_goals') {
        return [{ id: 'mock-goal-uuid', title: 'Remediar MFA', framework_code: 'ISO-27001' }];
      }
      if (table === 'agent_tasks') {
        return [
          {
            id: 'mock-task-uuid',
            goal_id: 'mock-goal-uuid',
            title: 'Tarefa Importante',
            status: 'pending',
            deadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
          }
        ];
      }
      if (table === 'agent_notifications') {
        return [];
      }
      if (table === 'compliance_assessments') {
        return [{ id: 'mock-assessment-uuid', framework_code: 'ISO-27001' }];
      }
      if (table === 'poam_items') {
        return [
          {
            id: 'mock-poam-uuid',
            assessment_id: 'mock-assessment-uuid',
            control_code: 'A.5.1',
            status: 'risk_accepted',
            risk_acceptance_expires_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
          }
        ];
      }
      if (table === 'agent_org_state') {
        return { score: 70.0 };
      }
      return [];
    };

    builder.select = vi.fn().mockReturnThis();
    builder.eq = vi.fn().mockReturnThis();
    builder.neq = vi.fn().mockReturnThis();
    builder.in = vi.fn().mockReturnThis();
    builder.limit = vi.fn().mockReturnThis();
    builder.order = vi.fn().mockReturnThis();

    builder.single = vi.fn().mockImplementation(async () => {
      const data = getMockData();
      if (table === 'agent_org_state') {
        return { data: { state_value: data }, error: null };
      }
      return { data: Array.isArray(data) ? data[0] : data, error: null };
    });

    builder.insert = vi.fn().mockResolvedValue({ error: null });
    builder.upsert = vi.fn().mockResolvedValue({ error: null });

    builder.then = (resolve: any) => {
      const data = getMockData();
      resolve({ data, error: null });
    };

    return builder;
  };

  return {
    createAdminClient: vi.fn().mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => mockQueryBuilder(table)),
    }),
  };
});

describe('GRC Agentic Evolution Cron Triggers Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs successfully when CRON_SECRET is not configured', async () => {
    const req = new Request('http://localhost:3000/api/cron/agentic-triggers', {
      method: 'GET',
    });

    const response = await GET(req);
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json).toHaveProperty('success', true);
    expect(json).toHaveProperty('timestamp');
    expect(json).toHaveProperty('alerts_generated');
  });

  it('blocks request when CRON_SECRET is configured but wrong header is provided', async () => {
    process.env.CRON_SECRET = 'super-secret-key';

    const req = new Request('http://localhost:3000/api/cron/agentic-triggers', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer wrong-key',
      },
    });

    const response = await GET(req);
    expect(response.status).toBe(401);

    delete process.env.CRON_SECRET;
  });

  it('allows request when CRON_SECRET is configured and correct header is provided', async () => {
    process.env.CRON_SECRET = 'super-secret-key';

    const req = new Request('http://localhost:3000/api/cron/agentic-triggers', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer super-secret-key',
      },
    });

    const response = await GET(req);
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json).toHaveProperty('success', true);

    delete process.env.CRON_SECRET;
  });
});
