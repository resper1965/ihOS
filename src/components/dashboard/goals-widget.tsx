"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Target, Calendar, ArrowRight, ListTodo, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { AgentGoal, AgentTask } from "@/lib/supabase/types";

export function GoalsWidget() {
  const { user, isLoading: userLoading } = useUser();
  const [goals, setGoals] = useState<AgentGoal[]>([]);
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userLoading) return;
    
    async function fetchData() {
      try {
        const supabase = createClient();
        
        if (!user) {
          setGoals([]);
          setTasks([]);
          setLoading(false);
          return;
        }

        // Fetch goals
        const { data: goalsData } = await supabase
          .from("agent_goals")
          .select("*")
          .order("created_at", { ascending: false });

        // Fetch tasks
        const { data: tasksData } = await supabase
          .from("agent_tasks")
          .select("*")
          .order("deadline", { ascending: true });

        setGoals(goalsData || []);
        setTasks(tasksData || []);
      } catch (err) {
        console.error("Error fetching widget data:", err);
        setGoals([]);
        setTasks([]);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [user, userLoading]);

  // Compute stats
  const activeGoals = goals.filter((g) => g.status !== "completed");
  const pendingTasks = tasks
    .filter((t) => t.status !== "completed")
    .slice(0, 3); // next 3 urgent tasks

  const averageProgress = goals.length > 0
    ? Math.round(goals.reduce((acc, g) => acc + g.progress, 0) / goals.length)
    : 0;

  function getDeadlineLabel(deadlineStr: string | null) {
    if (!deadlineStr) return { label: "Sem prazo", variant: "neutral" as const };
    
    const deadline = new Date(deadlineStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(deadline);
    target.setHours(0, 0, 0, 0);

    const diffTime = target.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { label: `Atrasado há ${Math.abs(diffDays)}d`, variant: "danger" as const };
    } else if (diffDays === 0) {
      return { label: "Hoje", variant: "warning" as const };
    } else if (diffDays === 1) {
      return { label: "Amanhã", variant: "warning" as const };
    } else if (diffDays <= 7) {
      return { label: `Em ${diffDays} dias`, variant: "info" as const };
    } else {
      return {
        label: deadline.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        variant: "neutral" as const,
      };
    }
  }

  if (loading) {
    return (
      <div className="glass-card p-6 animate-pulse space-y-4">
        <div className="h-6 w-36 rounded bg-white/10" />
        <div className="h-4 w-full rounded bg-white/5" />
        <div className="space-y-2 pt-2">
          <div className="h-10 w-full rounded bg-white/5" />
          <div className="h-10 w-full rounded bg-white/5" />
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-6 flex flex-col justify-between h-full">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-accent/20">
              <Target className="h-5 w-5 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-text-primary">
              Projetos de Remediação
            </h3>
          </div>
          <Link 
            href="/goals" 
            className="text-xs font-semibold text-primary hover:text-primary-hover flex items-center gap-1 group transition-colors"
          >
            Ver tudo
            <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>

        {/* Global Progress */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-text-secondary">
            <span>Progresso Médio</span>
            <span className="font-semibold text-text-primary">{averageProgress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
            <div 
              className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-500" 
              style={{ width: `${averageProgress}%` }}
            />
          </div>
        </div>

        {/* Tasks List */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">
            <ListTodo className="h-3.5 w-3.5" />
            <span>Tarefas Críticas Próximas</span>
          </div>

          <div className="space-y-2">
            {pendingTasks.length === 0 ? (
              <p className="text-sm text-text-muted py-2">
                Nenhuma tarefa crítica pendente. Tudo em conformidade!
              </p>
            ) : (
              pendingTasks.map((task) => {
                const deadlineInfo = getDeadlineLabel(task.deadline);
                const goal = goals.find((g) => g.id === task.goal_id);

                return (
                  <Link 
                    key={task.id} 
                    href="/goals" 
                    className="flex items-center justify-between p-3 rounded-xl border border-white/5 bg-white/[0.01] hover:bg-white/[0.03] hover:border-primary/20 transition-all duration-200"
                  >
                    <div className="space-y-0.5 min-w-0 pr-3">
                      <h4 className="text-sm font-medium text-text-primary truncate">
                        {task.title}
                      </h4>
                      <p className="text-[11px] text-text-muted truncate">
                        {goal?.title || "Meta"} ({goal?.framework_code || "SGSI"})
                      </p>
                    </div>
                    <Badge variant={deadlineInfo.variant}>
                      {deadlineInfo.label}
                    </Badge>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
