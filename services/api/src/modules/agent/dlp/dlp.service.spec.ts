import { Prisma } from '@prisma/client';
import { DlpService } from './dlp.service';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import type { SecretEncryptionService } from '../../../common/security/secret-encryption.service';
import type { StorageService } from '../../../common/storage/storage.service';
import type { AuditService } from '../../audit/audit.service';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-request.interface';
import { ClipboardCaptureBatchDto } from '../dto/dlp-capture.dto';

/**
 * The server, not the client, decides what DLP capture is collected (TASK-0020).
 * These tests pin the decisions that must hold whatever the agent sends: capture
 * off collects nothing, consent-required with no consent collects nothing,
 * full-content is honoured, metadata-only never carries content, replays do not
 * double-record, and reading content is audited.
 */
describe('DlpService', () => {
  const user: AuthenticatedUser = {
    userId: 'user-1',
    tenantId: 'tenant-1',
  } as AuthenticatedUser;

  type Settings = {
    allowClipboardCapture: boolean;
    allowScreenshotCapture: boolean;
    clipboardFullContent: boolean;
    dlpConsentRequired: boolean;
    screenshotRetentionDays: number;
    historyRetentionDays: number;
  };

  function build(settings: Partial<Settings>, opts?: { hasConsent?: boolean }) {
    const created: Array<Prisma.ClipboardCaptureEventCreateArgs['data']> = [];
    const prisma = {
      employee: { findFirst: jest.fn().mockResolvedValue({ id: 'emp-1' }) },
      agentTrackingSettings: {
        findUnique: jest.fn().mockResolvedValue({
          allowClipboardCapture: false,
          allowScreenshotCapture: false,
          clipboardFullContent: false,
          dlpConsentRequired: false,
          screenshotRetentionDays: 30,
          historyRetentionDays: 90,
          ...settings,
        }),
      },
      workSession: {
        findFirst: jest.fn().mockResolvedValue({ id: 'session-1' }),
      },
      clipboardCaptureEvent: {
        create: jest.fn().mockImplementation((args: { data: unknown }) => {
          created.push(
            args.data as Prisma.ClipboardCaptureEventCreateArgs['data'],
          );
          return Promise.resolve({ id: 'cbe-1', ...(args.data as object) });
        }),
      },
      legalDocumentAcknowledgement: {
        findFirst: jest
          .fn()
          .mockResolvedValue(opts?.hasConsent ? { id: 'ack-1' } : null),
      },
    } as unknown as PrismaService;

    const encryption = {
      encrypt: jest.fn((v: string) => `enc:${v}`),
      decrypt: jest.fn((v: string) => v.replace(/^enc:/, '')),
    } as unknown as SecretEncryptionService;
    const storage = {} as unknown as StorageService;
    const audit = {
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuditService;

    const service = new DlpService(prisma, encryption, storage, audit);
    return { service, prisma, encryption, audit, created };
  }

  function batch(overrides: Partial<{ text: string; overCap: boolean }> = {}) {
    return {
      events: [
        {
          sessionId: 'session-1',
          deviceId: 'device-1',
          occurredAt: '2026-08-25T10:00:00.000Z',
          contentBytes: 10,
          contentSha256: 'abc',
          text: overrides.text ?? 'salary data',
          overCap: overrides.overCap ?? false,
        },
      ],
    } as ClipboardCaptureBatchDto;
  }

  it('collects nothing when clipboard capture is off', async () => {
    const { service, prisma } = build({ allowClipboardCapture: false });
    const result = await service.ingestClipboardEvents(user, batch());

    expect(result).toEqual({ accepted: 0, captureEnabled: false });
    expect(prisma.clipboardCaptureEvent.create).not.toHaveBeenCalled();
  });

  it('collects nothing when consent is required but not on record', async () => {
    const { service, prisma } = build(
      { allowClipboardCapture: true, dlpConsentRequired: true },
      { hasConsent: false },
    );
    const result = await service.ingestClipboardEvents(user, batch());

    expect(result).toMatchObject({ accepted: 0, consentMissing: true });
    expect(prisma.clipboardCaptureEvent.create).not.toHaveBeenCalled();
  });

  it('stores encrypted content in full-content mode', async () => {
    const { service, encryption, created } = build({
      allowClipboardCapture: true,
      clipboardFullContent: true,
    });
    const result = await service.ingestClipboardEvents(
      user,
      batch({ text: 'secret' }),
    );

    expect(result).toMatchObject({ accepted: 1, captureEnabled: true });
    expect(encryption.encrypt).toHaveBeenCalledWith('secret');
    expect(created[0].encryptedContent).toBe('enc:secret');
    expect(created[0].dedupeKey).toContain('tenant-1:session-1:clip:');
  });

  it('never stores content in metadata-only mode', async () => {
    const { service, encryption, created } = build({
      allowClipboardCapture: true,
      clipboardFullContent: false,
    });
    await service.ingestClipboardEvents(user, batch({ text: 'secret' }));

    expect(encryption.encrypt).not.toHaveBeenCalled();
    expect(created[0].encryptedContent).toBeNull();
    expect(created[0].contentSha256).toBe('abc');
  });

  it('drops the content of an over-cap sample even in full-content mode', async () => {
    const { service, created } = build({
      allowClipboardCapture: true,
      clipboardFullContent: true,
    });
    await service.ingestClipboardEvents(
      user,
      batch({ text: 'huge', overCap: true }),
    );

    expect(created[0].encryptedContent).toBeNull();
    expect(created[0].overCap).toBe(true);
  });

  it('does not double-count a replayed sample (P2002)', async () => {
    const { service, prisma } = build({ allowClipboardCapture: true });
    (prisma.clipboardCaptureEvent.create as jest.Mock).mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    const result = await service.ingestClipboardEvents(user, batch());

    expect(result).toEqual({ accepted: 0, captureEnabled: true });
  });

  it('audits a clipboard content read and decrypts it', async () => {
    const { service, prisma, audit } = build({ allowClipboardCapture: true });
    (
      prisma as unknown as { clipboardCaptureEvent: { findFirst: jest.Mock } }
    ).clipboardCaptureEvent.findFirst = jest.fn().mockResolvedValue({
      id: 'cbe-1',
      tenantId: 'tenant-1',
      employeeId: 'emp-1',
      occurredAt: new Date(),
      encryptedContent: 'enc:salary data',
      overCap: false,
      contentBytes: 11,
      contentSha256: 'abc',
      sourceApp: 'Excel',
      destinationApp: 'WhatsApp',
    });

    const result = await service.readClipboardContent(user, 'cbe-1');

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DLP_CLIPBOARD_CONTENT_VIEWED' }),
    );
    expect(result.content).toBe('salary data');
  });
});
