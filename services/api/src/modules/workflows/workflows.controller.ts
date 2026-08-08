import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { CreateWorkflowDto, UpdateWorkflowDto } from './dto/workflow.dto';
import { WorkflowsService } from './workflows.service';

@Controller('workflows')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Get()
  @Permissions('workflows.read')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.workflowsService.list(user);
  }

  /* Registered before :id so it is not read as a workflow id. */
  @Get('builder-options')
  @Permissions('workflows.read')
  builderOptions(@CurrentUser() user: AuthenticatedUser) {
    return this.workflowsService.builderOptions(user);
  }

  @Get(':id')
  @Permissions('workflows.read')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.workflowsService.get(user, id);
  }

  @Get(':id/runs')
  @Permissions('workflows.read')
  listRuns(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.workflowsService.listRuns(user, id);
  }

  @Post()
  @Permissions('workflows.manage')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWorkflowDto,
  ) {
    return this.workflowsService.create(user, dto);
  }

  @Patch(':id')
  @Permissions('workflows.manage')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateWorkflowDto,
  ) {
    return this.workflowsService.update(user, id, dto);
  }

  @Delete(':id')
  @Permissions('workflows.manage')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.workflowsService.remove(user, id);
  }
}
