import { Module } from '@nestjs/common';

import { PrismaModule } from '../../common/prisma/prisma.module';
import { CustomFieldValuesService } from './custom-field-values.service';

/*
 * TASK-0034 — deliberately tiny and dependency-free, so a system module
 * (Employees first) can store custom field values without importing the whole
 * Customization module and its guards.
 */
@Module({
  imports: [PrismaModule],
  providers: [CustomFieldValuesService],
  exports: [CustomFieldValuesService],
})
export class CustomFieldValuesModule {}
