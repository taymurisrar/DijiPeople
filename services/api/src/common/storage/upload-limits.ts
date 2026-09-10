import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

const MB = 1024 * 1024;

/**
 * The maximum body every multipart endpoint will accept, by content category.
 *
 * These are enforced by multer at the stream boundary, which is the part that
 * matters. The previous implementation checked `file.size` inside the service —
 * after the entire upload had already been read into the heap — so a handful of
 * concurrent large posts could exhaust the 1.5 GB process cap and kill the
 * single production instance (FILE-05). A limit that runs after the allocation
 * is not a limit.
 *
 * Sizes are per category rather than one global number because the categories
 * genuinely differ: a spreadsheet import is not a desktop installer, and giving
 * a CSV endpoint the installer's ceiling hands an attacker the larger one.
 */
export const UPLOAD_LIMITS = {
  /** Scanned IDs, contracts, certificates. The general tenant document ceiling. */
  document: 10 * MB,
  /** Profile photographs. Raster images that have no business being larger. */
  image: 5 * MB,
  /** Branding assets shown in the product chrome. */
  brandingAsset: 3 * MB,
  /** CSV/XLSX imports: attendance, timesheets, payroll, generic data import. */
  spreadsheet: 15 * MB,
  /** Candidate CVs and cover letters. */
  resume: 10 * MB,
  /** Desktop agent installers, published by platform staff only. */
  releaseArtifact: 512 * MB,
} as const;

export type UploadCategory = keyof typeof UPLOAD_LIMITS;

/**
 * Multer options for a single-file endpoint of the given category.
 *
 * `files: 1` matters as much as `fileSize`: without it a caller can send many
 * files that are each under the limit, and the limit bounds none of them
 * collectively. `fields` and `parts` are bounded for the same reason.
 */
export function uploadLimits(category: UploadCategory): MulterOptions {
  return {
    limits: {
      fileSize: UPLOAD_LIMITS[category],
      files: 1,
      // A multipart body is not only its file. Unbounded field counts are their
      // own memory-exhaustion shape.
      fields: 32,
      parts: 40,
      fieldSize: 128 * 1024,
    },
  };
}
