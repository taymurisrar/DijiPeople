import { readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { REQUIRED_ENTITLEMENTS_KEY } from '../decorators/require-entitlement.decorator';
import { EntitlementGuard } from '../guards/entitlement.guard';
import {
  ENTITLEMENT_GATED_MODULES,
  ENTITLEMENT_UNGATED_MODULES,
  type TenantFeatureKey,
} from './tenant-features';

/*
 * BUG-1952 was a primitive that existed and was never called. The same thing
 * happens one controller at a time: a module is gated today, someone adds a
 * second controller to it next month, and the gate is silently partial — which
 * is worse than no gate, because it looks enforced.
 *
 * Read off real Nest metadata on the loaded classes, never off the source text.
 * A regex scan of this repository has been wrong before where the runtime
 * invariant was right, and a decorator that is commented out, aliased or
 * inherited is exactly what a scan gets wrong.
 */

function walk(dir: string, acc: string[] = []) {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (entry.endsWith('.controller.ts')) acc.push(full);
  }
  return acc;
}

type ControllerFacts = {
  name: string;
  file: string;
  moduleDir: string;
  guards: unknown[];
  entitlements: TenantFeatureKey[] | undefined;
};

async function collectControllers(): Promise<ControllerFacts[]> {
  const srcRoot = resolve(process.cwd(), 'src');
  const files = walk(resolve(srcRoot, 'modules'));
  const reflector = new Reflector();
  const found: ControllerFacts[] = [];

  for (const file of files) {
    const loaded = (await import(file)) as Record<string, unknown>;
    const rel = relative(srcRoot, file).replace(/\\/g, '/');
    const moduleDir = rel.split('/')[1] ?? '';

    for (const exported of Object.values(loaded)) {
      if (typeof exported !== 'function') continue;
      // @Controller() is what makes a class a routing surface.
      if (Reflect.getMetadata(PATH_METADATA, exported) === undefined) continue;

      found.push({
        name: exported.name,
        file: rel,
        moduleDir,
        guards:
          (Reflect.getMetadata(GUARDS_METADATA, exported) as unknown[]) ?? [],
        entitlements: reflector.get<TenantFeatureKey[]>(
          REQUIRED_ENTITLEMENTS_KEY,
          exported,
        ),
      });
    }
  }

  return found;
}

/*
 * Guard identity, never guard name — the lesson the permission invariant
 * already records about PlatformPermissionsGuard.
 */
function usesEntitlementGuard(guards: unknown[]) {
  return guards.some(
    (guard) => guard === EntitlementGuard || guard instanceof EntitlementGuard,
  );
}

describe('entitlement wiring invariants', () => {
  it('discovers controllers at all', async () => {
    const controllers = await collectControllers();
    expect(controllers.length).toBeGreaterThan(100);
  });

  it('gates every controller in a gated module, with that module key', async () => {
    const controllers = await collectControllers();
    const violations: string[] = [];
    let gated = 0;

    for (const controller of controllers) {
      const expectedKey = ENTITLEMENT_GATED_MODULES[controller.moduleDir];
      if (!expectedKey) continue;

      if (!usesEntitlementGuard(controller.guards)) {
        violations.push(
          `${controller.file} [${controller.name}] is in gated module "${controller.moduleDir}" but does not use EntitlementGuard`,
        );
        continue;
      }

      if (!controller.entitlements?.length) {
        violations.push(
          `${controller.file} [${controller.name}] uses EntitlementGuard but declares no @RequireEntitlement`,
        );
        continue;
      }

      if (!controller.entitlements.includes(expectedKey)) {
        violations.push(
          `${controller.file} [${controller.name}] declares ${controller.entitlements.join(',')} but module "${controller.moduleDir}" is sold as "${expectedKey}"`,
        );
        continue;
      }

      gated += 1;
    }

    expect(violations).toEqual([]);
    // A gate that stopped being applied anywhere would otherwise pass silently.
    expect(gated).toBeGreaterThanOrEqual(27);
  });

  /*
   * The other direction. A decorator landing on a module nobody decided to gate
   * refuses paying customers for a capability the plan never withheld.
   */
  it('declares an entitlement only where one was decided', async () => {
    const controllers = await collectControllers();

    const unexpected = controllers
      .filter((controller) => controller.entitlements?.length)
      .filter((controller) => !ENTITLEMENT_GATED_MODULES[controller.moduleDir])
      .map((controller) => `${controller.file} [${controller.name}]`);

    expect(unexpected).toEqual([]);
  });

  it('never carries the guard without the decorator that arms it', async () => {
    const controllers = await collectControllers();

    const armless = controllers
      .filter((controller) => usesEntitlementGuard(controller.guards))
      .filter((controller) => !controller.entitlements?.length)
      .map((controller) => `${controller.file} [${controller.name}]`);

    expect(armless).toEqual([]);
  });

  /*
   * The modules a reader would reasonably expect to find gated and will not.
   * Recorded so the omission reads as a decision rather than an oversight —
   * which is the difference between this and the defect the record describes.
   */
  it('leaves the deliberately ungated modules ungated', async () => {
    const controllers = await collectControllers();

    const contradictions = controllers
      .filter((controller) => ENTITLEMENT_UNGATED_MODULES[controller.moduleDir])
      .filter((controller) => controller.entitlements?.length)
      .map(
        (controller) =>
          `${controller.file} is gated, but "${controller.moduleDir}" is recorded as deliberately ungated`,
      );

    expect(contradictions).toEqual([]);
  });
});
