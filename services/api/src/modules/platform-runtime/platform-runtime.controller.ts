import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PlatformRuntimeService } from './platform-runtime.service';
import type { PlatformRuntimeQuery } from './platform-runtime.types';
@UseGuards(JwtAuthGuard)
@Controller('platform-runtime')
export class PlatformRuntimeController {
  constructor(private readonly service: PlatformRuntimeService) {}
  @Get(':moduleKey/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async export(
    @CurrentUser() user: AuthenticatedUser,
    @Param('moduleKey') moduleKey: string,
    @Query() query: PlatformRuntimeQuery,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${moduleKey}.csv"`,
    );
    return this.service.export(user, moduleKey, query);
  }
  @Post(':moduleKey/actions/:action') action(
    @CurrentUser() user: AuthenticatedUser,
    @Param('moduleKey') moduleKey: string,
    @Param('action') action: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.execute(user, moduleKey, action, body);
  }
  @Post(':moduleKey/:id/actions/:action') recordAction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('moduleKey') moduleKey: string,
    @Param('id') id: string,
    @Param('action') action: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.execute(user, moduleKey, action, body, id);
  }
  @Get(':moduleKey/:id/timeline') timeline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('moduleKey') moduleKey: string,
    @Param('id') id: string,
  ) {
    return this.service.timeline(user, moduleKey, id);
  }
  @Post(':moduleKey/:id/timeline') addTimeline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('moduleKey') moduleKey: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.addTimeline(user, moduleKey, id, body);
  }
  @Get(':moduleKey/:id/process') process(
    @CurrentUser() user: AuthenticatedUser,
    @Param('moduleKey') moduleKey: string,
    @Param('id') id: string,
  ) {
    return this.service.process(user, moduleKey, id);
  }
  @Patch(':moduleKey/:id/process') updateProcess(
    @CurrentUser() user: AuthenticatedUser,
    @Param('moduleKey') moduleKey: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.updateProcess(user, moduleKey, id, body);
  }
  @Get(':moduleKey/:id/related/:relationshipKey') related(
    @CurrentUser() user: AuthenticatedUser,
    @Param('moduleKey') moduleKey: string,
    @Param('id') id: string,
    @Param('relationshipKey') relationshipKey: string,
    @Query() query: PlatformRuntimeQuery,
  ) {
    return this.service.related(user, moduleKey, id, relationshipKey, query);
  }
  @Post(':moduleKey/validate') validate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('moduleKey') moduleKey: string,
    @Body() body: { values?: Record<string, unknown>; mode?: string },
  ) {
    return this.service.validate(user, moduleKey, body);
  }
  @Get(':moduleKey') list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('moduleKey') moduleKey: string,
    @Query() query: PlatformRuntimeQuery,
  ) {
    return this.service.list(user, moduleKey, query);
  }
  @Post(':moduleKey') create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('moduleKey') moduleKey: string,
    @Body() body: { values?: Record<string, unknown> },
  ) {
    return this.service.create(user, moduleKey, body);
  }
  @Get(':moduleKey/:id') get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('moduleKey') moduleKey: string,
    @Param('id') id: string,
  ) {
    return this.service.get(user, moduleKey, id);
  }
  @Patch(':moduleKey/:id') update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('moduleKey') moduleKey: string,
    @Param('id') id: string,
    @Body() body: { values?: Record<string, unknown>; version?: number },
  ) {
    return this.service.update(user, moduleKey, id, body);
  }
  @Delete(':moduleKey/:id') remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('moduleKey') moduleKey: string,
    @Param('id') id: string,
  ) {
    return this.service.remove(user, moduleKey, id);
  }
}
