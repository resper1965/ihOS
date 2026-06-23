// tests/setup.ts
// Global test setup — runs before each test suite via vitest setupFiles.
// Provides mock factories for Supabase, AI SDK, and OpenAI modules.

process.env.GRC_FALLBACK_DISABLED = 'true';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fake.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'fake-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
process.env.STANDARD_GRC_API_URL = 'https://fake-grc.api';
process.env.STANDARD_GRC_API_KEY = 'fake-grc-key';
process.env.OPENAI_API_KEY = 'fake-openai-key';

import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

/**
 * Creates a chainable Supabase client mock. Every query-builder method
 * returns `this` so tests can write `.from('x').select('*').eq('id', 1)`
 * without crashing.
 */
export function createMockSupabaseClient() {
  const client: Record<string, any> = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'test-user-id', email: 'test@example.com' } },
        error: null,
      }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ data: { path: 'test' }, error: null }),
        download: vi.fn().mockResolvedValue({ data: new Blob(), error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/test' } }),
      }),
    },
  };

  return client;
}

// ---------------------------------------------------------------------------
// Shared Mock Instances
// ---------------------------------------------------------------------------

const mockSupabaseServer = createMockSupabaseClient();
const mockSupabaseAdmin = createMockSupabaseClient();

// ---------------------------------------------------------------------------
// Module Mocks
// ---------------------------------------------------------------------------

// Mock: @/lib/supabase/server
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabaseServer),
}));

// Mock: @/lib/supabase/admin
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => mockSupabaseAdmin),
}));

// Mock: ai (Vercel AI SDK)
vi.mock('ai', () => ({
  embed: vi.fn().mockResolvedValue({
    embedding: new Array(1536).fill(0),
    usage: { tokens: 10 },
  }),
  embedMany: vi.fn().mockResolvedValue({
    embeddings: [new Array(1536).fill(0)],
    usage: { tokens: 10 },
  }),
  generateText: vi.fn().mockResolvedValue({
    text: 'Mock generated text response.',
    usage: { promptTokens: 50, completionTokens: 30 },
    finishReason: 'stop',
  }),
  streamText: vi.fn().mockReturnValue({
    textStream: (async function* () {
      yield 'Mock ';
      yield 'streamed ';
      yield 'response.';
    })(),
    text: Promise.resolve('Mock streamed response.'),
  }),
  tool: vi.fn((definition: any) => definition),
  generateObject: vi.fn(),
}));

// Mock: @ai-sdk/openai
vi.mock('@ai-sdk/openai', () => {
  const openaiFactory = (model: string) => ({
    modelId: model,
    provider: 'openai',
  });
  // The source code calls `openai.embedding('text-embedding-3-small')`
  // and `openai('gpt-4o-mini')`, so openai must be both callable and have methods.
  openaiFactory.embedding = (model: string) => ({
    modelId: model,
    provider: 'openai-embedding',
  });
  const createOpenAIFactory = () => openaiFactory;
  return { 
    openai: openaiFactory,
    createOpenAI: createOpenAIFactory 
  };
});

// Mock: @/lib/chat/rag-search
vi.mock('@/lib/chat/rag-search', () => ({
  searchDocuments: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/standard-api/client', () => {
  class MockStandardApiClientError extends Error {
    public readonly code: string;
    public readonly status: number;
    public readonly details?: Record<string, unknown>;

    constructor(message: string, code: string, status: number, details?: Record<string, unknown>) {
      super(message);
      this.name = "StandardApiClientError";
      this.code = code;
      this.status = status;
      this.details = details;
    }
  }

  return {
    StandardApiClientError: MockStandardApiClientError,
    complianceScore: vi.fn().mockResolvedValue({
      score: 73.5,
      overall_score: 73.5,
      total_required_controls: 120,
      scf_controls_implemented_count: 78,
      missing_controls: [],
    }),
    crossCoverage: vi.fn().mockResolvedValue({
      source_framework: 'soc2',
      target_framework: 'iso27001',
      overlap_percentage: 37.5,
      coverage_percentage: 37.5,
      mapped_controls: [],
      gaps: [],
    }),
    blastRadius: vi.fn().mockResolvedValue({
      control_id: 'CC6.1',
      affected_frameworks: [],
      total_affected_controls: 0,
      risk_summary: '',
    }),
    roiPath: vi.fn().mockResolvedValue({}),
    evaluateEvidence: vi.fn().mockResolvedValue({}),
    translateRisk: vi.fn().mockResolvedValue({}),
    triageIncident: vi.fn().mockResolvedValue({}),
    scanVendorContract: vi.fn().mockResolvedValue({}),
    council: vi.fn().mockResolvedValue({}),
  };
});

// Mock: next/server (NextResponse)
vi.mock('next/server', () => {
  class MockNextResponse {
    body: any;
    status: number;
    headers: Map<string, string>;

    constructor(body: any, init?: { status?: number; headers?: Record<string, string> }) {
      this.body = body;
      this.status = init?.status ?? 200;
      this.headers = new Map(Object.entries(init?.headers ?? {}));
    }

    async json() {
      return typeof this.body === 'string' ? JSON.parse(this.body) : this.body;
    }

    static json(data: any, init?: { status?: number; headers?: Record<string, string> }) {
      return new MockNextResponse(data, init);
    }
  }

  return {
    NextResponse: MockNextResponse,
    NextRequest: vi.fn(),
  };
});

// Mock: next/headers
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: vi.fn().mockReturnValue([]),
    set: vi.fn(),
  }),
  headers: vi.fn().mockReturnValue(new Map()),
}));

// Mock: pdf-parse
vi.mock('pdf-parse', () => {
  const MockPDFParse = vi.fn().mockImplementation(function(opts: any) {
    return {
      getText: vi.fn().mockResolvedValue({ text: '' }),
      destroy: vi.fn().mockResolvedValue(undefined),
    };
  });

  return {
    PDFParse: MockPDFParse,
    default: MockPDFParse,
  };
});

// ---------------------------------------------------------------------------
// Exports — for test files that need to customise mock behaviour
// ---------------------------------------------------------------------------

export {
  mockSupabaseServer,
  mockSupabaseAdmin,
};
