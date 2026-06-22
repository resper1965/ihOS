// src/lib/chat/ai-telemetry.ts
// Shared telemetry configuration for all AI SDK calls.

/**
 * Base telemetry config for AI SDK experimental_telemetry.
 * Provides structured metadata for observability.
 */
export function getAITelemetry(functionId: string, extra?: Record<string, string>) {
  return {
    isEnabled: process.env.NODE_ENV === 'production',
    functionId,
    metadata: {
      app: 'ihOS',
      environment: process.env.NODE_ENV ?? 'development',
      ...extra,
    },
  };
}
