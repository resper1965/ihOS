// tests/unit/posture/migration-invariants.test.ts
// The spec's structural guarantees must live in the DDL, not in convention.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260820000001_posture_core.sql'),
  'utf8',
).toLowerCase();

describe('posture_core migration', () => {
  it('creates the three tables', () => {
    expect(sql).toContain('create table if not exists public.control_inventory');
    expect(sql).toContain('create table if not exists public.evidence_provenance');
    expect(sql).toContain('create table if not exists public.control_evidence');
  });

  it('constrains the evidence role to the two allowed values', () => {
    expect(sql).toMatch(/role\s+text\s+not null[\s\S]{0,80}check[\s\S]{0,40}'policy'[\s\S]{0,20}'operational'/);
  });

  it('makes one chunk-role pair unique per control and version', () => {
    expect(sql).toMatch(/unique\s*\(\s*scf_control_code\s*,\s*product_version_id\s*,\s*chunk_id\s*,\s*role\s*\)/);
  });

  it('makes a provenance claim unique per chunk and control', () => {
    expect(sql).toMatch(/unique\s*\(\s*chunk_id\s*,\s*scf_control_code\s*\)/);
  });

  it('constrains implementation_state to the four allowed values', () => {
    expect(sql).toMatch(/implementation_state[\s\S]{0,120}'not_applicable'/);
  });

  it('constrains the provenance method', () => {
    expect(sql).toMatch(/method[\s\S]{0,80}'vector'[\s\S]{0,30}'llm_confirmed'/);
  });

  it('enables row level security on all three tables', () => {
    const matches = sql.match(/enable row level security/g) ?? [];
    expect(matches.length).toBe(3);
  });

  it('enforces one role per chunk in both the null and non-null version cases', () => {
    // Two partial indexes, because a plain unique index over a nullable column
    // enforces nothing when that column is null — which is every backfilled row.
    expect(sql).toMatch(
      /unique index[\s\S]{0,80}control_evidence_one_role_per_chunk_global[\s\S]{0,120}where\s+product_version_id\s+is\s+null/,
    );
    expect(sql).toMatch(
      /unique index[\s\S]{0,80}control_evidence_one_role_per_chunk_versioned[\s\S]{0,140}where\s+product_version_id\s+is\s+not\s+null/,
    );
  });

  it('does not declare a verdict column anywhere — the verdict is derived', () => {
    // Matches a column declaration at the start of a line, so the DDL comments
    // are free to use the word.
    expect(sql).not.toMatch(/^\s*verdict\s+\w/m);
    expect(sql).not.toMatch(/^\s*combined_status\s+\w/m);
  });
});
