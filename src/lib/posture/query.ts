// src/lib/posture/query.ts
// Query parsing for the posture route, kept out of route.ts: Next's route
// type-checker (checkFields<Diff<{ GET?, POST?, ..., dynamic?, revalidate?,
// ... }, TEntry>>, generated into .next/types) fails the build if a
// route.ts exports anything outside the HTTP-method / route-segment-config
// allowlist. This function lived in the route file and only escaped
// detection because next.config.ts sets typescript.ignoreBuildErrors.

export function parsePostureQuery(url: URL): {
  controlCodes: string[];
  versionId: string | null;
} {
  const raw = url.searchParams.get('controls') ?? '';
  const codes = raw
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  return {
    controlCodes: [...new Set(codes)],
    versionId: url.searchParams.get('versionId'),
  };
}
