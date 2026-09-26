import { randomUUID } from 'node:crypto';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { StorageService } from '../src/common/storage/storage.service';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';
import { HttpActors, type HttpActor } from './helpers/http-actors';

/**
 * ITEM-0200 (a) — the agreement lifecycle over real HTTP and a real database.
 *
 * Every other test of `modules/contracts` is a unit spec with Prisma mocked.
 * That covers the branching, but three of the guarantees this module makes are
 * only real once a request and a database are both in the loop:
 *
 *   - the PUBLIC signing route is reachable without a session and is the only
 *     thing that moves an agreement to FULLY_EXECUTED;
 *   - the executed copy is stored as an immutable SIGNED_COPY row, which the
 *     database itself then refuses to change (a trigger, not the service);
 *   - an agreement is immutable after signing (BUG-0011), asserted here at the
 *     HTTP boundary a client actually calls, not at the service method.
 *
 * The agreement is built from the system template `PARTNER_INDIVIDUAL_STANDARD`
 * that `seed:config` installs (CI runs it inside `verify-database.mjs`), for an
 * INDIVIDUAL partner the suite creates through the admin API.
 *
 * ## Cleanup, and what cannot be cleaned
 *
 * Owned platform operators, the tenant fixture and the stored document bytes
 * are removed. The executed agreement's rows are NOT: `ContractVersion`,
 * `ContractDocument` and `SignatureEvidence` carry database triggers that
 * refuse UPDATE and DELETE once locked (`20260730024500_enterprise_contract_
 * partner_support`), and every other contract table references them with
 * `onDelete: Restrict`. That refusal is the legal guarantee under test, so the
 * suite does not disable it to tidy up. Those rows — and the partner they
 * reference — are retained, uniquely named per run, in a database CI discards.
 */
