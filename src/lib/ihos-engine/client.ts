// src/lib/ihos-engine/client.ts
// HTTP client for the ihos-api GRC Engine.

import type {
  GenerateRequest,
  ReviewRequest,
  FmeaCorrelateRequest,
  SearchRequest,
  GapDetectRequest,
  EvidenceEvaluateRequest,
  ThreatModel,
  SearchResult,
  Gap,
  Recommendation,
  HealthResponse,
} from './types';

const ENGINE_URL = process.env.IHOS_ENGINE_URL || 'https://ihos-api.vercel.app';
const ENGINE_KEY = process.env.IHOS_ENGINE_API_KEY || '';

class IhosEngineError extends Error {
  constructor(
    message: string,
    public status: number,
    public detail?: string
  ) {
    super(message);
    this.name = 'IhosEngineError';
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${ENGINE_URL}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(ENGINE_KEY && { 'X-Engine-Key': ENGINE_KEY }),
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new IhosEngineError(
      body.error || `Engine request failed: ${res.status}`,
      res.status,
      body.detail
    );
  }

  return res.json() as Promise<T>;
}

export const ihosEngine = {
  // Health
  health: () => request<HealthResponse>('/api/health'),

  // Threat Modeling
  generateThreatModel: (data: GenerateRequest) =>
    request<ThreatModel>('/api/threat-model/generate', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getThreatModel: (modelId: string) =>
    request<ThreatModel>(`/api/threat-model/${modelId}`),

  reviewThreatModel: (modelId: string, data: ReviewRequest) =>
    request<ThreatModel>(`/api/threat-model/${modelId}/review`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  correlateFmea: (modelId: string, data: FmeaCorrelateRequest) =>
    request<Record<string, unknown>>(
      `/api/threat-model/${modelId}/correlate-fmea`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    ),

  // RAG Search
  search: (data: SearchRequest) =>
    request<{ results: SearchResult[]; total: number }>('/api/search', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Gap Detection
  detectGaps: (data: GapDetectRequest) =>
    request<{ gaps: Gap[]; summary: Record<string, number> }>(
      '/api/gaps/detect',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    ),

  generateGapReport: (data: GapDetectRequest) =>
    request<{ report: string; gaps: Gap[]; recommendations: Recommendation[] }>(
      '/api/gaps/report',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    ),

  // Recommendations
  getRecommendations: (data: GapDetectRequest) =>
    request<{ recommendations: Recommendation[] }>('/api/recommendations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Evidence
  evaluateEvidence: (data: EvidenceEvaluateRequest) =>
    request<Record<string, unknown>>('/api/evidence/evaluate', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
} as const;

export { IhosEngineError };
export type { GenerateRequest, ReviewRequest, SearchRequest, ThreatModel, SearchResult, Gap, Recommendation };
