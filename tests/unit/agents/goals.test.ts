import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => {
  const mockQueryBuilder = (table: string) => {
    const builder: any = {};
    let insertedData: any = {};
    let updatedData: any = {};
    let eqId: string | null = null;

    builder.insert = vi.fn().mockImplementation((data: any) => {
      insertedData = data;
      return builder;
    });

    builder.update = vi.fn().mockImplementation((data: any) => {
      updatedData = data;
      return builder;
    });

    builder.select = vi.fn().mockReturnThis();
    
    builder.eq = vi.fn().mockImplementation((col: string, val: any) => {
      if (col === 'id') eqId = val;
      return builder;
    });
    
    builder.neq = vi.fn().mockReturnThis();
    builder.in = vi.fn().mockReturnThis();
    builder.limit = vi.fn().mockReturnThis();
    builder.order = vi.fn().mockReturnThis();

    builder.single = vi.fn().mockImplementation(async () => {
      if (table === 'agent_autonomy_boundaries') {
        return { data: { zone: 'yellow' }, error: null };
      }
      if (table === 'agent_goals') {
        return {
          data: {
            id: eqId || 'mock-goal-123',
            framework_code: insertedData.framework_code || 'ISO-27001',
            title: insertedData.title || 'MFA',
            description: insertedData.description || null,
            status: updatedData.status || insertedData.status || 'not_started',
            progress: updatedData.progress !== undefined ? updatedData.progress : (insertedData.progress || 0),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          error: null,
        };
      }
      if (table === 'agent_tasks') {
        return {
          data: {
            id: eqId || 'mock-task-123',
            goal_id: insertedData.goal_id || 'goal-123',
            title: insertedData.title || 'Task Title',
            status: updatedData.status || insertedData.status || 'pending',
            deadline: insertedData.deadline || null,
            assigned_agent: insertedData.assigned_agent || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          error: null,
        };
      }
      return { data: {}, error: null };
    });

    builder.then = (resolve: any) => {
      if (table === 'conversations') {
        resolve({ data: [{ id: 'mock-conversation-uuid' }], error: null });
        return;
      }
      if (table === 'agent_goals') {
        resolve({
          data: [
            {
              id: 'goal-123',
              framework_code: 'ISO-27001',
              title: 'Implementar MFA',
              description: 'Ativar MFA',
              status: 'in_progress',
              progress: 60,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }
          ],
          error: null,
        });
        return;
      }
      if (table === 'agent_tasks') {
        resolve({
          data: [
            {
              id: 'mock-task-123',
              goal_id: 'goal-123',
              title: 'Task Title',
              status: 'completed',
              deadline: new Date().toISOString(),
              assigned_agent: 'Compliance Agent',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }
          ],
          error: null,
        });
        return;
      }
      resolve({ data: [], error: null });
    };

    return builder;
  };

  return {
    createClient: vi.fn().mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'mock-user-uuid' } } }),
      },
      from: vi.fn().mockImplementation((table: string) => mockQueryBuilder(table)),
    }),
  };
});


import {
  createGoal,
  listGoals,
  updateGoalProgress,
  createTask,
  listTasks,
  updateTaskStatus,
  recordUserCorrection,
  agentTools,
} from '@/lib/agents/tools/index';

