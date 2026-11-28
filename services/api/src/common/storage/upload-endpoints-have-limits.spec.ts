import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * BUG-3179. Multer buffers a whole upload in memory before any service-level
 * size check can run, so an endpoint without a multipart limit lets one request
 * allocate as much memory as the sender chooses. Nine of ten upload endpoints
 * had none. They all carry limits now (`uploadLimits(category)` or an explicit
 * `limits`), and this keeps it that way: a controller that accepts an uploaded
 * file without declaring a limit fails here, not in an out-of-memory restart.
 */
const SRC = join(__dirname, '..', '..');

function controllerFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...controllerFiles(path));
    else if (path.endsWith('.controller.ts')) out.push(path);
  }
  return out;
}

/** Counts of upload handlers vs interceptors that declare limits, per file. */
function analyse(source: string) {
  const handlers = (source.match(/@UploadedFiles?\s*\(/g) ?? []).length;
  const interceptors = [
    ...source.matchAll(
      /@UseInterceptors\s*\(([\s\S]*?)\)\s*(?:\n\s*)?(?:@|\w+\s*\()/g,
    ),
  ].map((m) => m[1]);
  const upload = interceptors.filter((text) =>
    /File(s|Fields|sInterceptor)?Interceptor/.test(text),
  );
  const withLimits = upload.filter((text) =>
    /uploadLimits\s*\(|limits\s*:/.test(text),
  );
  return {
    handlers,
    uploadInterceptors: upload.length,
    withLimits: withLimits.length,
  };
}

describe('upload endpoints declare a size limit (BUG-3179)', () => {
  const files = controllerFiles(SRC).filter((f) =>
    /@UploadedFiles?\s*\(/.test(readFileSync(f, 'utf8')),
  );

  it('finds the upload controllers it is meant to guard', () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  it.each(files.map((f) => [relative(SRC, f), f]))(
    '%s: every upload interceptor sets limits',
    (_name, file) => {
      const result = analyse(readFileSync(file, 'utf8'));
      expect(result.uploadInterceptors).toBeGreaterThan(0);
      expect({
        file: _name,
        withoutLimits: result.uploadInterceptors - result.withLimits,
      }).toEqual({ file: _name, withoutLimits: 0 });
    },
  );
});
