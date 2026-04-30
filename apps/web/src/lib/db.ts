import { sql } from '@vercel/postgres';
import { decrypt, encrypt } from './encryption';

// Database types
export interface User {
  id: string;
  github_id: number;
  github_username: string;
  github_access_token_encrypted: string;
  github_token_expires_at?: Date | null;
  anthropic_api_key_encrypted?: string | null;
  github_pat_encrypted?: string | null;
  mintlify_api_key_encrypted?: string | null;
  mintlify_project_id_encrypted?: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface UserWithDecryptedCreds extends User {
  github_access_token_decrypted: string;
  anthropic_api_key_decrypted?: string | null;
  github_pat_decrypted?: string | null;
  mintlify_api_key_decrypted?: string | null;
  mintlify_project_id_decrypted?: string | null;
}

export interface Session {
  id: string;
  session_token: string;
  user_id: string;
  expires: Date;
  created_at: Date;
}

// Initialize database tables
export async function initializeDatabase() {
  try {
    // Create users table
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        github_id INTEGER UNIQUE NOT NULL,
        github_username TEXT UNIQUE NOT NULL,
        github_access_token_encrypted TEXT NOT NULL,
        github_token_expires_at TIMESTAMP,
        anthropic_api_key_encrypted TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;

    // Create indexes
    await sql`CREATE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_users_github_username ON users(github_username)`;

    // Create sessions table
    await sql`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        session_token TEXT UNIQUE NOT NULL,
        user_id TEXT NOT NULL,
        expires TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `;

    // Create indexes
    await sql`CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_token)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`;

    console.log('Database tables initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}

// User CRUD operations
export async function createUser(data: {
  github_id: number | string;
  github_username: string;
  github_access_token_encrypted: string;
}): Promise<User> {
  const id = `user_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  const result = await sql`
    INSERT INTO users (
      id,
      github_id,
      github_username,
      github_access_token_encrypted,
      created_at,
      updated_at
    ) VALUES (
      ${id},
      ${Number(data.github_id)},
      ${data.github_username},
      ${data.github_access_token_encrypted},
      NOW(),
      NOW()
    )
    RETURNING *
  `;

  return result.rows[0] as User;
}

export async function getUserByGithubId(githubId: number | string): Promise<User | null> {
  const result = await sql`
    SELECT * FROM users
    WHERE github_id = ${Number(githubId)}
    LIMIT 1
  `;

  return result.rows[0] as User | null;
}

export async function getUserById(userId: string): Promise<User | null> {
  const result = await sql`
    SELECT * FROM users
    WHERE id = ${userId}
    LIMIT 1
  `;

  return result.rows[0] as User | null;
}

export async function updateGithubToken(
  userId: string,
  encryptedToken: string
): Promise<void> {
  await sql`
    UPDATE users
    SET
      github_access_token_encrypted = ${encryptedToken},
      github_token_expires_at = NULL,
      updated_at = NOW()
    WHERE id = ${userId}
  `;
}

export async function updateUserAnthropicKey(
  userId: string,
  encryptedKey: string | null
): Promise<void> {
  await sql`
    UPDATE users
    SET
      anthropic_api_key_encrypted = ${encryptedKey},
      updated_at = NOW()
    WHERE id = ${userId}
  `;
}

export async function updateUserGithubPat(
  userId: string,
  encryptedPat: string | null
): Promise<void> {
  await sql`
    UPDATE users
    SET
      github_pat_encrypted = ${encryptedPat},
      updated_at = NOW()
    WHERE id = ${userId}
  `;
}

export async function updateUserMintlifyCredentials(
  userId: string,
  encryptedApiKey: string | null,
  encryptedProjectId: string | null
): Promise<void> {
  await sql`
    UPDATE users
    SET
      mintlify_api_key_encrypted = ${encryptedApiKey},
      mintlify_project_id_encrypted = ${encryptedProjectId},
      updated_at = NOW()
    WHERE id = ${userId}
  `;
}

export async function getUserWithDecryptedCreds(
  userId: string,
  includeAnthropicKey = false
): Promise<UserWithDecryptedCreds | null> {
  const user = await getUserById(userId);
  if (!user) return null;

  const decryptedUser: UserWithDecryptedCreds = {
    ...user,
    github_access_token_decrypted: decrypt(user.github_access_token_encrypted),
    anthropic_api_key_decrypted: user.anthropic_api_key_encrypted
      ? decrypt(user.anthropic_api_key_encrypted)
      : null,
    github_pat_decrypted: user.github_pat_encrypted
      ? decrypt(user.github_pat_encrypted)
      : null,
    mintlify_api_key_decrypted: user.mintlify_api_key_encrypted
      ? decrypt(user.mintlify_api_key_encrypted)
      : null,
    mintlify_project_id_decrypted: user.mintlify_project_id_encrypted
      ? decrypt(user.mintlify_project_id_encrypted)
      : null,
  };

  return decryptedUser;
}

// Feedback diagnoses (LLM-generated cluster diagnoses, keyed by docs path)

export interface FeedbackDiagnosis {
  path: string;
  diagnosis: string;
  model: string;
  generated_at: Date;
  generated_by_user_id: string | null;
}

export async function getFeedbackDiagnosis(path: string): Promise<FeedbackDiagnosis | null> {
  const result = await sql<FeedbackDiagnosis>`
    SELECT path, diagnosis, model, generated_at, generated_by_user_id
    FROM feedback_diagnoses
    WHERE path = ${path}
  `;
  return result.rows[0] ?? null;
}

export async function upsertFeedbackDiagnosis(data: {
  path: string;
  diagnosis: string;
  model: string;
  userId: string | null;
}): Promise<FeedbackDiagnosis> {
  const result = await sql<FeedbackDiagnosis>`
    INSERT INTO feedback_diagnoses (path, diagnosis, model, generated_at, generated_by_user_id)
    VALUES (${data.path}, ${data.diagnosis}, ${data.model}, NOW(), ${data.userId})
    ON CONFLICT (path) DO UPDATE
    SET diagnosis = EXCLUDED.diagnosis,
        model = EXCLUDED.model,
        generated_at = EXCLUDED.generated_at,
        generated_by_user_id = EXCLUDED.generated_by_user_id
    RETURNING path, diagnosis, model, generated_at, generated_by_user_id
  `;
  return result.rows[0];
}

// Session management
export async function createSession(data: {
  session_token: string;
  user_id: string;
  expires: Date;
}): Promise<Session> {
  const id = `sess_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  const result = await sql`
    INSERT INTO sessions (
      id,
      session_token,
      user_id,
      expires,
      created_at
    ) VALUES (
      ${id},
      ${data.session_token},
      ${data.user_id},
      ${data.expires.toISOString()},
      NOW()
    )
    RETURNING *
  `;

  return result.rows[0] as Session;
}

export async function getSessionByToken(sessionToken: string): Promise<Session | null> {
  const result = await sql`
    SELECT * FROM sessions
    WHERE session_token = ${sessionToken}
    AND expires > NOW()
    LIMIT 1
  `;

  return result.rows[0] as Session | null;
}

export async function updateSessionExpiry(
  sessionToken: string,
  expires: Date
): Promise<void> {
  await sql`
    UPDATE sessions
    SET expires = ${expires.toISOString()}
    WHERE session_token = ${sessionToken}
  `;
}

export async function deleteSession(sessionToken: string): Promise<void> {
  await sql`
    DELETE FROM sessions
    WHERE session_token = ${sessionToken}
  `;
}

export async function deleteExpiredSessions(): Promise<void> {
  await sql`
    DELETE FROM sessions
    WHERE expires < NOW()
  `;
}

// Cleanup function for user data
export async function deleteUser(userId: string): Promise<void> {
  // Sessions will be deleted automatically via CASCADE
  await sql`
    DELETE FROM users
    WHERE id = ${userId}
  `;
}
