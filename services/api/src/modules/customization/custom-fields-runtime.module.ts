import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuditModule } from '../audit/audit.module';
import { CustomFieldValuesInterceptor } from './custom-field-values.interceptor';
import { CustomFieldValuesModule } from './custom-field-values.module';
import { CustomFieldsController } from './custom-fields.controller';

/*
 * TASK-0035 / ADR-0024 — custom field values for every system module.
 *
 * Registers `CustomFieldValuesInterceptor` globally (inert on any route without
 * `@CustomFields(...)`) and serves the field definitions each record page asks
 * for. Imported once, by AppModule; modules opt in with the decorator alone.
 */
@Module({
  imports: [JwtModule.register({}), CustomFieldValuesModule, AuditModule],
  controllers: [CustomFieldsController],
  providers: [
    JwtAuthGuard,
    PermissionsGuard,
    { provide: APP_INTERCEPTOR, useClass: CustomFieldValuesInterceptor },
  ],
})
export class CustomFieldsRuntimeModule {}
