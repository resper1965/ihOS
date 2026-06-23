"use client";

import { useEffect, useState, useTransition } from "react";
import { 
  Target, 
  Plus, 
  Search, 
  CheckSquare, 
  Square, 
  Calendar, 
  User, 
  ChevronDown, 
  ChevronUp, 
  AlertCircle, 
  Sparkles, 
  ListTodo 
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PageTitleRegistrar } from "@/components/dashboard/page-title-registrar";
import { useUser } from "@/hooks/use-user";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { AgentGoal, AgentTask } from "@/lib/supabase/types";

export default function GoalsPage() {
  const { user, isLoading: userLoading } = useUser();
  const [goals, setGoals] = useState<AgentGoal[]>([]);
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter/Search states
  const [search, setSearch] = useState("");
  const [frameworkFilter, setFrameworkFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Accordion state
  const [expandedGoals, setExpandedGoals] = useState<Record<string, boolean>>({});

  // Modals state
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [selectedGoalIdForTask, setSelectedGoalIdForTask] = useState<string | null>(null);

  // New Goal form states
  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [newGoalDesc, setNewGoalDesc] = useState("");
  const [newGoalFramework, setNewGoalFramework] = useState("ISO-27001");
  const [goalModalLoading, setGoalModalLoading] = useState(false);

  // New Task form states
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [newTaskDeadline, setNewTaskDeadline] = useState("");
  const [newTaskAgent, setNewTaskAgent] = useState("Compliance Agent");
  const [taskModalLoading, setTaskModalLoading] = useState(false);

  const [isPending, startTransition] = useTransition();

  // Typecast to any to bypass Supabase schema generic inference issues in Client Component
  let supabase: any = null;
  try {
    supabase = createClient();
  } catch (e) {
    // Safe fallback for Next.js static build prerendering
  }

  useEffect(() => {
    if (userLoading) return;
    fetchData();
  }, [user, userLoading]);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      if (!user || !supabase) {
        // No user or Supabase client — show empty state
        setGoals([]);
        setTasks([]);
        setLoading(false);
        return;
      }

      // Fetch goals
      const { data: goalsData, error: goalsError } = await supabase
        .from("agent_goals")
        .select("*")
        .order("created_at", { ascending: false });

      if (goalsError) throw goalsError;

      // Fetch tasks
      const { data: tasksData, error: tasksError } = await supabase
        .from("agent_tasks")
        .select("*")
        .order("deadline", { ascending: true });

      if (tasksError) throw tasksError;

      setGoals(goalsData || []);
      setTasks(tasksData || []);
    } catch (err) {
      console.error("Error fetching goals/tasks:", err);
      setError("Unable to load data.");
      setGoals([]);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }

  // Recalculates progress for a goal and updates it in DB
  async function updateGoalProgress(goalId: string, updatedTasks: AgentTask[]) {
    const goalTasks = updatedTasks.filter((t) => t.goal_id === goalId);
    const total = goalTasks.length;
    const completed = goalTasks.filter((t) => t.status === "completed").length;
    
    const progressVal = total > 0 ? Math.round((completed / total) * 100) : 0;
    const statusVal = (progressVal === 100 ? "completed" : progressVal > 0 ? "in_progress" : "not_started") as "not_started" | "in_progress" | "completed";

    // Optimistically update local state first
    setGoals((prev) =>
      prev.map((g) =>
        g.id === goalId ? { ...g, progress: progressVal, status: statusVal } : g
      )
    );

    if (!user || !supabase) return; // skip DB write in demo mode

    try {
      await supabase
        .from("agent_goals")
        .update({ progress: progressVal, status: statusVal })
        .eq("id", goalId);
    } catch (err) {
      console.error("Error updating goal progress:", err);
    }
  }

  async function handleToggleTaskStatus(task: AgentTask) {
    const newStatus = (task.status === "completed" ? "pending" : "completed") as "pending" | "in_progress" | "completed";
    
    // Update local state first
    const updatedTasks = tasks.map((t) =>
      t.id === task.id ? { ...t, status: newStatus } : t
    );
    setTasks(updatedTasks);

    // Trigger progress update
    await updateGoalProgress(task.goal_id, updatedTasks);

    if (!user || !supabase) return; // skip DB write in demo mode

    try {
      await supabase
        .from("agent_tasks")
        .update({ status: newStatus })
        .eq("id", task.id);
    } catch (err) {
      console.error("Error updating task status:", err);
    }
  }

  async function handleCreateGoal(e: React.FormEvent) {
    e.preventDefault();
    if (!newGoalTitle.trim()) return;

    setGoalModalLoading(true);
    try {
      const newGoalObj: Omit<AgentGoal, "id" | "created_at" | "updated_at"> = {
        user_id: user?.id || "demo-user",
        framework_code: newGoalFramework,
        title: newGoalTitle,
        description: newGoalDesc || null,
        status: "not_started",
        progress: 0,
      };

      if (user && supabase) {
        const { data, error: insertError } = await supabase
          .from("agent_goals")
          .insert(newGoalObj)
          .select()
          .single();

        if (insertError) throw insertError;
        if (data) setGoals((prev) => [data as AgentGoal, ...prev]);
      } else {
        // Demo mode fallback
        const mockNewGoal: AgentGoal = {
          ...newGoalObj,
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setGoals((prev) => [mockNewGoal, ...prev]);
      }

      // Reset form
      setNewGoalTitle("");
      setNewGoalDesc("");
      setIsGoalModalOpen(false);
    } catch (err) {
      console.error("Error creating goal:", err);
    } finally {
      setGoalModalLoading(false);
    }
  }

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskTitle.trim() || !selectedGoalIdForTask) return;

    setTaskModalLoading(true);
    try {
      const newTaskObj: Omit<AgentTask, "id" | "created_at" | "updated_at"> = {
        goal_id: selectedGoalIdForTask,
        title: newTaskTitle,
        description: newTaskDesc || null,
        status: "pending",
        deadline: newTaskDeadline ? new Date(newTaskDeadline).toISOString() : null,
        assigned_agent: newTaskAgent || null,
      };

      let createdTask: AgentTask;

      if (user && supabase) {
        const { data, error: insertError } = await supabase
          .from("agent_tasks")
          .insert(newTaskObj)
          .select()
          .single();

        if (insertError) throw insertError;
        createdTask = data as AgentTask;
      } else {
        // Demo mode fallback
        createdTask = {
          ...newTaskObj,
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }

      const updatedTasks = [...tasks, createdTask];
      setTasks(updatedTasks);
      
      // Auto-expand goal accordion to show new task
      setExpandedGoals((prev) => ({ ...prev, [selectedGoalIdForTask]: true }));

      // Recalculate goal progress
      await updateGoalProgress(selectedGoalIdForTask, updatedTasks);

      // Reset form
      setNewTaskTitle("");
      setNewTaskDesc("");
      setNewTaskDeadline("");
      setIsTaskModalOpen(false);
    } catch (err) {
      console.error("Error creating task:", err);
    } finally {
      setTaskModalLoading(false);
    }
  }

  function toggleExpandGoal(goalId: string) {
    setExpandedGoals((prev) => ({
      ...prev,
      [goalId]: !prev[goalId],
    }));
  }

  // Filter computations
  const filteredGoals = goals.filter((g) => {
    const matchesSearch =
      g.title.toLowerCase().includes(search.toLowerCase()) ||
      (g.description?.toLowerCase() || "").includes(search.toLowerCase());
    
    const matchesFramework = frameworkFilter === "all" || g.framework_code === frameworkFilter;
    const matchesStatus = statusFilter === "all" || g.status === statusFilter;

    return matchesSearch && matchesFramework && matchesStatus;
  });

  const activeGoalsCount = goals.filter((g) => g.status !== "completed").length;
  const pendingTasksCount = tasks.filter((t) => t.status !== "completed").length;
  const averageProgress = goals.length > 0 
    ? Math.round(goals.reduce((acc, g) => acc + g.progress, 0) / goals.length) 
    : 0;

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "Sem prazo";
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  return (
    <div className="w-full space-y-8 pb-12">
      <PageTitleRegistrar
        title="Remediation Goals"
        subtitle="Track projects and technical tasks recommended by intelligence to mitigate compliance gaps."
        icon={<Target className="h-4 w-4 text-amber-400" />}
      />
      <div className="flex justify-end">
        <Button
          variant="primary"
          icon={<Plus className="h-4 w-4" />}
          onClick={() => setIsGoalModalOpen(true)}
        >
          New Project
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-warning/20 bg-warning/5 p-4 text-warning">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <Card title="Active Goals" icon={<Target className="h-5 w-5 text-primary" />}>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-text-primary">{activeGoalsCount}</span>
            <span className="text-xs text-text-muted">of {goals.length} projects</span>
          </div>
        </Card>
        <Card title="Pending Tasks" icon={<ListTodo className="h-5 w-5 text-accent" />}>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-text-primary">{pendingTasksCount}</span>
            <span className="text-xs text-text-muted">awaiting evidence</span>
          </div>
        </Card>
        <Card title="Average Progress" icon={<Sparkles className="h-5 w-5 text-warning" />}>
          <div className="mt-2 space-y-2">
            <span className="text-3xl font-bold text-text-primary">{averageProgress}%</span>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
              <div 
                className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-500" 
                style={{ width: `${averageProgress}%` }}
              />
            </div>
          </div>
        </Card>
      </div>

      {/* Filters Area */}
      <div className="glass-card p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
        {/* Search */}
        <div className="relative w-full md:max-w-xs">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="h-4 w-4 text-text-muted" />
          </div>
          <input
            type="text"
            placeholder="Buscar metas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar metas"
            className="w-full rounded-xl border border-border-glass bg-white/5 py-2 pl-9 pr-4 text-sm text-text-primary outline-none transition-all duration-300 focus:border-primary/50"
          />
        </div>

        {/* Select Dropdowns */}
        <div className="flex w-full md:w-auto gap-3 items-center">
          <div className="flex-1 md:w-44">
            <select
              value={frameworkFilter}
              onChange={(e) => setFrameworkFilter(e.target.value)}
              aria-label="Filtrar por framework"
              className="w-full rounded-xl border border-border-glass bg-[#0d2027] px-3 py-2 text-sm text-text-primary outline-none transition-all focus:border-primary/50"
            >
              <option value="all">Todos Frameworks</option>
              <option value="ISO-27001">ISO 27001</option>
              <option value="SOC-2">SOC 2</option>
              <option value="ISO-27701">ISO 27701</option>
              <option value="NIST-800-53">NIST 800-53</option>
              <option value="LGPD">LGPD</option>
            </select>
          </div>
          <div className="flex-1 md:w-44">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
              className="w-full rounded-xl border border-border-glass bg-[#0d2027] px-3 py-2 text-sm text-text-primary outline-none transition-all focus:border-primary/50"
            >
              <option value="all">All Statuses</option>
              <option value="not_started">Not Started</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main List */}
      <div className="space-y-4">
        {loading ? (
          /* Skeletons */
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="glass-card p-6 animate-pulse space-y-4">
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <div className="h-6 w-48 rounded bg-white/10" />
                  <div className="h-4 w-96 rounded bg-white/5" />
                </div>
                <div className="h-6 w-20 rounded bg-white/10" />
              </div>
              <div className="h-2 w-full rounded bg-white/5" />
            </div>
          ))
        ) : filteredGoals.length === 0 ? (
          <div className="glass-card p-12 text-center space-y-3">
            <Target className="h-12 w-12 text-text-muted mx-auto" />
            <h3 className="text-lg font-semibold text-text-primary">No goals found</h3>
            <p className="text-sm text-text-secondary max-w-sm mx-auto">
              Try adjusting the filters or click "New Project" to create a new remediation goal.
            </p>
          </div>
        ) : (
          filteredGoals.map((goal) => {
            const goalTasks = tasks.filter((t) => t.goal_id === goal.id);
            const isExpanded = expandedGoals[goal.id] || false;

            return (
              <div 
                key={goal.id} 
                className={`glass-card overflow-hidden transition-all duration-300 ${
                  isExpanded ? "border-primary/20 shadow-lg shadow-primary/5" : ""
                }`}
              >
                {/* Card Header (Goal summary) */}
                <div 
                  className="p-6 cursor-pointer hover:bg-white/[0.01] transition-colors"
                  onClick={() => toggleExpandGoal(goal.id)}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold text-text-primary group-hover:text-primary transition-colors">
                          {goal.title}
                        </h3>
                        <Badge variant="neutral">{goal.framework_code}</Badge>
                        <Badge 
                          variant={
                            goal.status === "completed" 
                              ? "success" 
                              : goal.status === "in_progress" 
                                ? "info" 
                                : "neutral"
                          }
                          dot={goal.status === "in_progress"}
                        >
                          {goal.status === "completed" 
                            ? "Completed" 
                            : goal.status === "in_progress" 
                              ? "In Progress" 
                              : "Not Started"}
                        </Badge>
                      </div>
                      {goal.description && (
                        <p className="text-sm text-text-secondary pr-6 line-clamp-2">
                          {goal.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-4 self-end sm:self-auto shrink-0">
                      <span className="text-xs text-text-muted font-mono">
                        {goalTasks.filter((t) => t.status === "completed").length}/{goalTasks.length} tasks
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="h-5 w-5 text-text-muted" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-text-muted" />
                      )}
                    </div>
                  </div>

                  {/* Progress Line */}
                  <div className="mt-5">
                    <Progress value={goal.progress} size="sm" showPercentage />
                  </div>
                </div>

                {/* Accordion Content (Tasks List) */}
                {isExpanded && (
                  <div className="border-t border-white/5 bg-slate-950/20 px-6 py-4 space-y-4 animate-[slide-down_0.2s_ease-out]">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                        Technical Execution Tasks
                      </h4>
                      <Button 
                        size="sm" 
                        variant="secondary" 
                        icon={<Plus className="h-3 w-3" />}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedGoalIdForTask(goal.id);
                          setIsTaskModalOpen(true);
                        }}
                      >
                        New Task
                      </Button>
                    </div>

                    <div className="divide-y divide-white/5">
                      {goalTasks.length === 0 ? (
                        <p className="text-xs text-text-muted py-4 text-center">
                          No technical tasks created for this project.
                        </p>
                      ) : (
                        goalTasks.map((task) => {
                          const isCompleted = task.status === "completed";

                          return (
                            <div 
                              key={task.id} 
                              className="flex items-start gap-3 py-3 group/task hover:bg-white/[0.01] px-2 rounded-lg transition-colors"
                            >
                              {/* Status Checkbox */}
                              <button 
                                onClick={() => handleToggleTaskStatus(task)}
                                className="mt-0.5 shrink-0 text-text-muted hover:text-primary transition-colors focus:outline-none"
                              >
                                {isCompleted ? (
                                  <CheckSquare className="h-5 w-5 text-primary" />
                                ) : (
                                  <Square className="h-5 w-5" />
                                )}
                              </button>

                              {/* Task Details */}
                              <div className="flex-1 space-y-1">
                                <h5 className={`text-sm font-medium ${
                                  isCompleted ? "text-text-muted line-through" : "text-text-primary"
                                }`}>
                                  {task.title}
                                </h5>
                                {task.description && (
                                  <p className="text-xs text-text-secondary leading-relaxed max-w-2xl">
                                    {task.description}
                                  </p>
                                )}
                                
                                {/* Info Footer */}
                                <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1 text-[11px] text-text-muted">
                                  {task.deadline && (
                                    <span className="flex items-center gap-1">
                                      <Calendar className="h-3.5 w-3.5" />
                                      Deadline: {formatDate(task.deadline)}
                                    </span>
                                  )}
                                  {task.assigned_agent && (
                                    <span className="flex items-center gap-1">
                                      <User className="h-3.5 w-3.5" />
                                      Assigned to: {task.assigned_agent}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Modal: New Goal */}
      <Dialog 
        open={isGoalModalOpen} 
        onClose={() => setIsGoalModalOpen(false)} 
        title="New Remediation Project"
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleCreateGoal} className="space-y-4">
          <Input 
            label="Goal Title" 
            placeholder="e.g. Enable backup encryption"
            value={newGoalTitle}
            onChange={(e) => setNewGoalTitle(e.target.value)}
            required
          />

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-text-secondary">
              Compliance Framework
            </label>
            <select
              value={newGoalFramework}
              onChange={(e) => setNewGoalFramework(e.target.value)}
              className="w-full rounded-xl border border-border-glass bg-[#0d2027] px-4 py-2.5 text-sm text-text-primary outline-none transition-all focus:border-primary/50"
            >
              <option value="ISO-27001">ISO 27001:2022 (ISMS)</option>
              <option value="SOC-2">SOC 2 Type II (Security)</option>
              <option value="ISO-27701">ISO 27701:2019 (Privacy)</option>
              <option value="NIST-800-53">NIST SP 800-53 R5</option>
              <option value="LGPD">LGPD (Privacy)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-text-secondary">
              Description
            </label>
            <textarea
              placeholder="Describe the scope and purpose of this remediation project..."
              value={newGoalDesc}
              onChange={(e) => setNewGoalDesc(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-border-glass bg-white/5 px-4 py-2.5 text-sm text-text-primary outline-none transition-all duration-300 placeholder:text-text-muted focus:border-primary/50 focus:bg-white/[0.07] focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-white/5">
            <Button variant="ghost" type="button" onClick={() => setIsGoalModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={goalModalLoading}>
              Create Project
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Modal: New Task */}
      <Dialog 
        open={isTaskModalOpen} 
        onClose={() => setIsTaskModalOpen(false)} 
        title="Add New Technical Task"
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleCreateTask} className="space-y-4">
          <Input 
            label="Task Title" 
            placeholder="e.g. Provision KMS keys"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            required
          />

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-text-secondary">
              Assigned AI Agent
            </label>
            <select
              value={newTaskAgent}
              onChange={(e) => setNewTaskAgent(e.target.value)}
              className="w-full rounded-xl border border-border-glass bg-[#0d2027] px-4 py-2.5 text-sm text-text-primary outline-none transition-all focus:border-primary/50"
            >
              <option value="Compliance Agent">Compliance Agent</option>
              <option value="Privacy Agent">Privacy Agent</option>
              <option value="SOC Agent">SOC Agent</option>
              <option value="Document Agent">Document Agent</option>
            </select>
          </div>

          <Input 
            label="Completion Deadline" 
            type="date"
            value={newTaskDeadline}
            onChange={(e) => setNewTaskDeadline(e.target.value)}
          />

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-text-secondary">
              Technical Specifications
            </label>
            <textarea
              placeholder="Technical details of the remediation task..."
              value={newTaskDesc}
              onChange={(e) => setNewTaskDesc(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-border-glass bg-white/5 px-4 py-2.5 text-sm text-text-primary outline-none transition-all duration-300 placeholder:text-text-muted focus:border-primary/50 focus:bg-white/[0.07] focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-white/5">
            <Button variant="ghost" type="button" onClick={() => setIsTaskModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={taskModalLoading}>
              Save Task
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

