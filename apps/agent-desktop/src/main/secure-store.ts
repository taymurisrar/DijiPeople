const SERVICE_NAME = "DijiPeople Agent";
const REFRESH_ACCOUNT = "agent-refresh-token";

export class SecureStore {
  private keytarPromise: Promise<{
    getPassword(service: string, account: string): Promise<string | null>;
    setPassword(
      service: string,
      account: string,
      password: string,
    ): Promise<void>;
    deletePassword(service: string, account: string): Promise<boolean>;
  }>;

  constructor() {
    this.keytarPromise = import("keytar") as never;
  }

  async getRefreshToken() {
    const keytar = await this.keytarPromise;
    return keytar.getPassword(SERVICE_NAME, REFRESH_ACCOUNT);
  }

  async setRefreshToken(token: string) {
    const keytar = await this.keytarPromise;
    await keytar.setPassword(SERVICE_NAME, REFRESH_ACCOUNT, token);
  }

  async clearRefreshToken() {
    const keytar = await this.keytarPromise;
    await keytar.deletePassword(SERVICE_NAME, REFRESH_ACCOUNT);
  }
}
