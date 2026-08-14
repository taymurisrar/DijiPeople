/* The DTOs below carry class-validator decorators, which need the polyfill. */
import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LeadQueryDto } from '../leads/dto/admin-lead.dto';
import { PartnerQueryDto } from '../partners/dto/partner.dto';
import { ContractQueryDto } from '../contracts/dto/contracts.dto';
import { SupportCaseQueryDto } from '../support-cases/dto/support-cases.dto';
import {
  CustomerOnboardingQueryDto,
  CustomerQueryDto,
} from '../super-admin/dto/customer-lifecycle.dto';

/*
 * PlatformRuntimeService.list translates a runtime query into a per-module DTO,
 * then validates it with whitelist + forbidNonWhitelisted. Nothing type-checks
 * that hand-off: the payload is an object literal, so a key the DTO does not
 * declare compiles and then fails at runtime for every request to that module.
 *
 * That is exactly what happened to `customers`. The branch offered an
 * `assignedToUserId` filter, CustomerQueryDto never declared it, and the grid
 * returned 400 on every load.
 *
 * The helper now drops undefined values, which stops the 400 — but it also
 * means an undeclared key would fail silently instead, leaving a filter that
 * looks wired and quietly does nothing. So the contract has to be asserted
 * either way, and the key lists are read from the service source rather than
 * copied here, so a branch added later is covered without anyone remembering
 * to update this file.
 */

const DTOS: Record<string, new () => object> = {
  LeadQueryDto,
  PartnerQueryDto,
  CustomerQueryDto,
  CustomerOnboardingQueryDto,
  ContractQueryDto,
  SupportCaseQueryDto,
};

type Branch = { dtoName: string; keys: string[] };

/*
 * Keys of the payload literal itself. Values often contain their own objects —
 * `viewStatus(query.viewKey, { active: 'ACTIVE' })` — whose keys are data, not
 * properties being sent to the DTO, so anything nested inside braces or
 * parentheses is skipped.
 */
function topLevelKeys(body: string): string[] {
  const keys: string[] = [];
  let braces = 0;
  let parens = 0;
  const token = /([A-Za-z_][\w]*)\s*:|[{}()]/g;
  let match: RegExpExecArray | null;

  while ((match = token.exec(body))) {
    const [text, key] = match;
    if (text === '{') braces += 1;
    else if (text === '}') braces -= 1;
    else if (text === '(') parens += 1;
    else if (text === ')') parens -= 1;
    else if (key && braces === 0 && parens === 0 && !keys.includes(key))
      keys.push(key);
  }
  return keys;
}

/** Pulls every `dto(SomeDto, { ... })` call out of the service source. */
function readBranches(): Branch[] {
  const source = readFileSync(
    join(__dirname, 'platform-runtime.service.ts'),
    'utf8',
  );
  const call = /\bdto\(\s*(\w+),\s*\{/g;
  const branches: Branch[] = [];
  let match: RegExpExecArray | null;

  while ((match = call.exec(source))) {
    let depth = 0;
    let end = call.lastIndex - 1;
    for (let i = call.lastIndex - 1; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1;
      else if (source[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const body = source.slice(call.lastIndex, end);
    branches.push({ dtoName: match[1], keys: topLevelKeys(body) });
  }
  return branches;
}

const branches = readBranches();

describe('platform runtime module query payloads', () => {
  it('finds the dto() hand-offs it is meant to guard', () => {
    /* A parser that silently matched nothing would make every case below pass. */
    expect(branches.length).toBeGreaterThanOrEqual(6);
  });

  const guarded = branches.filter((branch) => branch.dtoName in DTOS);

  it.each(guarded.map((branch) => [branch.dtoName, branch] as const))(
    '%s declares every key the runtime sends it',
    async (_name, branch) => {
      const Dto = DTOS[branch.dtoName];
      const payload = Object.fromEntries(
        branch.keys.map((key) => [key, undefined]),
      );
      const instance = plainToInstance(Dto, payload, {
        enableImplicitConversion: true,
      });
      const errors = await validate(instance, {
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      const undeclared = errors
        .filter((error) => 'whitelistValidation' in (error.constraints ?? {}))
        .map((error) => error.property);

      expect({ dto: branch.dtoName, undeclared }).toEqual({
        dto: branch.dtoName,
        undeclared: [],
      });
    },
  );

  it('lets a fully populated customers query through', async () => {
    /*
     * The reported failure: page, pageSize and viewKey set, no owner filter
     * chosen. It has to survive validation with the optional keys absent.
     */
    const instance = plainToInstance(
      CustomerQueryDto,
      { page: 1, pageSize: 25, viewKey: 'all' },
      { enableImplicitConversion: true },
    );
    const errors = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(
      errors.flatMap((error) => Object.values(error.constraints ?? {})),
    ).toEqual([]);
  });

  it('accepts an owner filter on customers rather than rejecting it', async () => {
    const instance = plainToInstance(
      CustomerQueryDto,
      {
        page: 1,
        pageSize: 25,
        assignedToUserId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
      },
      { enableImplicitConversion: true },
    );
    const errors = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors).toEqual([]);
  });
});
