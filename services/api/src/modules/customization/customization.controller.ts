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
import { CustomizationAccessGuard } from './customization-access.guard';
import { CreateModuleViewDto } from '../views/dto/create-module-view.dto';
import { UpdateModuleViewDto } from '../views/dto/update-module-view.dto';
import {
  CreateCustomizationColumnDto,
  CreateCustomizationFormDto,
  CreateCustomizationPackageDto,
  CreateCustomizationTableDto,
  CreateCustomizationViewDto,
  AddExistingPackageComponentsDto,
  EnsureCustomizationLayerDto,
  MoveCustomizationComponentsDto,
  PreviewCustomizationPackageImportDto,
  PublishCustomizationComponentsDto,
  UpdateCustomizationColumnDto,
  UpdateCustomizationFormDto,
  UpdateCustomizationPackageDto,
  UpdateCustomizationTableDto,
  UpdateCustomizationViewDto,
} from './dto/customization.dto';

@Controller('customization')
@UseGuards(JwtAuthGuard, PermissionsGuard, CustomizationAccessGuard)
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

  /*
   * Lookup options for a target module: id plus the module's primary name.
   *
   * Gated on `customization.read` rather than the target module's own read
   * permission, because this returns record names and the mapping from a
   * customization module to its runtime permission does not exist yet. That
   * keeps it to customization administrators, which is who the designer is
   * for — a runtime lookup control must not reuse this endpoint until the
   * per-module check is in place.
   */
  @Get('lookup-options/:tableKey')
  @Permissions('customization.read')
  listLookupOptions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tableKey') tableKey: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ) {
    return this.customizationService.listLookupOptions(
      user,
      tableKey,
      search,
      limit ? Number.parseInt(limit, 10) || 20 : 20,
    );
  }

  @Get('published')
  @Permissions('customization.read')
  getPublished(@CurrentUser() user: AuthenticatedUser) {
    return this.customizationService.getPublished(user);
  }

  @Get('default-solution')
  @Permissions('customization.read')
  getDefaultSolution(@CurrentUser() user: AuthenticatedUser) {
    return this.customizationService.getDefaultSolution(user);
  }

  @Get('publish-history')
  @Permissions('customization.read')
  getPublishHistory(@CurrentUser() user: AuthenticatedUser) {
    return this.customizationService.getPublishHistory(user);
  }

  @Get('publish/drafts')
  @Permissions('customization.read')
  listPublishDrafts(@CurrentUser() user: AuthenticatedUser) {
    return this.customizationService.listPublishDraftComponents(user);
  }

  @Post('layers/ensure')
  @Permissions('customization.publish')
  ensureCustomizationLayer(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: EnsureCustomizationLayerDto,
  ) {
    return this.customizationService.ensureCustomizationLayer(user, dto);
  }

  @Post('components/move')
  @Permissions('customization.publish')
  moveDraftComponents(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MoveCustomizationComponentsDto,
  ) {
    return this.customizationService.moveDraftComponents(user, dto);
  }

  @Post('publish/validate')
  @Permissions('customization.publish')
  validatePublishDrafts(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto?: Partial<PublishCustomizationComponentsDto>,
  ) {
    return this.customizationService.validatePublishDrafts(
      user,
      dto?.componentIds,
    );
  }

  @Post('publish/components')
  @Permissions('customization.publish')
  publishComponents(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PublishCustomizationComponentsDto,
  ) {
    return this.customizationService.publishComponents(user, dto.componentIds);
  }

  @Get('effective')
  @Permissions('customization.read')
  getEffectiveMetadata(@CurrentUser() user: AuthenticatedUser) {
    return this.customizationService.getEffectiveMetadata(user);
  }

  @Get('packages')
  @Permissions('customization.read')
  listPackages(@CurrentUser() user: AuthenticatedUser) {
    return this.customizationService.listPackages(user);
  }

  @Post('packages')
  @Permissions('customization.publish')
  createPackage(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCustomizationPackageDto,
  ) {
    return this.customizationService.createPackage(user, dto);
  }

  @Get('packages/import/preview')
  @Permissions('customization.read')
  getImportPreviewShell() {
    return {
      supported: true,
      applySupported: false,
      message:
        'JSON package import preview is available. Apply is not enabled.',
    };
  }

  @Post('packages/import/preview')
  @Permissions('customization.publish')
  previewPackageImport(@Body() dto: PreviewCustomizationPackageImportDto) {
    return this.customizationService.previewPackageImport(dto);
  }

  @Get('packages/:packageId')
  @Permissions('customization.read')
  getPackage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('packageId') packageId: string,
  ) {
    return this.customizationService.getPackage(user, packageId);
  }

  @Patch('packages/:packageId')
  @Permissions('customization.publish')
  updatePackage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('packageId') packageId: string,
    @Body() dto: UpdateCustomizationPackageDto,
  ) {
    return this.customizationService.updatePackage(user, packageId, dto);
  }

  @Delete('packages/:packageId')
  @Permissions('customization.publish')
  deletePackage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('packageId') packageId: string,
  ) {
    return this.customizationService.deletePackage(user, packageId);
  }

  @Get('packages/:packageId/candidates')
  @Permissions('customization.read')
  listPackageComponentCandidates(
    @CurrentUser() user: AuthenticatedUser,
    @Param('packageId') packageId: string,
    @Query('moduleKey') moduleKey?: string,
    @Query('componentType') componentType?: string,
  ) {
    return this.customizationService.listPackageComponentCandidates(user, {
      packageId,
      moduleKey,
      componentType,
    });
  }

  @Post('packages/:packageId/components')
  @Permissions('customization.publish')
  addExistingComponentsToPackage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('packageId') packageId: string,
    @Body() dto: AddExistingPackageComponentsDto,
  ) {
    return this.customizationService.addExistingComponentsToPackage(
      user,
      packageId,
      dto,
    );
  }

  @Post('packages/:packageId/validate')
  @Permissions('customization.publish')
  validatePackage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('packageId') packageId: string,
  ) {
    return this.customizationService.validatePackage(user, packageId);
  }

  @Post('packages/:packageId/publish')
  @Permissions('customization.publish')
  publishPackage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('packageId') packageId: string,
  ) {
    return this.customizationService.publishPackage(user, packageId);
  }

  @Delete('packages/:packageId/components/:componentId')
  @Permissions('customization.publish')
  removeComponentFromPackage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('packageId') packageId: string,
    @Param('componentId') componentId: string,
  ) {
    return this.customizationService.removeComponentFromPackage(
      user,
      packageId,
      componentId,
    );
  }

  @Delete('packages/:packageId/components/:componentId/metadata')
  @Permissions('customization.publish')
  deletePackageComponentMetadata(
    @CurrentUser() user: AuthenticatedUser,
    @Param('packageId') packageId: string,
    @Param('componentId') componentId: string,
  ) {
    return this.customizationService.deletePackageComponentMetadata(
      user,
      packageId,
      componentId,
    );
  }

  /*
   * The pre-flight for an export: what this package references but does not
   * carry. Separate from the download so the list can be shown and acted on
   * before anyone takes the file to another tenant.
   */
  @Get('packages/:packageId/export-readiness')
  @Permissions('customization.read')
  getPackageExportReadiness(
    @CurrentUser() user: AuthenticatedUser,
    @Param('packageId') packageId: string,
  ) {
    return this.customizationService.getPackageExportReadiness(user, packageId);
  }

  @Get('packages/:packageId/export')
  @Permissions('customization.read')
  exportPackage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('packageId') packageId: string,
  ) {
    return this.customizationService.exportPackage(user, packageId);
  }

  @Get('tables')
  @Permissions('customization.tables.read')
  listTables(@CurrentUser() user: AuthenticatedUser) {
    return this.customizationService.listTables(user);
  }

  @Post('tables')
  @Permissions('customization.tables.update')
  createTable(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCustomizationTableDto,
  ) {
    return this.customizationService.createTable(user, dto);
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

  @Delete('tables/:tableKey')
  @Permissions('customization.tables.update')
  deleteTable(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tableKey') tableKey: string,
  ) {
    return this.customizationService.deleteTable(user, tableKey);
  }

  @Get('tables/:tableKey/dependencies')
  @Permissions('customization.tables.read')
  getTableDependencies(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tableKey') tableKey: string,
  ) {
    return this.customizationService.getTableDependencies(user, tableKey);
  }

  @Get('tables/:tableKey/metadata-components')
  @Permissions('customization.tables.read')
  listModuleMetadataComponents(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tableKey') tableKey: string,
    @Query('componentType') componentType: string,
  ) {
    return this.customizationService.listModuleMetadataComponents(
      user,
      tableKey,
      componentType,
    );
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

  @Get('tables/:tableKey/columns/:columnKey/dependencies')
  @Permissions('customization.columns.read')
  getColumnDependencies(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tableKey') tableKey: string,
    @Param('columnKey') columnKey: string,
  ) {
    return this.customizationService.getColumnDependencies(
      user,
      tableKey,
      columnKey,
    );
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
