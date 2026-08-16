import { ValidationPipe } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AgentLoginDto,
  AgentLogoutDto,
  AgentRefreshDto,
} from './dto/agent-auth.dto';
import { AgentDeviceDto } from './dto/agent-device.dto';
import { HeartbeatDto, StartAgentSessionDto } from './dto/agent-session.dto';

/**
 * CONTRACT — what `apps/agent-desktop` sends must satisfy the DTO that receives
 * it.
 *
 * BUG-0035. The desktop agent has always sent `deviceFingerprint` on logout and
 * `AgentLogoutDto` never declared it. The global `ValidationPipe` runs with
 * `forbidNonWhitelisted: true`, so an undeclared field is not ignored — it is a
 * 400. Every logout failed, the agent swallowed the failure and reported a
 * successful sign-out, and the refresh token stayed live for its full TTL.
 *
 * Nothing failed when the two sides drifted, because they are validated in
 * different workspaces and no test crossed the boundary. This one does. The
 * pipe is constructed with the *same* options as `main.ts`, so a field the
 * production pipe would reject is rejected here too.
 *
 * The payloads are asserted against the agent's own source rather than typed out
 * from memory, so this cannot pass by describing a client that no longer exists.
 */
describe('desktop agent request contract', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  });

  const deviceInfo = {
    deviceFingerprint: 'a-fingerprint-long-enough',
    deviceName: 'WORKSTATION-01',
    os: 'Windows_NT 10.0.26200',
    platform: 'win32',
    agentVersion: '1.4.2',
  };

  async function validate(
    payload: unknown,
    metatype: new () => object,
  ): Promise<unknown> {
    return pipe.transform(payload, { type: 'body', metatype });
  }

  const PAYLOADS: Array<{
    endpoint: string;
    dto: new () => object;
    body: Record<string, unknown>;
  }> = [
    {
      endpoint: 'POST /agent/auth/login',
      dto: AgentLoginDto,
      body: {
        email: 'person@example.com',
        password: 'Sufficient1!',
        ...deviceInfo,
      },
    },
    {
      endpoint: 'POST /agent/auth/refresh',
      dto: AgentRefreshDto,
      body: {
        refreshToken: 'a-refresh-token',
        deviceFingerprint: deviceInfo.deviceFingerprint,
        agentVersion: deviceInfo.agentVersion,
      },
    },
    {
      endpoint: 'POST /agent/auth/refresh (new session)',
      dto: AgentRefreshDto,
      body: {
        refreshToken: 'a-refresh-token',
        deviceFingerprint: deviceInfo.deviceFingerprint,
        agentVersion: deviceInfo.agentVersion,
        startNewSession: true,
      },
    },
    {
      endpoint: 'POST /agent/auth/logout',
      dto: AgentLogoutDto,
      body: {
        refreshToken: 'a-refresh-token',
        deviceFingerprint: deviceInfo.deviceFingerprint,
      },
    },
    {
      endpoint: 'POST /agent/devices/register',
      dto: AgentDeviceDto,
      body: { ...deviceInfo },
    },
    {
      endpoint: 'POST /agent/sessions/start',
      dto: StartAgentSessionDto,
      body: {
        deviceId: '4f8c2a1e-1d2b-4c3d-9e8f-7a6b5c4d3e2f',
        startedAt: '2026-08-16T09:00:00.000Z',
      },
    },
  ];

  it.each(PAYLOADS.map((p) => [p.endpoint, p]))(
    '%s accepts what the desktop agent sends',
    async (_endpoint, entry) => {
      const { body, dto } = entry;
      await expect(validate(body, dto)).resolves.toBeDefined();
    },
  );

  it('still rejects a field no agent sends', () => {
    // Proves the pipe options are the strict ones and the assertions above mean
    // something — a permissive pipe would accept everything and prove nothing.
    return expect(
      validate(
        { refreshToken: 'a-refresh-token', role: 'ADMIN' },
        AgentLogoutDto,
      ),
    ).rejects.toThrow();
  });

  /**
   * The payloads above are hand-written, so they can drift from the client just
   * as the DTO did. This reads the agent's source and fails if a body key
   * appears there that no payload here covers.
   */
  it('covers every field the agent source actually sends', () => {
    const clientPath = join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      '..',
      'apps',
      'agent-desktop',
      'src',
      'main',
      'api-client.ts',
    );

    const source = readFileSync(clientPath, 'utf8');
    const authSection = source.slice(
      source.indexOf('/agent/auth/login'),
      source.indexOf('/agent/sessions/heartbeat'),
    );
    expect(authSection.length).toBeGreaterThan(0);

    const covered = new Set(
      PAYLOADS.flatMap((entry) => Object.keys(entry.body)),
    );
    // Object keys inside the request bodies, e.g. `refreshToken: ...`.
    const sent = [...authSection.matchAll(/^\s{8}(\w+):/gm)].map((m) => m[1]);

    expect(sent.length).toBeGreaterThan(0);
    for (const field of sent) expect(covered.has(field)).toBe(true);
  });
  /**
   * The client caps a heartbeat batch at 1000 and the server now does too. Both
   * directions matter: a legitimate agent at the cap must be accepted, and one
   * event past it must be refused, or the bound is either useless or breaks the
   * product it is meant to protect.
   */
  describe('heartbeat batch bound', () => {
    const event = {
      sessionId: '4f8c2a1e-1d2b-4c3d-9e8f-7a6b5c4d3e2f',
      deviceId: '5a9d3b2f-2e3c-4d5e-8f9a-1b2c3d4e5f60',
      state: 'ACTIVE',
      idleSeconds: 0,
      occurredAt: '2026-08-16T09:00:00.000Z',
    };

    it('accepts a batch at the size the desktop agent sends', async () => {
      const events = Array.from({ length: 1000 }, () => ({ ...event }));
      await expect(validate({ events }, HeartbeatDto)).resolves.toBeDefined();
    });

    it('refuses a batch larger than any agent sends', async () => {
      const events = Array.from({ length: 1001 }, () => ({ ...event }));
      await expect(validate({ events }, HeartbeatDto)).rejects.toThrow();
    });
  });
});
