import { readFileSync } from 'fs';
import { join } from 'path';

import { livenessReport } from './liveness';

describe('livenessReport', () => {
  it('reports ok with a timestamp and nothing else', () => {
    const report = livenessReport(() => new Date('2026-11-22T10:00:00.000Z'));
    expect(report).toEqual({
      status: 'ok',
      timestamp: '2026-11-22T10:00:00.000Z',
    });
  });

  it('answers synchronously, so no dependency can delay or fail it', () => {
    const report = livenessReport();
    expect(report).not.toBeInstanceOf(Promise);
    expect(report.status).toBe('ok');
  });

  it('is built from a module with no imports at all', () => {
    // The point of liveness is that nothing it could depend on can break it. A
    // future import of Prisma, config, a cache or another service would quietly
    // reintroduce exactly the coupling this route exists to avoid.
    const source = readFileSync(join(__dirname, 'liveness.ts'), 'utf8');
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/\bimport\b|\brequire\s*\(/);
  });
});

describe('the liveness route registration', () => {
  const main = readFileSync(join(__dirname, '..', '..', 'main.ts'), 'utf8');

  it('serves /api/health/live from livenessReport, not from the health payload', () => {
    expect(main).toMatch(
      /expressApp\.get\('\/api\/health\/live',[\s\S]{0,200}livenessReport\(/,
    );
  });

  it('registers liveness before the body parser and Nest router, like the other health routes', () => {
    expect(main.indexOf("'/api/health/live'")).toBeGreaterThan(-1);
    expect(main.indexOf("'/api/health/live'")).toBeLessThan(
      main.indexOf('cookieParser()'),
    );
  });
});
