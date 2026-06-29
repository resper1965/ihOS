import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Zod Schemas
// ─────────────────────────────────────────────────────────────────────────────

const GoalSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  framework_code: z.string(),
  title: z.string(),
  description: z.string().nullable().default(null),
  status: z.enum(['not_started', 'in_progress', 'completed']).catch('not_started'),
  progress: z.number().default(0),
  source_assessment_id: z.string().nullable().optional(),
  source_control_code: z.string().nullable().optional(),
  created_at: z.string().nullable().default(null),
  updated_at: z.string().nullable().default(null),
});

const TaskSchema = z.object({
  id: z.string(),
  goal_id: z.string(),
  title: z.string(),
  description: z.string().nullable().default(null),
  status: z.enum(['pending', 'in_progress', 'completed']).catch('pending'),
  deadline: z.string().nullable().default(null),
  assigned_agent: z.string().nullable().default(null),
  created_at: z.string().nullable().default(null),
  updated_at: z.string().nullable().default(null),
});

export type Goal = z.infer<typeof GoalSchema>;
export type Task = z.infer<typeof TaskSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Query Keys
// ─────────────────────────────────────────────────────────────────────────────

export const goalKeys = {
  all: ['goals'] as const,
  lists: () => [...goalKeys.all, 'list'] as const,
  details: () => [...goalKeys.all, 'detail'] as const,
  detail: (id: string) => [...goalKeys.details(), id] as const,
};

export const taskKeys = {
  all: ['tasks'] as const,
  lists: () => [...taskKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...taskKeys.lists(), filters] as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────────────────────

export function useGoals() {
  return useQuery({
    queryKey: goalKeys.lists(),
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('agent_goals')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw new Error(error.message);

      return (data ?? []).map((row: unknown) => GoalSchema.parse(row));
    },
    staleTime: 60_000,
  });
}

export function useGoalTasks(goalId?: string | null) {
  return useQuery({
    queryKey: taskKeys.list({ goalId }),
    queryFn: async () => {
      const supabase = createClient();
      let query = supabase
        .from('agent_tasks')
        .select('*')
        .order('deadline', { ascending: true });

      if (goalId) {
        query = query.eq('goal_id', goalId);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      return (data ?? []).map((row: unknown) => TaskSchema.parse(row));
    },
    staleTime: 60_000,
  });
}

export function useCreateGoal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: {
      user_id: string;
      framework_code: string;
      title: string;
      description?: string | null;
      source_assessment_id?: string | null;
      source_control_code?: string | null;
    }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('agent_goals')
        .insert({
          user_id: body.user_id,
          framework_code: body.framework_code,
          title: body.title,
          description: body.description ?? null,
          status: 'not_started',
          progress: 0,
          // Gap-to-goal linkage (columns available after migration 20260629)
          ...(body.source_assessment_id ? { source_assessment_id: body.source_assessment_id } : {}),
          ...(body.source_control_code ? { source_control_code: body.source_control_code } : {}),
        } as any)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return GoalSchema.parse(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: goalKeys.lists() });
    },
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: {
      goal_id: string;
      title: string;
      description?: string | null;
      deadline?: string | null;
      assigned_agent?: string | null;
    }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('agent_tasks')
        .insert({
          goal_id: body.goal_id,
          title: body.title,
          description: body.description ?? null,
          status: 'pending',
          deadline: body.deadline ?? null,
          assigned_agent: body.assigned_agent ?? null,
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return TaskSchema.parse(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      queryClient.invalidateQueries({ queryKey: goalKeys.lists() });
    },
  });
}

export function useToggleTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, currentStatus }: {
      taskId: string;
      currentStatus: 'pending' | 'in_progress' | 'completed';
    }) => {
      const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';

      const supabase = createClient();
      const { data, error } = await supabase
        .from('agent_tasks')
        .update({ status: newStatus })
        .eq('id', taskId)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return TaskSchema.parse(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      queryClient.invalidateQueries({ queryKey: goalKeys.lists() });
    },
  });
}
