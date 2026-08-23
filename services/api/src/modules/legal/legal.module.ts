import { Module } from '@nestjs/common';
import { LegalService } from './legal.service';
import { ConsentService } from './consent.service';
import { AdminLegalController } from './admin-legal.controller';
import { PublicLegalController } from './public-legal.controller';

/**
 * Exported rather than global: the modules that need it are the ones that
 * capture an acknowledgement (leads, partner experience, subscribe), and
 * keeping the import explicit means a new consumer of legal versions is
 * visible in the module graph rather than appearing by ambient magic.
 */
@Module({
  controllers: [PublicLegalController, AdminLegalController],
  providers: [LegalService, ConsentService],
  exports: [LegalService, ConsentService],
})
export class LegalModule {}
