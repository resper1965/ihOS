// tests/unit/posture/cron-methods.test.ts
// Vercel Cron invokes scheduled paths with GET. A route that exports POST only
// returns 405 on every schedule, silently, forever.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const SCHEDULED = [
  'sync-knowledge-base',
  'run-assessment',
  'defectdojo-sync',
  'run-threat-model',
  'recalibrate-scrms',
  'agentic-triggers',
];

function routeSource(name: string): string {
  const path = resolve(process.cwd(), 'src/app/api/cron', name, 'route.ts');
  expect(existsSync(path), `missing route file for ${name}`).toBe(true);
  return readFileSync(path, 'utf8');
}

describe('cron routes', () => {
  it('every path scheduled in vercel.json has a route file', () => {
    const vercel = JSON.parse(
      readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'),
    ) as { crons: Array<{ path: string }> };
    const scheduledPaths = vercel.crons.map((c) => c.path.replace('/api/cron/', ''));
    expect(scheduledPaths.sort()).toEqual([...SCHEDULED].sort());
  });

  it.each(SCHEDULED)('%s exports GET so Vercel Cron can invoke it', (name) => {
    expect(routeSource(name)).toMatch(/export\s+(async\s+)?function\s+GET\b/);
  });
});
