import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

/*
 * Encrypts the secret fields of stored integration settings.
 *
 * Provider credentials (SMTP passwords, API keys) were written to the database
 * as plain JSON. Masking them in API responses hid them from the screen but not
 * from anyone with database access, a backup, or a replica.
 *
 * Format: enc:v1:<iv>:<authTag>:<ciphertext>, all base64. The version prefix
 * lets the algorithm change later without guessing at what a stored value is.
 */

const PREFIX = 'enc:v1:';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

@Injectable()
export class SecretEncryptionService {
  private readonly logger = new Logger(SecretEncryptionService.name);
  private readonly key: Buffer | null;

  constructor(private readonly configService: ConfigService) {
    this.key = this.resolveKey();
  }

  private resolveKey(): Buffer | null {
    const raw =
      this.configService.get<string>('SECRET_ENCRYPTION_KEY') ??
      this.configService.get<string>('APP_ENCRYPTION_KEY');

    if (!raw?.trim()) {
      const isProduction =
        this.configService.get<string>('NODE_ENV') === 'production';

      if (isProduction) {
        /*
         * Refusing to start is deliberate. Silently falling back to plaintext
         * in production would reintroduce exactly the problem this fixes, and
         * nobody would notice until the data leaked.
         */
        throw new InternalServerErrorException(
          'SECRET_ENCRYPTION_KEY must be set so stored integration credentials can be encrypted.',
        );
      }

      this.logger.warn(
        'SECRET_ENCRYPTION_KEY is not set. Integration credentials will be stored unencrypted. Set it before going live.',
      );
      return null;
    }

    // Any passphrase length is accepted; the digest gives the 32 bytes AES needs.
    return createHash('sha256').update(raw.trim()).digest();
  }

  get isEnabled() {
    return this.key !== null;
  }

  isEncrypted(value: unknown): value is string {
    return typeof value === 'string' && value.startsWith(PREFIX);
  }

  encrypt(plainText: string): string {
    if (!this.key) return plainText;

    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plainText, 'utf8'),
      cipher.final(),
    ]);

    return [
      PREFIX + iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      encrypted.toString('base64'),
    ].join(':');
  }

  /**
   * Returns the original text. A value that was never encrypted is passed
   * through, so rows written before the key existed keep working.
   */
  decrypt(value: string): string {
    if (!this.isEncrypted(value)) return value;

    if (!this.key) {
      // The value cannot be read without the key it was written with.
      throw new InternalServerErrorException(
        'A stored credential is encrypted but SECRET_ENCRYPTION_KEY is not set.',
      );
    }

    const [ivPart, tagPart, cipherPart] = value.slice(PREFIX.length).split(':');
    if (!ivPart || !tagPart || !cipherPart) return value;

    try {
      const decipher = createDecipheriv(
        ALGORITHM,
        this.key,
        Buffer.from(ivPart, 'base64'),
      );
      decipher.setAuthTag(Buffer.from(tagPart, 'base64'));

      return Buffer.concat([
        decipher.update(Buffer.from(cipherPart, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      /*
       * A failure here means the key changed or the row was tampered with.
       * Surfacing it beats sending a corrupt credential to a provider.
       */
      throw new InternalServerErrorException(
        'A stored credential could not be decrypted. It may have been written with a different key.',
      );
    }
  }

  /** Encrypts every value whose key looks like a secret, at any depth. */
  encryptSecrets(
    value: unknown,
    isSecretKey: (key: string) => boolean,
  ): unknown {
    return this.walk(value, isSecretKey, (text) =>
      this.isEncrypted(text) ? text : this.encrypt(text),
    );
  }

  /** Reverses `encryptSecrets` so a provider receives usable credentials. */
  decryptSecrets(
    value: unknown,
    isSecretKey: (key: string) => boolean,
  ): unknown {
    return this.walk(value, isSecretKey, (text) => this.decrypt(text));
  }

  private walk(
    value: unknown,
    isSecretKey: (key: string) => boolean,
    transform: (text: string) => string,
  ): unknown {
    if (Array.isArray(value)) {
      return value.map((entry) => this.walk(entry, isSecretKey, transform));
    }

    if (value && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(
        value as Record<string, unknown>,
      )) {
        result[key] =
          isSecretKey(key) && typeof entry === 'string'
            ? transform(entry)
            : this.walk(entry, isSecretKey, transform);
      }
      return result;
    }

    return value;
  }
}
