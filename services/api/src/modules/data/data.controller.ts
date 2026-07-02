import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { DataService } from './data.service';
import { CustomDataService } from './custom-data.service';
import { EntityQueryParams } from './entity-query.types';

@Controller('data')
@UseGuards(JwtAuthGuard)
export class DataController {
  constructor(
    private readonly dataService: DataService,
    private readonly customDataService: CustomDataService,
  ) {}

  @Get(':entityLogicalName')
  async findMany(
    @Param('entityLogicalName') entityLogicalName: string,
    @Query() query: EntityQueryParams,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (await this.customDataService.isCustomTable(entityLogicalName, user.tenantId)) {
      return this.customDataService.findMany(entityLogicalName, query, user);
    }
    return this.dataService.findMany(entityLogicalName, query, user);
  }

  @Post(':entityLogicalName')
  create(
    @Param('entityLogicalName') entityLogicalName: string,
    @Query() query: EntityQueryParams,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.customDataService.create(entityLogicalName, query, body, user);
  }

  @Patch(':entityLogicalName/:recordId')
  update(
    @Param('entityLogicalName') entityLogicalName: string,
    @Param('recordId') recordId: string,
    @Query() query: EntityQueryParams,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.customDataService.update(
      entityLogicalName,
      recordId,
      query,
      body,
      user,
    );
  }

  @Delete(':entityLogicalName/:recordId')
  deleteOne(
    @Param('entityLogicalName') entityLogicalName: string,
    @Param('recordId') recordId: string,
    @Query() query: EntityQueryParams,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.customDataService.softDelete(
      entityLogicalName,
      [recordId],
      query,
      user,
    );
  }

  @Delete(':entityLogicalName')
  deleteMany(
    @Param('entityLogicalName') entityLogicalName: string,
    @Query() query: EntityQueryParams,
    @Body() body: { recordIds?: string[] },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.customDataService.softDelete(
      entityLogicalName,
      body.recordIds ?? [],
      query,
      user,
    );
  }
}