describe('Agent Goals & Tasks Tools', () => {
  it('has all the new tools registered in agentTools', () => {
    expect(agentTools).toHaveProperty('createGoal');
    expect(agentTools).toHaveProperty('listGoals');
    expect(agentTools).toHaveProperty('updateGoalProgress');
    expect(agentTools).toHaveProperty('createTask');
    expect(agentTools).toHaveProperty('listTasks');
    expect(agentTools).toHaveProperty('updateTaskStatus');
    expect(agentTools).toHaveProperty('recordUserCorrection');
  });

  // Test createGoal autonomy check behavior
  describe('createGoal execute', () => {
    it('returns requires_approval when confirmed is false/omitted due to autonomy zone yellow', async () => {
      const result = (await createGoal.execute!(
        { frameworkCode: 'ISO-27001', title: 'Implementar MFA' },
        { messages: [], toolCallId: 'test-goal-1' }
      )) as any;

      expect(result).toHaveProperty('status', 'requires_approval');
      expect(result).toHaveProperty('action', 'createGoal');
      expect(result.message).toContain('autorização');
    });

    it('returns created goal when confirmed is true', async () => {
      const result = (await createGoal.execute!(
        { frameworkCode: 'ISO-27001', title: 'Implementar MFA', confirmed: true },
        { messages: [], toolCallId: 'test-goal-2' }
      )) as any;

      // When confirmed, it bypasses boundary check and tries to write to Supabase (fails and falls back to mock)
      expect(result).toHaveProperty('framework_code', 'ISO-27001');
      expect(result).toHaveProperty('title', 'Implementar MFA');
      expect(result).toHaveProperty('status', 'not_started');
      expect(result).toHaveProperty('progress', 0);
    });
  });

  // Test listGoals
  describe('listGoals execute', () => {
    it('returns list of goals', async () => {
      const result = (await listGoals.execute!(
        {},
        { messages: [], toolCallId: 'test-list-goals' }
      )) as any;

      expect(result).toHaveProperty('goals');
      expect(Array.isArray(result.goals)).toBe(true);
      expect(result.goals.length).toBeGreaterThan(0);
      expect(result.goals[0]).toHaveProperty('framework_code');
      expect(result.goals[0]).toHaveProperty('title');
    });
  });

  // Test updateGoalProgress
  describe('updateGoalProgress execute', () => {
    it('returns requires_approval when confirmed is false/omitted', async () => {
      const result = (await updateGoalProgress.execute!(
        { goalId: 'goal-123', progress: 50 },
        { messages: [], toolCallId: 'test-update-goal-1' }
      )) as any;

      expect(result).toHaveProperty('status', 'requires_approval');
      expect(result.message).toContain('autorização');
    });

    it('returns updated goal when confirmed is true', async () => {
      const result = (await updateGoalProgress.execute!(
        { goalId: 'goal-123', progress: 50, status: 'in_progress', confirmed: true },
        { messages: [], toolCallId: 'test-update-goal-2' }
      )) as any;

      expect(result).toHaveProperty('id', 'goal-123');
      expect(result).toHaveProperty('progress', 50);
      expect(result).toHaveProperty('status', 'in_progress');
    });
  });

  // Test createTask
  describe('createTask execute', () => {
    it('returns requires_approval when confirmed is false/omitted due to autonomy zone yellow', async () => {
      const result = (await createTask.execute!(
        { goalId: 'goal-123', title: 'Task Title' },
        { messages: [], toolCallId: 'test-create-task-1' }
      )) as any;

      expect(result).toHaveProperty('status', 'requires_approval');
      expect(result.message).toContain('autorização');
    });

    it('returns created task when confirmed is true', async () => {
      const result = (await createTask.execute!(
        { goalId: 'goal-123', title: 'Task Title', confirmed: true },
        { messages: [], toolCallId: 'test-create-task-2' }
      )) as any;

      expect(result).toHaveProperty('goal_id', 'goal-123');
      expect(result).toHaveProperty('title', 'Task Title');
      expect(result).toHaveProperty('status', 'pending');
    });
  });

  // Test listTasks
  describe('listTasks execute', () => {
    it('returns list of tasks', async () => {
      const result = (await listTasks.execute!(
        { goalId: 'goal-123' },
        { messages: [], toolCallId: 'test-list-tasks' }
      )) as any;

      expect(result).toHaveProperty('tasks');
      expect(Array.isArray(result.tasks)).toBe(true);
      expect(result.tasks.length).toBeGreaterThan(0);
      expect(result.tasks[0]).toHaveProperty('goal_id', 'goal-123');
      expect(result.tasks[0]).toHaveProperty('title');
    });
  });

  // Test updateTaskStatus
  describe('updateTaskStatus execute', () => {
    it('returns requires_approval when confirmed is false/omitted', async () => {
      const result = (await updateTaskStatus.execute!(
        { taskId: 'task-123', status: 'completed' },
        { messages: [], toolCallId: 'test-update-task-1' }
      )) as any;

      expect(result).toHaveProperty('status', 'requires_approval');
      expect(result.message).toContain('autorização');
    });

    it('returns updated task when confirmed is true', async () => {
      const result = (await updateTaskStatus.execute!(
        { taskId: 'task-123', status: 'completed', confirmed: true },
        { messages: [], toolCallId: 'test-update-task-2' }
      )) as any;

      expect(result).toHaveProperty('id', 'task-123');
      expect(result).toHaveProperty('status', 'completed');
    });
  });

  // Test recordUserCorrection
  describe('recordUserCorrection execute', () => {
    it('returns success shape', async () => {
      const result = (await recordUserCorrection.execute!(
        { userCorrection: 'A resposta correta é X', agentMisalignedResponse: 'A resposta anterior foi Y' },
        { messages: [], toolCallId: 'test-correction' }
      )) as any;

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('correctionId');
    });
  });
});
