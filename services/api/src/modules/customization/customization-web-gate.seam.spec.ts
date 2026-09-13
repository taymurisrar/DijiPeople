import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import type { ExecutionContext } from '@nestjs/common';
import { REQUIRED_PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import { CustomizationAccessGuard } from './customization-access.guard';
import { CustomizationController } from './customization.controller';
import { CUSTOMIZATION_COMPONENT_WRITE_KEYS } from './customization.service';

/*
 * SEAM — BUG-3491 / ADR-0013. The web Customization pages and the API must
 * name the same permission keys.
 *
 * BUG-3374 was fixed with a web-only test; the page gate moved to permissions
 * while the API guard stayed on roles, and the workspace owner went from a
 * silent redirect to a server error on every screen. The regression test passed
 * the whole time, because nothing crossed from one side to the other.
 *
 * This reads the web's page map (`customization-page-permissions.json`, which
 * the pages gate on) and, for each API route a page loads, the keys the real
 * controller handler declares. A page must require at least those keys: if it
 * requires fewer, a user it admits is refused by its own data load. Then it runs
 * the real guard for a user holding exactly the page's keys, on every route.
 */
type PageMap = {
  pages: Record<
    string,
    { requires: string[]; calls: Array<[keyof typeof RequestMethod, string]> }
  >;
  componentWriteKeys: Record<string, string>;
};

const PAGE_MAP = JSON.parse(
  readFileSync(
    join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      '..',
      'apps',
      'web',
      'app',
      '(authenticated)',
      'settings',
      'customization',
      '_lib',
      'customization-page-permissions.json',
    ),
    'utf8',
  ),
) as PageMap;

const reflector = new Reflector();

type Route = { name: string; handler: object; keys: string[] };

function routes(): Map<string, Route> {
  const byRoute = new Map<string, Route>();
  const prototype = CustomizationController.prototype as unknown as Record<
    string,
    object
  >;
  for (const name of Object.getOwnPropertyNames(prototype)) {
    if (name === 'constructor') continue;
    const handler = prototype[name];
    const method = Reflect.getMetadata(METHOD_METADATA, handler) as
      | RequestMethod
      | undefined;
    if (method === undefined) continue;
    const path = Reflect.getMetadata(PATH_METADATA, handler) as string;
    const keys =
      reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [
        handler as () => unknown,
        CustomizationController,
      ]) ?? [];
    byRoute.set(`${RequestMethod[method]} ${path}`, { name, handler, keys });
  }
  return byRoute;
}

describe('Customization web page gates ↔ API decorators', () => {
  const byRoute = routes();
  const pages = Object.entries(PAGE_MAP.pages);

  it('has pages to check', () => {
    expect(pages.length).toBeGreaterThan(5);
  });

  it.each(pages)(
    '%s requires every key its API calls declare',
    (_page, page) => {
      const missingRoutes: string[] = [];
      const uncovered: string[] = [];

      for (const [method, path] of page.calls) {
        const route = byRoute.get(`${method} ${path}`);
        if (!route) {
          missingRoutes.push(`${method} ${path}`);
          continue;
        }
        for (const key of route.keys) {
          if (!page.requires.includes(key)) {
            uncovered.push(`${method} ${path} needs ${key}`);
          }
        }
      }

      expect(missingRoutes).toEqual([]);
      expect(uncovered).toEqual([]);
    },
  );

  it.each(pages)(
    '%s: a user holding exactly its keys, and no customizer role, passes the real guard on every call',
    (_page, page) => {
      const guard = new CustomizationAccessGuard(reflector);
      for (const [method, path] of page.calls) {
        const route = byRoute.get(`${method} ${path}`);
        if (!route) continue;
        const request = {
          user: { roleKeys: ['system-admin'], permissionKeys: page.requires },
        } as unknown as AuthenticatedRequest;
        const context = {
          switchToHttp: () => ({ getRequest: () => request }),
          getHandler: () => route.handler,
          getClass: () => CustomizationController,
        } as unknown as ExecutionContext;

        expect(guard.canActivate(context)).toBe(true);
      }
    },
  );

  it('declares a permission on every customization route', () => {
    const undeclared = [...byRoute.entries()]
      .filter(([, route]) => route.keys.length === 0)
      .map(([key]) => key);
    expect(undeclared).toEqual([]);
  });

  it('agrees with the service on the key that writes each metadata component type', () => {
    expect(PAGE_MAP.componentWriteKeys).toEqual(
      CUSTOMIZATION_COMPONENT_WRITE_KEYS,
    );
  });
});
