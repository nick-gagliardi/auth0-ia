import crypto from 'crypto';

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits

function getEncryptionKey(): Buffer {
  const masterKey = process.env.ENCRYPTION_MASTER_KEY;

  if (!masterKey) {
    throw new Error('ENCRYPTION_MASTER_KEY environment variable is not set');
  }

  // Ensure key is exactly 32 bytes for AES-256
  if (masterKey.length !== 64) {
    throw new Error(
      'ENCRYPTION_MASTER_KEY must be 64 hex characters (32 bytes). ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  return Buffer.from(masterKey, 'hex');
}

/**
 * Encrypts a plaintext string using AES-256-GCM
 * Returns a base64-encoded string in the format: iv:authTag:ciphertext
 */
export function encrypt(plaintext: string): string {
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Combine iv, authTag, and encrypted data
    const combined = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;

    // Return as base64 for storage
    return Buffer.from(combined).toString('base64');
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypts an encrypted string using AES-256-GCM
 * Expects input in the format: iv:authTag:ciphertext (base64 encoded)
 */
export function decrypt(encryptedData: string): string {
  try {
    const key = getEncryptionKey();

    // Decode from base64
    const combined = Buffer.from(encryptedData, 'base64').toString('utf8');
    const parts = combined.split(':');

    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Generates a random encryption master key
 * Use this to generate ENCRYPTION_MASTER_KEY for your environment
 */
export function generateMasterKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString('hex');
}

/**
 * Validates that the encryption key is properly configured
 */
export function validateEncryptionSetup(): boolean {
  try {
    const key = getEncryptionKey();
    if (key.length !== KEY_LENGTH) {
      return false;
    }

    // Test encryption/decryption round-trip
    const testString = 'test-encryption-' + Date.now();
    const encrypted = encrypt(testString);
    const decrypted = decrypt(encrypted);

    return decrypted === testString;
  } catch (error) {
    console.error('Encryption setup validation failed:', error);
    return false;
  }
}
