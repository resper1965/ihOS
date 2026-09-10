import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSupabaseServer, mockSupabaseAdmin } from '../setup';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

/**
 * Shapes mockSupabaseAdmin so `from('profiles')` answers three different
 * queries the action makes: reading the target's current role, counting how
 * many admins exist, and performing the update.
 */
function adminTableWith(opts: {
  targetRole?: string | null;
  adminCount?: number;
  updateError?: { message: string } | null;
}) {
  const update = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: opts.updateError ?? null }),
  });

  mockSupabaseAdmin.from.mockImplementation(() => ({
    select: (_cols: string, options?: { count?: string; head?: boolean }) => {
      if (options?.head) {
        // The admin head-count.
        return { eq: vi.fn().mockResolvedValue({ count: opts.adminCount ?? 0, error: null }) };
      }
      // The target's current role.
      return {
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: opts.targetRole === undefined ? null : { role: opts.targetRole },
            error: null,
          }),
        }),
      };
    },
    update,
  }));

  return { update };
}

/** Makes the CALLER (not the target) an admin, or not. */
function callerIs(role: string | null, userId: string | null = 'caller-1') {
  mockSupabaseServer.auth.getUser.mockResolvedValue({
    data: { user: userId ? { id: userId, email: 'caller@ionic.health' } : null },
    error: null,
  });
  mockSupabaseServer.from.mockReturnThis();
  mockSupabaseServer.select.mockReturnThis();
  mockSupabaseServer.eq.mockReturnThis();
  mockSupabaseServer.single.mockResolvedValue({ data: role ? { role } : null, error: null });
}

describe('updateUserRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refuses a caller with no session', async () => {
    callerIs(null, null);
    adminTableWith({});
    const { updateUserRole } = await import('@/app/(dashboard)/admin/users/actions');
    await expect(updateUserRole('target-1', 'ionic_user')).rejects.toThrow(/Unauthorized/i);
  });

  it('refuses a signed-in caller who is not an admin', async () => {
    // The argument comes from the client. Being logged in is not the gate.
    callerIs('ionic_user');
    adminTableWith({});
    const { updateUserRole } = await import('@/app/(dashboard)/admin/users/actions');
    await expect(updateUserRole('target-1', 'admin')).rejects.toThrow(/Forbidden/i);
  });

  it('refuses a role that is not on the list', async () => {
    // A server action's argument is whatever the caller sends. Anything not in
    // the whitelist has to be refused before it reaches the database, or the
    // role column becomes free text and every role check downstream silently
    // stops matching.
    callerIs('admin');
    const { update } = adminTableWith({ targetRole: 'ionic_user', adminCount: 3 });
    const { updateUserRole } = await import('@/app/(dashboard)/admin/users/actions');
    await expect(updateUserRole('target-1', 'superadmin')).rejects.toThrow(/superadmin/);
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses to demote the last admin', async () => {
    // One click would otherwise lock User Management for everyone, and the only
    // way back in is editing profiles directly in Supabase.
    callerIs('admin');
    const { update } = adminTableWith({ targetRole: 'admin', adminCount: 1 });
    const { updateUserRole } = await import('@/app/(dashboard)/admin/users/actions');
    await expect(updateUserRole('the-only-admin', 'ionic_user')).rejects.toThrow(/last admin/i);
    expect(update).not.toHaveBeenCalled();
  });

  it('allows demoting an admin when another one remains', async () => {
    callerIs('admin');
    const { update } = adminTableWith({ targetRole: 'admin', adminCount: 2 });
    const { updateUserRole } = await import('@/app/(dashboard)/admin/users/actions');
    await updateUserRole('one-of-two', 'ionic_user');
    expect(update).toHaveBeenCalledWith({ role: 'ionic_user' });
  });

  it('writes a valid role change', async () => {
    callerIs('admin');
    const { update } = adminTableWith({ targetRole: 'ionic_user', adminCount: 2 });
    const { updateUserRole } = await import('@/app/(dashboard)/admin/users/actions');
    await updateUserRole('target-1', 'client_user');
    expect(update).toHaveBeenCalledWith({ role: 'client_user' });
  });

  it('does not count admins when the new role is admin', async () => {
    // Promoting cannot reduce the admin population, so the guard must not run.
    callerIs('admin');
    const { update } = adminTableWith({ targetRole: 'ionic_user', adminCount: 1 });
    const { updateUserRole } = await import('@/app/(dashboard)/admin/users/actions');
    await updateUserRole('target-1', 'admin');
    expect(update).toHaveBeenCalledWith({ role: 'admin' });
  });
});

describe('setUserPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** Gives mockSupabaseAdmin the auth.admin surface this action needs. */
  function withAuthAdmin(error: { message: string } | null = null) {
    const updateUserById = vi.fn().mockResolvedValue({ data: {}, error });
    (mockSupabaseAdmin as unknown as { auth: { admin: unknown } }).auth = {
      ...(mockSupabaseAdmin as unknown as { auth: object }).auth,
      admin: { updateUserById },
    };
    return { updateUserById };
  }

  it('refuses a caller who is not an admin', async () => {
    callerIs('ionic_user');
    const { updateUserById } = withAuthAdmin();
    const { setUserPassword } = await import('@/app/(dashboard)/admin/users/actions');
    await expect(setUserPassword('target-1', 'umaSenhaLonga1')).rejects.toThrow(/Forbidden/i);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it('refuses a password shorter than the self-service floor', async () => {
    // The admin path must not become the back door for weak passwords that the
    // self-service form refuses.
    callerIs('admin');
    const { updateUserById } = withAuthAdmin();
    const { setUserPassword } = await import('@/app/(dashboard)/admin/users/actions');
    await expect(setUserPassword('target-1', 'curta')).rejects.toThrow(/8/);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it('refuses an empty password', async () => {
    callerIs('admin');
    const { updateUserById } = withAuthAdmin();
    const { setUserPassword } = await import('@/app/(dashboard)/admin/users/actions');
    await expect(setUserPassword('target-1', '')).rejects.toThrow();
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it('refuses an admin setting their OWN password through this path', async () => {
    // The self-service form re-authenticates before changing anything; this
    // path asks for nothing. Without this guard, whoever reaches a live admin
    // session changes the owner's password without ever knowing it, and that
    // re-authentication becomes decorative.
    callerIs('admin', 'caller-1');
    const { updateUserById } = withAuthAdmin();
    const { setUserPassword } = await import('@/app/(dashboard)/admin/users/actions');
    await expect(setUserPassword('caller-1', 'umaSenhaLonga1')).rejects.toThrow(/own password/i);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it('sets the password for another user', async () => {
    callerIs('admin', 'caller-1');
    const { updateUserById } = withAuthAdmin();
    const { setUserPassword } = await import('@/app/(dashboard)/admin/users/actions');
    await setUserPassword('target-1', 'umaSenhaLonga1');
    expect(updateUserById).toHaveBeenCalledWith('target-1', { password: 'umaSenhaLonga1' });
  });

  it('surfaces a failure from Supabase instead of reporting success', async () => {
    callerIs('admin', 'caller-1');
    withAuthAdmin({ message: 'password is too weak for this project' });
    const { setUserPassword } = await import('@/app/(dashboard)/admin/users/actions');
    await expect(setUserPassword('target-1', 'umaSenhaLonga1')).rejects.toThrow(/too weak/);
  });
});
