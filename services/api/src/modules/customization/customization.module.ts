import { Module } from '@nestjs/common';

import { PrismaModule } from '../../common/prisma/prisma.module';
import { SecretEncryptionService } from '../../common/security/secret-encryption.service';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CustomizationController } from './customization.controller';
import { CustomizationRuntimeController } from './customization-runtime.controller';
import { CustomizationAccessGuard } from './customization-access.guard';
import { CustomizationService } from './customization.service';
import { PackageAlmController } from './package-alm.controller';
import { PackageAlmService } from './package-alm.service';
import { PackagePortableReader } from './package-portable.reader';

@Module({
  imports: [PrismaModule, AuthModule, AuditModule],
  controllers: [
    CustomizationController,
    CustomizationRuntimeController,
    PackageAlmController,
  ],
  providers: [
    CustomizationService,
    CustomizationAccessGuard,
    PackageAlmService,
    PackagePortableReader,
    // Not global: provided per module, as AgentModule does for DLP.
    SecretEncryptionService,
  ],
  exports: [CustomizationService, PackageAlmService],
})
export class CustomizationModule {}
