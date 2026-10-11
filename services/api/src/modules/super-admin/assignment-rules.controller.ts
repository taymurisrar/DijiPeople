import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  PlatformPermissionsGuard,
  RequirePlatformPermission,
} from '../platform-auth/platform-permissions';
import { AssignmentRulesService } from './assignment-rules.service';
import {
  AssignmentRuleQueryDto,
  CreateAssignmentRuleDto,
  TestAssignmentRuleDto,
  UpdateAssignmentRuleDto,
} from './dto/assignment-rule.dto';
import { RecordAssignmentService } from './record-assignment.service';

/*
 * Permissions are declared per handler rather than derived from the route:
 * `resolvePlatformPermission` maps by path substring and has no entry for
 * `assignment-rules`, and an unresolved path is refused outright. Ownership
 * rules change who sees every lead and customer, so writes need
 * `settings.manage`; reading and the dry run need only `settings.read`.
 */
@UseGuards(JwtAuthGuard, PlatformPermissionsGuard)
@Controller('super-admin/assignment-rules')
export class AssignmentRulesController {
  constructor(
    private readonly rules: AssignmentRulesService,
    private readonly assignment: RecordAssignmentService,
  ) {}

  @Get()
  @RequirePlatformPermission('settings.read')
  list(@Query() query: AssignmentRuleQueryDto) {
    return this.rules.list(query.moduleKey);
  }

  // Declared before ':id' routes so "test" is never parsed as an id.
  @Post('test')
  @RequirePlatformPermission('settings.read')
  test(@Body() dto: TestAssignmentRuleDto) {
    return this.assignment.test(dto.moduleKey, dto.record);
  }

  @Get(':id')
  @RequirePlatformPermission('settings.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.rules.get(id);
  }

  @Post()
  @RequirePlatformPermission('settings.manage')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAssignmentRuleDto,
  ) {
    return this.rules.create(user, dto);
  }

  @Patch(':id')
  @RequirePlatformPermission('settings.manage')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssignmentRuleDto,
  ) {
    return this.rules.update(user, id, dto);
  }

  @Post(':id/enable')
  @RequirePlatformPermission('settings.manage')
  enable(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.rules.setActive(user, id, true);
  }

  @Post(':id/disable')
  @RequirePlatformPermission('settings.manage')
  disable(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.rules.setActive(user, id, false);
  }

  @Delete(':id')
  @RequirePlatformPermission('settings.manage')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.rules.remove(user, id);
  }
}