describeWithDatabase()(
  'Contracts — agreement lifecycle over HTTP (e2e)',
  () => {
    jest.setTimeout(180_000);

    let app: INestApplication<App>;
    let prisma: PrismaService;
    let storage: StorageService;
    let fixtures: DbFixtures;
    let actors: HttpActors;

    let admin: HttpActor;
    let tenantUser: HttpActor;

    const runId = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
    const partnerFirstName = 'Aisha';
    const partnerLastName = `Signer ${runId}`;
    const partnerEmail = `contracts-partner-${runId}@example.invalid`;

    let templateId: string;
    let partnerId: string;
    let contractId: string;
    let signingToken: string;

    /** Stored bytes this suite caused, removed in `afterAll`. */
    const storedKeys = new Set<string>();

    // A valid 1x1 PNG: the smallest thing `decodeSignatureDataUrl` accepts.
    const drawnSignature =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

    const http = () => request(app.getHttpServer());
    const as = (actor: HttpActor) => ({
      Authorization: `Bearer ${actor.token}`,
      'X-DijiPeople-App': actor.client,
    });

    interface ContractParty {
      id: string;
      partyType: string;
      isSignatory: boolean;
      signatureRequired: boolean;
    }
    interface ContractDocument {
      kind: string;
      isImmutable: boolean;
      storageKey: string;
    }
    interface ContractBody {
      id: string;
      status: string;
      partnerId: string | null;
      parties: ContractParty[];
      documents: ContractDocument[];
      approvalRequests: Array<{ id: string; status: string }>;
      partner: { id: string; status: string } | null;
    }
    interface DocumentFieldsBody {
      items: Array<{ key: string; value: string; editable: boolean }>;
      resolvedHtml: string;
    }

    async function getContract(): Promise<ContractBody> {
      const response = await http()
        .get(`/api/contracts/${contractId}`)
        .set(as(admin))
        .expect(200);
      return response.body as ContractBody;
    }

    beforeAll(async () => {
      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = moduleRef.createNestApplication();
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          transform: true,
          forbidNonWhitelisted: true,
        }),
      );
      app.setGlobalPrefix('api');
      await app.init();

      prisma = app.get(PrismaService);
      storage = app.get(StorageService);
      fixtures = new DbFixtures(prisma, 'contracts-http');
      actors = new HttpActors(app, runId);

      admin = await actors.platformUser('PLATFORM_ADMIN', 'contracts-admin');
      const tenant = await fixtures.createTenantWithBusinessUnit('contracts');
      tenantUser = await actors.tenantUser(
        tenant.id,
        tenant.businessUnitId,
        'contracts-tenant-user',
      );

      // The system template, found through the API an operator would use.
      const templates = await http()
        .get('/api/contract-templates')
        .set(as(admin))
        .expect(200);
      const template = (
        templates.body as { items: Array<{ id: string; key: string }> }
      ).items.find((item) => item.key === 'PARTNER_INDIVIDUAL_STANDARD');
      if (!template) {
        throw new Error(
          'PARTNER_INDIVIDUAL_STANDARD is missing — seed:config has not run against this database (verify-database.mjs runs it).',
        );
      }
      templateId = template.id;

      const partner = await http()
        .post('/api/partners')
        .set(as(admin))
        .send({
          type: 'INDIVIDUAL',
          displayName: `${partnerFirstName} ${partnerLastName}`,
          contactFirstName: partnerFirstName,
          contactLastName: partnerLastName,
          email: partnerEmail,
          defaultCommissionRate: 12,
        })
        .expect(201);
      partnerId = (partner.body as { id: string }).id;
    });

    afterAll(async () => {
      // Record every stored object this suite's agreement produced, then remove
      // the bytes. The rows stay (see the header); the files are on a disk CI
      // does not discard, so they are this suite's to delete.
      if (contractId) {
        const [documents, evidence] = await Promise.all([
          prisma.contractDocument.findMany({
            where: { contractId },
            select: { storageKey: true },
          }),
          prisma.signatureEvidence.findMany({
            where: { recipient: { signatureRequest: { contractId } } },
            select: { signatureStorageKey: true },
          }),
        ]);
        for (const row of documents) storedKeys.add(row.storageKey);
        for (const row of evidence) {
          if (row.signatureStorageKey) storedKeys.add(row.signatureStorageKey);
        }
      }
      for (const key of storedKeys) {
        // A partner agreement has no tenant, so its files live in platform scope.
        await storage.deleteFile(key, { kind: 'platform' });
      }
      await actors?.cleanup();
      await fixtures?.cleanup();
      await app?.close();
    });

    describe('the platform gate', () => {
      it('refuses a request with no session (401)', async () => {
        await http().get('/api/contracts').expect(401);
      });

      it('refuses a tenant user, who has no platform identity (403)', async () => {
        // Authenticated, but not as a platform operator: the service's
        // `assertPlatform` is the only thing between a tenant and every
        // agreement on the platform.
        await http().get('/api/contracts').set(as(tenantUser)).expect(403);
        await http()
          .post('/api/contracts')
          .set(as(tenantUser))
          .send({
            title: 'Tenant should not create this',
            contractType: 'PARTNER_AGREEMENT',
            counterpartyName: 'Nobody',
          })
          .expect(403);
      });
    });

    describe('drafting', () => {
      it('creates a partner agreement from the system template', async () => {
        const response = await http()
          .post('/api/contracts')
          .set(as(admin))
          .send({
            title: `Individual partner agreement ${runId}`,
            contractType: 'PARTNER_AGREEMENT',
            counterpartyName: `${partnerFirstName} ${partnerLastName}`,
            counterpartyEmail: partnerEmail,
            templateId,
            partnerId,
          })
          .expect(201);
        const contract = response.body as ContractBody;
        contractId = contract.id;

        expect(contract.status).toBe('DRAFT');
        expect(contract.partnerId).toBe(partnerId);
        // ITEM-0203: an individual partner's agreement records an INDIVIDUAL
        // party, not a PARTNER organisation.
        const counterparty = contract.parties.find(
          (party) => party.isSignatory && party.signatureRequired,
        );
        expect(counterparty?.partyType).toBe('INDIVIDUAL');
      });

      it('refuses a second live agreement of the same type for the same partner', async () => {
        await http()
          .post('/api/contracts')
          .set(as(admin))
          .send({
            title: `Duplicate agreement ${runId}`,
            contractType: 'PARTNER_AGREEMENT',
            counterpartyName: `${partnerFirstName} ${partnerLastName}`,
            templateId,
            partnerId,
          })
          .expect(409)
          .expect((response) => {
            expect(response.body).toMatchObject({
              code: 'CONTRACT_DUPLICATE_AGREEMENT',
            });
          });
      });

      it('resolves every non-signature placeholder in the preview', async () => {
        const response = await http()
          .get(`/api/contracts/${contractId}/document-fields`)
          .set(as(admin))
          .expect(200);
        const fields = response.body as DocumentFieldsBody;

        // QA agreements DEFECT-1: the preview used to print raw `{{...}}`.
        expect(fields.resolvedHtml).not.toContain('{{');
        expect(fields.resolvedHtml).toContain(partnerLastName);

        const partnerName = fields.items.find(
          (item) => item.key === 'partner.name',
        );
        expect(partnerName?.value).toContain(partnerLastName);
        // The signature namespace is produced by signing, never typed in.
        for (const item of fields.items.filter((field) =>
          field.key.startsWith('signature.'),
        )) {
          expect(item.editable).toBe(false);
        }
      });

      it('refuses a hand-entered signature field (400)', async () => {
        await http()
          .patch(`/api/contracts/${contractId}/document-fields`)
          .set(as(admin))
          .send({ values: { 'signature.counterparty.name': 'Forged' } })
          .expect(400);
      });

      it('generates a PDF preview and refuses an unsupported format (400)', async () => {
        const pdf = await http()
          .post(`/api/contracts/${contractId}/generate/pdf`)
          .set(as(admin))
          .expect(201);
        expect(pdf.headers['content-type']).toContain('application/pdf');

        await http()
          .post(`/api/contracts/${contractId}/generate/xlsx`)
          .set(as(admin))
          .expect(400);
      });

      it('requires a reason to move a draft backward, and moves it forward', async () => {
        // Nothing precedes DRAFT, but the reason check comes first and is what
        // a client sees for a backward move without one.
        await http()
          .post(`/api/contracts/${contractId}/transition`)
          .set(as(admin))
          .send({ direction: 'backward' })
          .expect(400);

        const forward = await http()
          .post(`/api/contracts/${contractId}/transition`)
          .set(as(admin))
          .send({ direction: 'forward' })
          .expect(201);
        expect((forward.body as ContractBody).status).toBe('INTERNAL_REVIEW');
      });
    });

    describe('approval and signature', () => {
      it('refuses to send for signature before internal approval (400)', async () => {
        const contract = await getContract();
        const counterparty = contract.parties.find(
          (party) => party.isSignatory && party.signatureRequired,
        );
        await http()
          .post(`/api/contracts/${contractId}/signature-requests`)
          .set(as(admin))
          .send({
            subject: 'Too early',
            recipients: [
              {
                name: `${partnerFirstName} ${partnerLastName}`,
                email: partnerEmail,
                role: 'Partner',
                partyId: counterparty?.id,
              },
            ],
          })
          .expect(400);
      });

      it('reaches READY_FOR_SIGNATURE through the governed approval steps', async () => {
        const submitted = await http()
          .post(`/api/contracts/${contractId}/submit-approval`)
          .set(as(admin))
          .expect(201);
        const submission = submitted.body as { id?: string; status?: string };

        // `contract-settings` decides how many steps there are (two, as seeded:
        // commercial then legal). A platform administrator may act on any step
        // (ITEM-0204), so the same operator approves each pending one in turn.
        if (submission.id) {
          for (let step = 0; step < 5; step += 1) {
            const current = await getContract();
            if (current.status === 'READY_FOR_SIGNATURE') break;
            expect(['COMMERCIAL_APPROVAL', 'LEGAL_APPROVAL']).toContain(
              current.status,
            );
            await http()
              .post(`/api/platform-approvals/${submission.id}/approve`)
              .set(as(admin))
              .send({ comment: `Approved by the e2e suite (${runId}).` })
              .expect(201);
          }
        }

        expect((await getContract()).status).toBe('READY_FOR_SIGNATURE');
      });

      it('sends for signature and returns a one-time signing link', async () => {
        const contract = await getContract();
        const counterparty = contract.parties.find(
          (party) => party.isSignatory && party.signatureRequired,
        );
        expect(counterparty).toBeDefined();

        const response = await http()
          .post(`/api/contracts/${contractId}/signature-requests`)
          .set(as(admin))
          .send({
            subject: `Please sign ${runId}`,
            recipients: [
              {
                name: `${partnerFirstName} ${partnerLastName}`,
                email: partnerEmail,
                role: 'Partner',
                partyId: counterparty!.id,
                signingOrder: 1,
              },
            ],
          })
          .expect(201);
        const sent = response.body as {
          status: string;
          signingLinks: Array<{ email: string; token: string }>;
        };
        expect(sent.status).toBe('SENT');
        expect(sent.signingLinks).toHaveLength(1);
        signingToken = sent.signingLinks[0].token;

        const after = await getContract();
        expect(after.status).toBe('SENT');
        expect(after.partner?.status).toBe('AGREEMENT_IN_PROGRESS');
      });

      it('refuses to edit the agreement once signing has begun (400)', async () => {
        await http()
          .patch(`/api/contracts/${contractId}`)
          .set(as(admin))
          .send({ title: 'Rewritten after sending' })
          .expect(400)
          .expect((response) => {
            expect((response.body as { message: string }).message).toMatch(
              /immutable after signing/i,
            );
          });
      });

      it('opens the signing session publicly, without a session', async () => {
        const response = await http()
          .get(`/api/public/signatures/${signingToken}`)
          .expect(200);
        expect(JSON.stringify(response.body)).not.toContain('{{partner.');
      });

      it('refuses a signature without consent (400)', async () => {
        await http()
          .post(`/api/public/signatures/${signingToken}/sign`)
          .send({
            method: 'DRAWN',
            signatureDataUrl: drawnSignature,
            consentAccepted: false,
            consentText: 'I agree to sign electronically.',
          })
          .expect(400);
      });

      it('completes the agreement through the public signing route', async () => {
        const response = await http()
          .post(`/api/public/signatures/${signingToken}/sign`)
          .send({
            method: 'DRAWN',
            signatureDataUrl: drawnSignature,
            consentAccepted: true,
            consentText: 'I agree to sign electronically.',
            timezone: 'Asia/Riyadh',
          })
          .expect(201);
        expect(response.body).toMatchObject({ success: true, completed: true });

        const executed = await getContract();
        expect(executed.status).toBe('FULLY_EXECUTED');
        expect(executed.partner?.status).toBe('AGREEMENT_EXECUTED');

        const signedCopies = executed.documents.filter(
          (document) => document.kind === 'SIGNED_COPY',
        );
        expect(signedCopies).toHaveLength(1);
        expect(signedCopies[0].isImmutable).toBe(true);
      });

      it('treats a repeated signature as already recorded, not a second one', async () => {
        const response = await http()
          .post(`/api/public/signatures/${signingToken}/sign`)
          .send({
            method: 'DRAWN',
            signatureDataUrl: drawnSignature,
            consentAccepted: true,
            consentText: 'I agree to sign electronically.',
          })
          .expect(201);
        expect(response.body).toMatchObject({ success: true, completed: true });

        const evidence = await prisma.signatureEvidence.count({
          where: { recipient: { signatureRequest: { contractId } } },
        });
        expect(evidence).toBe(1);
      });
    });

    describe('after execution', () => {
      it('refuses a field edit (400)', async () => {
        /*
         * Status only, deliberately. `saveDocumentFields` has no status guard of
         * its own: this is refused because the current version is the frozen
         * signing version, whose only remaining placeholders are `signature.*`,
         * so no key is editable ("No editable document fields were supplied").
         * The outcome is the one that matters and the next test proves the value
         * did not move; the message is not pinned because it is not the
         * immutability guard speaking.
         */
        await http()
          .patch(`/api/contracts/${contractId}/document-fields`)
          .set(as(admin))
          .send({ values: { 'partner.name': 'Someone else entirely' } })
          .expect(400);
      });

      it('refuses a metadata edit (400) — BUG-0011 at the HTTP boundary', async () => {
        await http()
          .patch(`/api/contracts/${contractId}`)
          .set(as(admin))
          .send({ title: 'Rewritten after execution' })
          .expect(400)
          .expect((response) => {
            expect((response.body as { message: string }).message).toMatch(
              /immutable after signing/i,
            );
          });
      });

      it('refuses a new approval round (400)', async () => {
        await http()
          .post(`/api/contracts/${contractId}/submit-approval`)
          .set(as(admin))
          .expect(400);
      });

      it('keeps the executed partner value it was signed with', async () => {
        const response = await http()
          .get(`/api/contracts/${contractId}/document-fields`)
          .set(as(admin))
          .expect(200);
        const fields = response.body as DocumentFieldsBody;
        expect(fields.resolvedHtml).toContain(partnerLastName);
        expect(fields.resolvedHtml).not.toContain('Someone else entirely');
      });
    });
  },
);
