import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.unmock('@/lib/standard-api/client');

import { StandardApiClientError } from '@/lib/standard-api/client';

// ---------------------------------------------------------------------------
// StandardApiClientError
// ---------------------------------------------------------------------------
describe('StandardApiClientError', () => {
  it('creates an error with all properties', () => {
    const err = new StandardApiClientError('Test error', 'TEST_CODE', 400, {
      field: 'value',
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(StandardApiClientError);
    expect(err.message).toBe('Test error');
    expect(err.code).toBe('TEST_CODE');
    expect(err.status).toBe(400);
    expect(err.details).toEqual({ field: 'value' });
    expect(err.name).toBe('StandardApiClientError');
  });

  it('creates an error without details', () => {
    const err = new StandardApiClientError('No details', 'NO_DETAIL', 500);
    expect(err.message).toBe('No details');
    expect(err.code).toBe('NO_DETAIL');
    expect(err.status).toBe(500);
    expect(err.details).toBeUndefined();
  });

  it('inherits from Error prototype', () => {
    const err = new StandardApiClientError('Test', 'CODE', 0);
    expect(err.stack).toBeDefined();
    expect(err instanceof Error).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getConfig validation (via module re-import with env control)
// ---------------------------------------------------------------------------
describe('getConfig (via complianceScore)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('throws when STANDARD_GRC_API_URL is missing', async () => {
    delete process.env.STANDARD_GRC_API_URL;
    delete process.env.STANDARD_GRC_API_KEY;
    const client = await import('@/lib/standard-api/client');

    await expect(
      client.complianceScore({ framework_code: 'soc2' })
    ).rejects.toThrow('Missing STANDARD_GRC_API_URL environment variable.');
  });

  it('throws when STANDARD_GRC_API_KEY is missing', async () => {
    process.env.STANDARD_GRC_API_URL = 'https://api.test.com';
    delete process.env.STANDARD_GRC_API_KEY;
    const client = await import('@/lib/standard-api/client');

    await expect(
      client.complianceScore({ framework_code: 'soc2' })
    ).rejects.toThrow('Missing STANDARD_GRC_API_KEY environment variable.');
  });
});

// ---------------------------------------------------------------------------
// HTTP calls with mocked fetch
// ---------------------------------------------------------------------------
describe('API client with mocked fetch', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env.STANDARD_GRC_API_URL = 'https://api.test.com/v1';
    process.env.STANDARD_GRC_API_KEY = 'test-api-key';
    process.env.STANDARD_GRC_TENANT_ID = 'test-tenant';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('makes a POST request and returns data on success', async () => {
    const mockData = {
      framework_code: 'soc2',
      overall_score: 85,
      control_scores: [],
      assessed_at: '2024-01-01T00:00:00Z',
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: mockData }),
      })
    );

    const client = await import('@/lib/standard-api/client');
    const result = await client.complianceScore({
      framework_code: 'soc2',
    });

    expect(result).toEqual(mockData);
    expect(fetch).toHaveBeenCalledOnce();

    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://api.test.com/v1/intelligence/compliance-score');
    expect(options.method).toBe('POST');
    expect(options.headers['Authorization']).toBe('Bearer test-api-key');
    expect(options.headers['Content-Type']).toBe('application/json');
  });

  it('injects tenant_id into the request body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: {} }),
      })
    );

    const client = await import('@/lib/standard-api/client');
    await client.complianceScore({ framework_code: 'soc2' });

    const [, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.tenant_id).toBe('test-tenant');
  });

  it('does not override existing tenant_id in request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: {} }),
      })
    );

    const client = await import('@/lib/standard-api/client');
    await client.complianceScore({
      framework_code: 'soc2',
      tenant_id: 'custom-tenant',
    });

    const [, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.tenant_id).toBe('custom-tenant');
  });

  it('throws StandardApiClientError on HTTP error response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        json: async () => ({
          success: false,
          data: null,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid framework code',
            details: { field: 'framework_code' },
          },
        }),
      })
    );

    const client = await import('@/lib/standard-api/client');

    try {
      await client.complianceScore({ framework_code: 'invalid' });
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(client.StandardApiClientError);
      const apiErr = err as InstanceType<typeof client.StandardApiClientError>;
      expect(apiErr.code).toBe('VALIDATION_ERROR');
      expect(apiErr.message).toBe('Invalid framework code');
      expect(apiErr.status).toBe(422);
      expect(apiErr.details).toEqual({ field: 'framework_code' });
    }
  });

  it('throws StandardApiClientError with fallback on HTTP error without error body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ success: false, data: null }),
      })
    );

    const client = await import('@/lib/standard-api/client');

    try {
      await client.complianceScore({ framework_code: 'soc2' });
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(client.StandardApiClientError);
      const apiErr = err as InstanceType<typeof client.StandardApiClientError>;
      expect(apiErr.code).toBe('HTTP_500');
      expect(apiErr.status).toBe(500);
    }
  });

  it('throws NETWORK_ERROR on fetch failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    );

    const client = await import('@/lib/standard-api/client');

    try {
      await client.complianceScore({ framework_code: 'soc2' });
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(client.StandardApiClientError);
      const apiErr = err as InstanceType<typeof client.StandardApiClientError>;
      expect(apiErr.code).toBe('NETWORK_ERROR');
      expect(apiErr.status).toBe(0);
      expect(apiErr.message).toBe('Failed to fetch');
    }
  });

  it('strips trailing slashes from base URL', async () => {
    process.env.STANDARD_GRC_API_URL = 'https://api.test.com/v1///';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: {} }),
      })
    );

    const client = await import('@/lib/standard-api/client');
    await client.complianceScore({ framework_code: 'soc2' });

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://api.test.com/v1/intelligence/compliance-score');
  });
});

