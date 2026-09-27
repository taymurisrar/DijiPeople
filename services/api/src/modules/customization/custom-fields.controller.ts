import {
  Controller,
  Get,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';

import { AuthenticationOnly } from '../../common/decorators/authentication-only.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { CustomFieldValuesService } from './custom-field-values.service';
import { findSystemCustomizationTable } from './customization.registry';

/**
 * The published custom fields of one system module, for its record pages —
 * TASK-0035, ADR-0024.
 *
 * `@AuthenticationOnly()`: any signed-in tenant user may read them. They are the
 * tenant's own field definitions, already published to every signed-in user
 * through `/runtime-metadata/published`; this answers the same fact per table,
 * with each field's own read permission applied (a field the user may not read
 * is absent) and its write permission reflected as read-only. It takes a table
 * key, never a record or user id, so it cannot be pointed at anyone's data.
 */
@Controller('custom-fields')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CustomFieldsController {
  constructor(private readonly values: CustomFieldValuesService) {}

  @Get(':tableKey')
  @AuthenticationOnly()
  definitions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tableKey') tableKey: string,
  ) {
    const table = findSystemCustomizationTable(tableKey);
    if (!table?.isCustomizable) {
      throw new NotFoundException({
        code: 'CUSTOM_FIELDS_TABLE_NOT_FOUND',
        message: 'This module does not take custom fields.',
      });
    }
    return this.values.definitions(user, tableKey);
  }
}
