// src/lib/integrations/defectdojo/client.ts
// Direct API client for DefectDojo vulnerability management platform.

// ── Interfaces ───────────────────────────────────────────────────────────────

export interface DDPaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
  prefetch?: Record<string, unknown>;
}

export interface DDProduct {
  id: number;
  name: string;
  description: string;
  prod_type: number;
  created: string;
  updated: string;
  findings_count: number;
  tags: string[];
}

export interface DDFinding {
  id: number;
  title: string;
  description: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';
  active: boolean;
  verified: boolean;
  is_mitigated: boolean;
  mitigation: string | null;
  cwe: number | null;
  cvssv3: string | null;
  risk_accepted: boolean;
  test: number;
  created: string;
  sla_days_remaining: number | null;
}

export interface DDRiskAcceptance {
  id: number;
  name: string;
  recommendation: string;
  decision: string;
  accepted_by: string | null;
  expiration_date: string | null;
  accepted_findings: number[];
  created: string;
  updated: string;
}

export interface DDEngagement {
  id: number;
  name: string;
  description: string;
  target_start: string;
  target_end: string;
  status: string;
  product: number;
  engagement_type: string;
  created: string;
  updated: string;
}

// ── Client ───────────────────────────────────────────────────────────────────

export class DefectDojoClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    // Strip trailing slash for consistent URL construction
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
  }

  /**
   * Authenticated request helper. All DefectDojo API v2 endpoints
   * require `Authorization: Token <apiKey>`.
   */
  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v2${path}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Token ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(options.headers as Record<string, string> | undefined),
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '<no body>');
      throw new Error(
        `DefectDojo API error: ${response.status} ${response.statusText} – ${body}`,
      );
    }

    return response.json() as Promise<T>;
  }

  // ── Products ─────────────────────────────────────────────────────────────

  async getProducts(): Promise<DDPaginatedResponse<DDProduct>> {
    return this.request<DDPaginatedResponse<DDProduct>>('/products/?limit=100');
  }

  // ── Findings ─────────────────────────────────────────────────────────────

  async getFindings(params?: {
    active?: boolean;
    verified?: boolean;
    product_id?: number;
    severity?: string;
    limit?: number;
    offset?: number;
  }): Promise<DDPaginatedResponse<DDFinding>> {
    const searchParams = new URLSearchParams();
    if (params?.active !== undefined) searchParams.set('active', String(params.active));
    if (params?.verified !== undefined) searchParams.set('verified', String(params.verified));
    if (params?.product_id !== undefined) searchParams.set('test__engagement__product', String(params.product_id));
    if (params?.severity) searchParams.set('severity', params.severity);
    searchParams.set('limit', String(params?.limit ?? 200));
    if (params?.offset !== undefined) searchParams.set('offset', String(params.offset));

    const qs = searchParams.toString();
    return this.request<DDPaginatedResponse<DDFinding>>(`/findings/?${qs}`);
  }

  // ── Risk Acceptances ─────────────────────────────────────────────────────

  async getRiskAcceptances(
    engagementId?: number,
  ): Promise<DDPaginatedResponse<DDRiskAcceptance>> {
    const params = new URLSearchParams({ limit: '100' });
    if (engagementId !== undefined) {
      params.set('engagement', String(engagementId));
    }
    return this.request<DDPaginatedResponse<DDRiskAcceptance>>(
      `/risk_acceptance/?${params.toString()}`,
    );
  }

  // ── Engagements ──────────────────────────────────────────────────────────

  async getEngagements(
    productId?: number,
  ): Promise<DDPaginatedResponse<DDEngagement>> {
    const params = new URLSearchParams({ limit: '100' });
    if (productId !== undefined) {
      params.set('product', String(productId));
    }
    return this.request<DDPaginatedResponse<DDEngagement>>(
      `/engagements/?${params.toString()}`,
    );
  }

  // ── Summary ──────────────────────────────────────────────────────────────

  /**
   * Returns a severity-grouped count summary for a product.
   * Uses the findings endpoint with grouping to build the summary.
   */
  async getFindingsSummary(
    productId: number,
  ): Promise<Record<string, number>> {
    const severities = ['Critical', 'High', 'Medium', 'Low', 'Info'] as const;
    const summary: Record<string, number> = {};

    // Fetch count per severity in parallel
    const results = await Promise.all(
      severities.map(async (severity) => {
        const res = await this.getFindings({
          product_id: productId,
          active: true,
          severity,
          limit: 1, // We only need the count
        });
        return { severity, count: res.count };
      }),
    );

    for (const { severity, count } of results) {
      summary[severity] = count;
    }

    return summary;
  }
}

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates a DefectDojo client from environment variables.
 *
 * Required env vars:
 *  - DEFECTDOJO_URL   – Base URL of the DefectDojo instance
 *  - DEFECTDOJO_API_KEY – API token for authentication
 *
 * Returns `null` if the env vars are not configured.
 */
export function createDefectDojoClient(): DefectDojoClient | null {
  const baseUrl = process.env.DEFECTDOJO_URL;
  const apiKey = process.env.DEFECTDOJO_API_KEY;

  if (!baseUrl || !apiKey) {
    return null;
  }

  return new DefectDojoClient(baseUrl, apiKey);
}
