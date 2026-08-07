import type { Response } from 'express';

/**
 * Applies the response headers a CSV download needs.
 *
 * Every module's export endpoint sets the same two headers; centralising them
 * keeps the content type and filename quoting consistent so browsers save the
 * file rather than rendering it.
 */
export function setCsvDownloadHeaders(response: Response, filename: string) {
  const safeFilename = filename.replace(/["\\]/g, '');

  response.setHeader('Content-Type', 'text/csv; charset=utf-8');
  response.setHeader(
    'Content-Disposition',
    `attachment; filename="${safeFilename}"`,
  );
}
