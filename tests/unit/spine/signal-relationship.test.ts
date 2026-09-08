import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260909000001_signal_relationship_type.sql'),
  'utf8',
);

describe('an observed signal records how its control relates to the requirement', () => {
  it('adds a nullable relationship_type', () => {
    // Nullable because the vendor records no relationship for a large share of
    // the crosswalk, and because every row that already exists predates this.
    expect(sql).toMatch(/ALTER TABLE\s+public\.runtime_control_signals/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS\s+relationship_type\s+VARCHAR\s+NULL/i);
  });

  it('constrains it to the vocabulary the crosswalk uses, minus no_relation', () => {
    // no_relation never reaches this table: the resolver drops it, because a
    // signal on a control the crosswalk says is unrelated is not a signal.
    expect(sql).toMatch(/CHECK/i);
    for (const v of ['equal', 'subset', 'superset', 'intersects']) {
      expect(sql).toContain(`'${v}'`);
    }
    expect(sql).not.toContain(`'no_relation'`);
  });
});
