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
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { CustomizationService } from './customization.service';
import { CreateModuleViewDto } from '../views/dto/create-module-view.dto';
import { UpdateModuleViewDto } from '../views/dto/update-module-view.dto';
import {
  CreateCustomizationColumnDto,
  CreateCustomizationFormDto,
  CreateCustomizationViewDto,
  UpdateCustomizationColumnDto,
  UpdateCustomizationFormDto,
  UpdateCustomizationTableDto,
  UpdateCustomizationViewDto,
} from './dto/customization.dto';

@Controller('customization')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CustomizationController {
  constructor(private readonly customizationService: CustomizationService) {}

  @Get()
  @Permissions('customization.read')
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.customizationService.getSummary(user);
  }

  @Post('publish')
  @Permissions('customization.publish')
  publish(@CurrentUser() user: AuthenticatedUser) {
    return this.customizationService.publish(user);
  }

  @Get('published')
  @Permissions('customization.read')
  getPublished(@CurrentUser() user: AuthenticatedUser) {
    return this.customizationService.getPublished(user);
  }

  @Get('publish-history')
  @Permissions('customization.read')
  getPublishHistory(@CurrentUser() user: AuthenticatedUser) {
    return this.customizationService.getPublishHistory(user);
  }

  @Get('tables')
  @Permissions('customization.tables.read')
  listTables(@CurrentUser() user: AuthenticatedUser) {
    return this.customizationService.listTables(user);
  }

  @Get('tables/:tableKey')
  @Permissions('customization.tables.read')
  getTable(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tableKey') tableKey: string,
  ) {
    return this.customizationService.getTable(user, tableKey);
  }

  @Patch('tables/:tableKey')
  @Permissions('customization.tables.update')
  updateTable(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tableKey') tableKey: string,
    @Body() dto: UpdateCustomizationTableDto,
  ) {
    return this.customizationService.updateTable(user, tableKey, dto);
  }

  @Get('tables/:tableKey/columns')
  @Permissions('customization.columns.read')
  listColumns(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tableKey') tableKey: string,
  ) {
    return this.customizationService.listColumns(user, tableKey);
  }

  @Post('tables/:tableKey/columns')
  @Permissions('customization.columns.create')
  createColumn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tableKey') tableKey: string,
    @Body() dto: CreateCustomizationColumnDto,
  ) {
    return this.customizationService.createColumn(user, tableKey, dto);
  }

  @Patch('tables/:tableKey/columns/:columnKey')
  @Permissions('customization.columns.update')
  updateColumn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tableKey') tableKey: string,
    @Param('columnKey') columnKey: string,
    @Body() dto: UpdateCustomizationColumnDto,
  ) {
    return this.customizationService.updateColumn(
      user,
      tableKey,
      columnKey,
      dto,
    );
  }

  @Delete('tables/:tableKey/columns/:columnKey')
  @Permissions('customization.columns.delete')
  deleteColumn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tableKey') tableKey: string,
    @Param('columnKey') columnKey: string,
  ) {
    return this.customizationService.deleteColumn(user, tableKey, columnKey);
  }

  @Get('tables/:tableKey/forms')
  @Permissions('customization.forms.read')
  listForms(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tableKey') tableKey: string,
  ) {
    return this.customizationService.listForms(user, tableKey);
  }

  @Get('tables/:tableKey/views')
  @Permissions('customization.views.read')
  listTableViews(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tableKey') tableKey: string,
  ) {
    return this.customizationService.listTableViews(user, tableKey);
  }

  @Post('tables/:tableKey/views')
  @Permissions('customization.views.create')
  createTableView(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tableKey') tableKey: string,
    @Body() dto: CreateCustomizationViewDto,
  ) {
    return this.customizationService.createTableView(user, tableKey, dto);
  }

  @Patch('tables/:tableKey/views/:viewKey')
  @Permissions('customization.views.update')
  updateTableView(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tableKey') tableKey: string,
    @Param('viewKey') viewKey: string,
    @Body() dto: UpdateCustomizationViewDto,
  ) {
    return this.customizationService.updateTableView(
      user,
      tableKey,
      viewKey,
      dto,
    );
  }

  @Delete('tables/:tableKey/views/:viewKey')
  @Permissions('customization.views.delete')
  deleteTableView(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tableKey') tableKey: string,
    @Param('viewKey') viewKey: string,
  ) {
    return this.customizationService.deleteTableView(user, tableKey, viewKey);
  }

  @Post('tables/:tableKey/views/:viewKey/hide')
  @Permissions('customization.views.update')
  hideTableView(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tableKey') tableKey: string,
    @Param('viewKey') viewKey: string,
  ) {
    return this.customizationService.setTableViewHidden(
      user,
      tableKey,
      viewKey,
      true,
    );
  }

  @Post('tables/:tableKey/views/:viewKey/unhide')
  @Permissions('customization.views.update')
  unhideTableView(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tableKey') tableKey: string,
    @Param('viewKey') viewKey: string,
  ) {
    return this.customizationService.setTableViewHidden(
      user,
      tableKey,
      viewKey,
      false,
    );
  }

  @Post('tables/:tableKey/views/:viewKey/set-default')
  @Permissions('customization.views.update')
  setDefaultTableView(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tableKey') tableKey: string,
    @Param('viewKey') viewKey: string,
  ) {
    return this.customizationService.setDefaultTableView(
      user,
      tableKey,
      viewKey,
    );
  }

  @Get('views')
  @Permissions('customization.views.read')
  listViews(
    @CurrentUser() user: AuthenticatedUser,
    @Query('moduleKey') moduleKey?: string,
  ) {
    return this.customizationService.listViews(user, moduleKey);
  }

  @Post('views')
  @Permissions('customization.views.create')
  createView(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateModuleViewDto,
  ) {
    return this.customizationService.createView(user, dto);
  }

  @Patch('views/:id')
  @Permissions('customization.views.update')
  updateView(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateModuleViewDto,
  ) {
    return this.customizationService.updateView(user, id, dto);
  }

  @Delete('views/:id')
  @Permissions('customization.views.delete')
  deleteView(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.customizationService.deleteView(user, id);
  }

  @Post('tables/:tableKey/forms')
  @Permissions('customization.forms.create')
  createForm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tableKey') tableKey: string,
    @Body() dto: CreateCustomizationFormDto,
  ) {
    return this.customizationService.createForm(user, tableKey, dto);
  }

  @Patch('tables/:tableKey/forms/:formKey')
  @Permissions('customization.forms.update')
  updateForm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tableKey') tableKey: string,
    @Param('formKey') formKey: string,
    @Body() dto: UpdateCustomizationFormDto,
  ) {
    return this.customizationService.updateForm(user, tableKey, formKey, dto);
  }

  @Delete('tables/:tableKey/forms/:formKey')
  @Permissions('customization.forms.delete')
  deleteForm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tableKey') tableKey: string,
    @Param('formKey') formKey: string,
  ) {
    return this.customizationService.deleteForm(user, tableKey, formKey);
  }

  @Post('tables/:tableKey/forms/:formKey/set-default')
  @Permissions('customization.forms.update')
  setDefaultForm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tableKey') tableKey: string,
    @Param('formKey') formKey: string,
  ) {
    return this.customizationService.setDefaultForm(user, tableKey, formKey);
  }
}
