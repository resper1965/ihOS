// src/lib/agents/tool-registry.ts
// Maps agent profiles to their allowed subset of tools to reduce token usage.

import type { AgentProfileId } from './types';
import { agentTools } from './tools';
import { getComposioTools } from '@/lib/integrations/composio';

const {
  complianceScore, crossCoverage, blastRadius, searchDocuments,
  listFrameworks, getAssessmentStatus,
  createGoal, listGoals, updateGoalProgress,
  createTask, listTasks, updateTaskStatus,
  recordUserCorrection,
} = agentTools;

// Core tools shared by ALL profiles
const CORE_TOOLS = {
  searchDocuments,
  listFrameworks,
  recordUserCorrection,
} as const;

const PROFILE_TOOLS: Record<AgentProfileId, Record<string, unknown>> = {
  compliance: {
    ...CORE_TOOLS,
    complianceScore, crossCoverage, blastRadius, getAssessmentStatus,
    createGoal, listGoals, updateGoalProgress,
    createTask, listTasks, updateTaskStatus,
  },
  privacy: {
    ...CORE_TOOLS,
    complianceScore, crossCoverage,
    createGoal, listGoals, updateGoalProgress,
  },
  soc: {
    ...CORE_TOOLS,
    complianceScore, blastRadius, getAssessmentStatus,
    createGoal, listGoals, updateGoalProgress,
    createTask, listTasks, updateTaskStatus,
  },
  executive: {
    ...CORE_TOOLS,
    complianceScore, crossCoverage, getAssessmentStatus,
    listGoals,
  },
  document: {
    ...CORE_TOOLS,
    getAssessmentStatus,
    createGoal, listGoals,
  },
};

// Composio toolkits enabled per agent profile
const COMPOSIO_TOOLKITS_BY_PROFILE: Record<AgentProfileId, string[]> = {
  compliance: ['defectdojo', 'jira', 'github'],
  privacy: ['jira', 'github'],
  soc: ['defectdojo', 'jira', 'github'],
  executive: ['jira'],
  document: ['github'],
};

/**
 * Sync version — returns only local ihOS tools (no Composio).
 * Kept for backward compatibility.
 */
export function getLocalToolsForProfile(profileId: AgentProfileId) {
  return PROFILE_TOOLS[profileId] ?? PROFILE_TOOLS.compliance;
}

/**
 * Async version — merges ihOS tools with Composio tools when enabled.
 */
export async function getToolsForProfile(
  profileId: AgentProfileId,
  userId: string = 'anonymous',
  includeComposio: boolean = false,
): Promise<Record<string, unknown>> {
  const localTools = PROFILE_TOOLS[profileId] ?? PROFILE_TOOLS.compliance;

  if (!includeComposio) return localTools;

  const toolkits = COMPOSIO_TOOLKITS_BY_PROFILE[profileId];
  const composioTools = await getComposioTools(userId, toolkits);

  return { ...localTools, ...composioTools };
}
