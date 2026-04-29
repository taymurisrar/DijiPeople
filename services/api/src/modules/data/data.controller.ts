import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { DataService } from './data.service';
import { EntityQueryParams } from './entity-query.types';

@Controller('data')
@UseGuards(JwtAuthGuard)
export class DataController {
  constructor(private readonly dataService: DataService) {}

  @Get(':entityLogicalName')
  findMany(
    @Param('entityLogicalName') entityLogicalName: string,
    @Query() query: EntityQueryParams,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.dataService.findMany(entityLogicalName, query, user);
  }
}
