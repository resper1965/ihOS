import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

describe('the tool that manufactured the quarantined mappings is gone', () => {
  it('scripts/seed-mappings.js no longer exists', () => {
    // It read iso27001 and iso27701 and cloned them into other frameworks by
    // prefixing the requirement id (LGPD-A.8.24). Those clones are the 25,589
    // rows quarantined by migration 20260825000002. One invocation re-creates
    // them. Git history keeps it readable; the working tree must not.
    expect(existsSync(resolve(process.cwd(), 'scripts/seed-mappings.js'))).toBe(false);
  });

  it('no script clones one framework_code into another', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) { walk(full); continue; }
        if (!/\.(ts|js|cjs)$/.test(entry)) continue;
        const code = readFileSync(full, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^[ \t]*\/\/.*$/gm, '');
        // A literal framework_code assignment next to a template-string id is
        // the fabrication shape: `framework_code: 'X', target_control_id: \`Y-${...}\``
        if (/framework_code:\s*'[^']+'/.test(code) && /target_control_id:\s*`/.test(code)) {
          offenders.push(full);
        }
      }
    };
    walk(resolve(process.cwd(), 'scripts'));
    expect(offenders).toEqual([]);
  });
});