// ---------------------------------------------------------------------------
// Public API method routing
// ---------------------------------------------------------------------------
describe('API methods call correct endpoints', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env.STANDARD_GRC_API_URL = 'https://api.test.com/v1';
    process.env.STANDARD_GRC_API_KEY = 'key';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  const setupFetchMock = () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: {} }),
      })
    );
  };

  it('crossCoverage posts to /cross-coverage', async () => {
    setupFetchMock();
    const client = await import('@/lib/standard-api/client');
    await client.crossCoverage({
      source_framework: 'soc2',
      target_framework: 'iso27001',
    });
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/cross-coverage');
  });

  it('blastRadius posts to /blast-radius', async () => {
    setupFetchMock();
    const client = await import('@/lib/standard-api/client');
    await client.blastRadius({
      control_id: 'CC6.1',
      framework_code: 'soc2',
    });
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/blast-radius');
  });

  it('roiPath posts to /roi-path', async () => {
    setupFetchMock();
    const client = await import('@/lib/standard-api/client');
    await client.roiPath({ target_frameworks: ['soc2'] });
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/roi-path');
  });

  it('evaluateEvidence posts to /evaluate-evidence', async () => {
    setupFetchMock();
    const client = await import('@/lib/standard-api/client');
    await client.evaluateEvidence({
      control_id: 'CC6.1',
      controlRequirement: 'SOC 2 CC6.1 control requirement',
      evidenceDescription: 'test',
    });
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/evaluate-evidence');
  });

  it('translateRisk posts to /translate-risk', async () => {
    setupFetchMock();
    const client = await import('@/lib/standard-api/client');
    await client.translateRisk({
      risk_description: 'test',
      source_framework: 'soc2',
      target_audience: 'executive',
    });
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/translate-risk');
  });

  it('triageIncident posts to /triage-incident', async () => {
    setupFetchMock();
    const client = await import('@/lib/standard-api/client');
    await client.triageIncident({ incident_description: 'test' });
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/triage-incident');
  });

  it('scanVendorContract posts to /scan-vendor-contract', async () => {
    setupFetchMock();
    const client = await import('@/lib/standard-api/client');
    await client.scanVendorContract({
      contract_text: 'test',
      vendor_name: 'Acme',
    });
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/scan-vendor-contract');
  });

  it('council posts to /council', async () => {
    setupFetchMock();
    const client = await import('@/lib/standard-api/client');
    await client.council({ question: 'test' });
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/council');
  });
});
