import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { NAV_GROUPS, NAV_ITEMS, isNavItemActive } from '@/lib/dashboard/navigation';

describe('the navigation is a well-formed structure', () => {
  it('gives every item exactly one group', () => {
    const flattened = NAV_GROUPS.flatMap((g) => g.items);
    expect(flattened).toHaveLength(NAV_ITEMS.length);
    const hrefs = flattened.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('has no empty group', () => {
    for (const group of NAV_GROUPS) {
      expect(group.items.length).toBeGreaterThan(0);
    }
  });

  it('points every item at a route that exists', () => {
    // The test that catches a rename breaking a link. A nav entry is a promise
    // that a page is there; nothing else in the build checks it.
    const appDir = join(process.cwd(), 'src', 'app', '(dashboard)');
    for (const item of NAV_ITEMS) {
      const segment = item.href === '/' ? '' : item.href;
      const candidate = join(appDir, segment, 'page.tsx');
      expect(existsSync(candidate), `${item.label} -> ${item.href} has no page.tsx`).toBe(true);
    }
  });
});

describe('active-route resolution prefers the longest match', () => {
  it('marks the deepest matching item and not its parent', () => {
    // /compliance/scrms must light Partner Requirements and leave Frameworks dark.
    expect(isNavItemActive('/compliance/scrms', '/compliance/scrms', NAV_ITEMS)).toBe(true);
    expect(isNavItemActive('/compliance', '/compliance/scrms', NAV_ITEMS)).toBe(false);
  });

  it('marks a parent when nothing deeper matches', () => {
    expect(isNavItemActive('/compliance', '/compliance', NAV_ITEMS)).toBe(true);
  });

  it('never lights the root for a nested path', () => {
    expect(isNavItemActive('/', '/documents', NAV_ITEMS)).toBe(false);
    expect(isNavItemActive('/', '/', NAV_ITEMS)).toBe(true);
  });
});
