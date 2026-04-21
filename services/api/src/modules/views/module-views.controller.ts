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
import { ModuleViewsService } from './module-views.service';
import { CreateModuleViewDto } from './dto/create-module-view.dto';
import { UpdateModuleViewDto } from './dto/update-module-view.dto';

@Controller('module-views')
@UseGuards(JwtAuthGuard)
export class ModuleViewsController {
  constructor(private readonly moduleViewsService: ModuleViewsService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('moduleKey') moduleKey?: string,
  ) {
    return this.moduleViewsService.listForCurrentTenant(user, moduleKey);
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateModuleViewDto,
  ) {
    return this.moduleViewsService.createForCurrentTenant(user, dto);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateModuleViewDto,
  ) {
    return this.moduleViewsService.updateForCurrentTenant(user, id, dto);
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.moduleViewsService.removeForCurrentTenant(user, id);
  }
}
