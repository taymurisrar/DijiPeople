import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { PATH_METADATA } from '@nestjs/common/constants';
import { ROLE_KEYS, SYSTEM_ROLE_PRIVILEGES } from './rbac-matrix';
import { roleCanReach } from '../testing/provisioned-role-user';
import { PackageAlmController } from '../../modules/customization/package-alm.controller';
import { WorkProfilesController } from '../../modules/work-profiles/work-profiles.controller';
import { WorkQueuesController } from '../../modules/work-items/work-queues.controller';

/*
 * ITEM-0248 (ADR-0032). One seeded role - System Customizer - owns work
 * component packaging: the ALM package routes AND the work profile / queue manage
 * routes. Evaluated through the guard's own decision function against what
 * provisioning really grants each system role.
 */
const PACKAGE_HANDLERS = [
  'createPublisher',
  'addWorkComponents',
  'release',
  'analyzeImport',
  'executeImport',
  'uninstall',
] as const;

describe('System Customizer owns work-component packaging', () => {
  it.each(PACKAGE_HANDLERS)('reaches package route %s', (handler) => {
    expect(
      roleCanReach(ROLE_KEYS.SYSTEM_CUSTOMIZER, PackageAlmController, handler),
    ).toBe(true);
  });

  it.each(['createUnit', 'create', 'importPackage'])(
    'reaches the work profile manage route %s',
    (handler) => {
      if (
        typeof (
          WorkProfilesController.prototype as unknown as Record<string, unknown>
        )[handler] !== 'function'
      ) {
        return;
      }
      expect(
        roleCanReach(
          ROLE_KEYS.SYSTEM_CUSTOMIZER,
          WorkProfilesController,
          handler,
        ),
      ).toBe(true);
    },
  );

  it('reaches the work queue list and manage routes', () => {
    const handlers = Object.getOwnPropertyNames(
      WorkQueuesController.prototype,
    ).filter((name) => name !== 'constructor');
    expect(handlers.length).toBeGreaterThan(0);
    for (const handler of handlers) {
      expect(
        roleCanReach(
          ROLE_KEYS.SYSTEM_CUSTOMIZER,
          WorkQueuesController,
          handler,
        ),
      ).toBe(true);
    }
  });

  it('gives HR, the CEO and managers no package route they lacked', () => {
    for (const role of [ROLE_KEYS.HR, ROLE_KEYS.CEO, ROLE_KEYS.MANAGER]) {
      expect(
        roleCanReach(role, PackageAlmController, 'addWorkComponents'),
      ).toBe(false);
      expect(roleCanReach(role, PackageAlmController, 'executeImport')).toBe(
        false,
      );
    }
  });

  it('leaves the CEO and managers without work profile and queue management', () => {
    for (const role of [ROLE_KEYS.CEO, ROLE_KEYS.MANAGER]) {
      expect(roleCanReach(role, WorkProfilesController, 'createUnit')).toBe(
        false,
      );
      expect(roleCanReach(role, WorkProfilesController, 'create')).toBe(false);
      expect(roleCanReach(role, WorkQueuesController, 'create')).toBe(false);
    }
  });

  it('keeps HR able to manage work profiles and queues, as before', () => {
    expect(
      roleCanReach(ROLE_KEYS.HR, WorkProfilesController, 'createUnit'),
    ).toBe(true);
    expect(roleCanReach(ROLE_KEYS.HR, WorkQueuesController, 'create')).toBe(
      true,
    );
  });

  it('holds no employees entity privilege at all', () => {
    const held = Object.entries(
      SYSTEM_ROLE_PRIVILEGES[ROLE_KEYS.SYSTEM_CUSTOMIZER],
    ).filter(
      ([key, level]) => key.startsWith('employees:') && level !== 'NONE',
    );
    expect(held).toEqual([]);
  });

  it('reaches no guarded route of the employees module', async () => {
    const reached: string[] = [];
    let checked = 0;
    for (const dir of ['employees']) {
      const root = resolve(process.cwd(), 'src', 'modules', dir);
      for (const file of readdirSync(root).filter((f) =>
        f.endsWith('.controller.ts'),
      )) {
        const loaded = (await import(resolve(root, file))) as Record<
          string,
          unknown
        >;
        for (const exported of Object.values(loaded)) {
          if (typeof exported !== 'function') continue;
          if (Reflect.getMetadata(PATH_METADATA, exported) === undefined) {
            continue;
          }
          const ctrl = exported as { prototype: object };
          for (const handler of Object.getOwnPropertyNames(
            ctrl.prototype,
          ).filter((name) => name !== 'constructor')) {
            // A handler declaring nothing is open to everyone by design.
            const declared =
              Reflect.getMetadata(
                'required_permissions',
                (ctrl.prototype as Record<string, object>)[handler],
              ) ??
              Reflect.getMetadata(
                'required_rbac_permissions',
                (ctrl.prototype as Record<string, object>)[handler],
              );
            if (!declared) continue;
            checked += 1;
            if (roleCanReach(ROLE_KEYS.SYSTEM_CUSTOMIZER, ctrl, handler)) {
              reached.push(`${file}:${handler}`);
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(20);
    expect(reached).toEqual([]);
  });
});
