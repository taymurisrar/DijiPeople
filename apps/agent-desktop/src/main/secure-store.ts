const SERVICE_NAME = "DijiPeople Agent";
const REFRESH_ACCOUNT = "agent-refresh-token";

type KeytarModule = {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(
    service: string,
    account: string,
    password: string,
  ): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
};

export class SecureStore {
  private readonly keytarPromise: Promise<KeytarModule>;

  constructor() {
    this.keytarPromise = this.loadKeytar();
  }

  async getRefreshToken(): Promise<string | null> {
    const keytar = await this.keytarPromise;

    try {
      return await keytar.getPassword(SERVICE_NAME, REFRESH_ACCOUNT);
    } catch (error) {
      throw new Error(
        `Unable to read secure session token: ${this.getErrorMessage(error)}`,
      );
    }
  }

  async setRefreshToken(token: string): Promise<void> {
    if (!token?.trim()) {
      throw new Error("Cannot store an empty secure session token.");
    }

    const keytar = await this.keytarPromise;

    try {
      await keytar.setPassword(SERVICE_NAME, REFRESH_ACCOUNT, token);
    } catch (error) {
      throw new Error(
        `Unable to store secure session token: ${this.getErrorMessage(error)}`,
      );
    }
  }

  async clearRefreshToken(): Promise<void> {
    const keytar = await this.keytarPromise;

    try {
      await keytar.deletePassword(SERVICE_NAME, REFRESH_ACCOUNT);
    } catch (error) {
      throw new Error(
        `Unable to clear secure session token: ${this.getErrorMessage(error)}`,
      );
    }
  }

  private async loadKeytar(): Promise<KeytarModule> {
    try {
      const module = await import("keytar");

      return module.default ?? module;
    } catch (error) {
      throw new Error(
        `Secure credential storage is unavailable: ${this.getErrorMessage(
          error,
        )}`,
      );
    }
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "Unknown error";
  }
}