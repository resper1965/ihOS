import { describe, it, expect } from 'vitest';
import {
  getProfile,
  getAllProfiles,
  DEFAULT_PROFILE_ID,
  profiles,
} from '@/lib/agents/profiles';
import type { AgentProfileId } from '@/lib/agents/types';

// ---------------------------------------------------------------------------
// DEFAULT_PROFILE_ID
// ---------------------------------------------------------------------------
describe('DEFAULT_PROFILE_ID', () => {
  it('is set to "compliance"', () => {
    expect(DEFAULT_PROFILE_ID).toBe('compliance');
  });
});

// ---------------------------------------------------------------------------
// getProfile
// ---------------------------------------------------------------------------
describe('getProfile', () => {
  const allIds: AgentProfileId[] = ['compliance', 'privacy', 'soc', 'executive', 'document'];

  it.each(allIds)('returns a valid profile for "%s"', (id) => {
    const profile = getProfile(id);
    expect(profile).toBeDefined();
    expect(profile.id).toBe(id);
    expect(typeof profile.name).toBe('string');
    expect(profile.name.length).toBeGreaterThan(0);
    expect(typeof profile.description).toBe('string');
    expect(profile.description.length).toBeGreaterThan(0);
    expect(typeof profile.systemPrompt).toBe('string');
    expect(profile.systemPrompt.length).toBeGreaterThan(0);
    expect(typeof profile.maxSteps).toBe('number');
    expect(profile.maxSteps).toBeGreaterThan(0);
  });

  it('returns compliance profile with correct name', () => {
    const profile = getProfile('compliance');
    expect(profile.name).toBe('Compliance Agent');
  });

  it('returns privacy profile with correct name', () => {
    const profile = getProfile('privacy');
    expect(profile.name).toBe('Privacy Agent');
  });

  it('returns soc profile with correct name', () => {
    const profile = getProfile('soc');
    expect(profile.name).toBe('SOC Agent');
  });

  it('returns executive profile with correct name', () => {
    const profile = getProfile('executive');
    expect(profile.name).toBe('Executive Agent');
  });

  it('returns document profile with correct name', () => {
    const profile = getProfile('document');
    expect(profile.name).toBe('Document Agent');
  });

  it('returns undefined for an unknown profile id', () => {
    // @ts-expect-error — testing invalid id
    const profile = getProfile('nonexistent');
    expect(profile).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getAllProfiles
// ---------------------------------------------------------------------------
describe('getAllProfiles', () => {
  it('returns all 5 profiles', () => {
    const all = getAllProfiles();
    expect(all).toHaveLength(5);
  });

  it('returns an array of AgentProfile objects', () => {
    const all = getAllProfiles();
    for (const profile of all) {
      expect(profile).toHaveProperty('id');
      expect(profile).toHaveProperty('name');
      expect(profile).toHaveProperty('description');
      expect(profile).toHaveProperty('systemPrompt');
      expect(profile).toHaveProperty('maxSteps');
    }
  });

  it('includes all expected profile IDs', () => {
    const all = getAllProfiles();
    const ids = all.map((p) => p.id);
    expect(ids).toContain('compliance');
    expect(ids).toContain('privacy');
    expect(ids).toContain('soc');
    expect(ids).toContain('executive');
    expect(ids).toContain('document');
  });

  it('each profile has maxSteps set to 5', () => {
    const all = getAllProfiles();
    for (const profile of all) {
      expect(profile.maxSteps).toBe(5);
    }
  });

  it('system prompts are non-trivial (>100 chars)', () => {
    const all = getAllProfiles();
    for (const profile of all) {
      expect(profile.systemPrompt.length).toBeGreaterThan(100);
    }
  });
});

// ---------------------------------------------------------------------------
// profiles registry export
// ---------------------------------------------------------------------------
describe('profiles registry', () => {
  it('is a Record with 5 keys', () => {
    expect(Object.keys(profiles)).toHaveLength(5);
  });

  it('keys match profile ids', () => {
    for (const [key, profile] of Object.entries(profiles)) {
      expect(key).toBe(profile.id);
    }
  });
});
