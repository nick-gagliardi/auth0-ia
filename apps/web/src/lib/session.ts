import { auth } from "@/lib/auth";
import { getUserWithDecryptedCreds, type UserWithDecryptedCreds } from "@/lib/db";

export interface SessionUser {
  session: NonNullable<Awaited<ReturnType<typeof auth>>>;
  user: UserWithDecryptedCreds;
}

/**
 * Helper function to require authentication in API routes
 * Throws an error if user is not authenticated
 * Returns session and user with decrypted credentials
 *
 * @param includeAnthropicKey - Whether to include Anthropic API key (optional)
 * @returns Session and user with decrypted credentials
 * @throws Error if user is not authenticated or user not found in database
 */
export async function requireSession(includeAnthropicKey = false): Promise<SessionUser> {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized - no active session');
  }

  const user = await getUserWithDecryptedCreds(session.user.id, includeAnthropicKey);

  if (!user) {
    throw new Error('User not found in database');
  }

  return { session, user };
}

/**
 * Get the current session without throwing an error
 * Useful for optional authentication scenarios
 *
 * @returns Session and user, or null if not authenticated
 */
export async function getOptionalSession(): Promise<SessionUser | null> {
  try {
    return await requireSession();
  } catch {
    return null;
  }
}

/**
 * Check if user has configured their Anthropic API key
 *
 * @param userId - User ID to check
 * @returns True if user has configured Anthropic key
 */
export async function hasAnthropicKey(userId: string): Promise<boolean> {
  try {
    const user = await getUserWithDecryptedCreds(userId, true);
    return !!user?.anthropic_api_key_decrypted;
  } catch {
    return false;
  }
}
