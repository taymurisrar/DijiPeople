import { Module } from '@nestjs/common';
import { AuditModule } from '../../modules/audit/audit.module';
import { PlatformNumberingService } from './platform-numbering.service';

/**
 * Platform number sequences (ADR-0027).
 *
 * Not `@Global`: the consumers are few and named — partners, partner
 * experience and the super-admin settings endpoints — and importing it
 * explicitly keeps "who issues platform numbers" answerable from the module
 * graph. PrismaService comes from the global PrismaModule.
 */
@Module({
  imports: [AuditModule],
  providers: [PlatformNumberingService],
  exports: [PlatformNumberingService],
})
export class NumberingModule {}
