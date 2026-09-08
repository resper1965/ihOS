import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function sourceOf(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

describe('nothing in the product produces an estimated GRC figure', () => {
  const client = () => sourceOf('src/lib/standard-api/client.ts');

  it('has no local fallback dispatcher', () => {
    expect(client()).not.toMatch(/function\s+tryLocalFallback/);
    expect(client()).not.toMatch(/tryLocalFallback\s*\(/);
  });

  it('has no local estimators', () => {
    for (const fn of [
      'localEvaluateEvidence',
      'localComplianceScore',
      'localCrossCoverage',
      'localRoiPath',
      'localBlastRadius',
      'tryStaticCatalogFallback',
      'withEstimatedMarker',
    ]) {
      expect(client(), `${fn} must be gone`).not.toMatch(new RegExp(`function\\s+${fn}\\b`));
    }
  });

  it('reads none of the three fallback flags', () => {
    for (const flag of [
      'GRC_LOCAL_FALLBACK_ENABLED',
      'GRC_CRON_FALLBACK_ENABLED',
      'GRC_FALLBACK_DISABLED',
    ]) {
      expect(client(), `${flag} must no longer be read`).not.toContain(flag);
    }
  });

  it('still READS is_estimated, because past runs carry it', () => {
    // The field is a persisted historical fact about assessments already run.
    // Removing the producer must not erase the record.
    expect(sourceOf('src/lib/assessment/persistence.ts')).toMatch(/is_estimated|isEstimated/);
  });
});
