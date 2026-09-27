import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateDocumentTypeDto } from './create-document-type.dto';

/*
 * TASK-0036 — what a tenant may change on its own document type. `key` is
 * accepted so a form that posts the whole record back is not refused, but the
 * service rejects a changed key: documents reference it. A type is never made
 * global from a tenant route (BUG-3809).
 */
export class UpdateDocumentTypeDto extends PartialType(
  OmitType(CreateDocumentTypeDto, ['isGlobal'] as const),
) {}
