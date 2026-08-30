import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  Permissions,
  RequirePermission,
  RequireAnyPermission,
} from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { AssignManagerDto } from './dto/assign-manager.dto';
import { AssignOwnerDto, BulkAssignOwnerDto } from './dto/assign-owner.dto';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { EmployeeQueryDto } from './dto/employee-query.dto';
import { CreateEmployeeEducationDto } from './dto/create-employee-education.dto';
import { CreateEmployeeHistoryDto } from './dto/create-employee-history.dto';
import { CreateEmployeePreviousEmploymentDto } from './dto/create-employee-previous-employment.dto';
import { EmployeeDocumentUploadDto } from './dto/employee-document-upload.dto';
import { ProvisionEmployeeAccessDto } from './dto/provision-employee-access.dto';
import { TerminateEmployeeDto } from './dto/terminate-employee.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { UpdateEmployeeEducationDto } from './dto/update-employee-education.dto';
import { UpdateEmployeePreviousEmploymentDto } from './dto/update-employee-previous-employment.dto';
import { UpdateEmergencyContactDto } from './dto/update-emergency-contact.dto';
import { UpdatePersonalInfoDto } from './dto/update-personal-info.dto';
import { UpsertEmployeeCompensationDto } from './dto/upsert-employee-compensation.dto';
import { EmployeeProfilesService } from './employee-profiles.service';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeesService } from './employees.service';
import { BulkDeleteEmployeesDto } from './dto/bulk-delete-employees.dto';

type UploadedFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

@Controller('employees')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EmployeesController {
  constructor(
    private readonly employeesService: EmployeesService,
    private readonly employeeProfilesService: EmployeeProfilesService,
  ) {}

  @Post('duplicate-check')
  @Permissions('employees.create')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'create')
  checkDuplicates(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEmployeeDto,
  ) {
    return this.employeesService.checkDuplicates(user, dto);
  }

  @Get()
  @Permissions('employees.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: EmployeeQueryDto,
  ) {
    return this.employeesService.findByTenant(user, query);
  }

  @Delete('bulk-delete')
  @Permissions('employees.delete')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'delete')
  bulkDelete(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BulkDeleteEmployeesDto,
  ) {
    return this.employeesService.bulkDelete(user, dto);
  }

  @Patch('assign-owner')
  @Permissions('employees.assign')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'assign')
  assignOwnerBulk(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BulkAssignOwnerDto,
  ) {
    return this.employeesService.assignOwner(
      user,
      dto.employeeIds,
      dto.ownerUserId,
    );
  }

  @Get('owner-options')
  @Permissions('employees.assign')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'assign')
  ownerOptions(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') query = '',
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '25',
  ) {
    return this.employeesService.getOwnerOptions(
      user,
      query,
      Number(page),
      Number(pageSize),
    );
  }

  @Get('export')
  @Permissions('employees.export')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  async exportEmployees(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: EmployeeQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.employeesService.exportEmployees(user, query);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    return new StreamableFile(file.buffer);
  }

  @Post('import')
  @Permissions('employees.create')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'create')
  @UseInterceptors(FileInterceptor('file'))
  async importEmployees(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: UploadedFile | undefined,
  ) {
    return this.employeesService.importEmployees(user, file);
  }

  @Get('export-template')
  @Permissions('employees.export')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  exportTemplate(@Res({ passthrough: true }) response: Response) {
    const file = this.employeesService.exportEmployeeTemplate();
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    return new StreamableFile(file.buffer);
  }

  @Get('linking-search')
  @Permissions('employees.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  searchForLinking(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') query = '',
  ) {
    return this.employeesService.searchForUserLinking(user, query);
  }

  @Get('me/context')
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  getCurrentEmployeeContext(@CurrentUser() user: AuthenticatedUser) {
    return this.employeesService.getCurrentEmployeeContext(user);
  }

  /*
   * Both `me/` routes live here, above every `:employeeId` route, and must stay
   * here.
   *
   * This one used to sit two hundred lines below, after
   * `@Get(':employeeId/direct-reports')`. Express matches in declaration order,
   * so `GET /employees/me/direct-reports` was matched by that handler with
   * `employeeId = 'me'`, and its `ParseUUIDPipe` answered
   * `400 Validation failed (uuid is expected)`. The handler below was
   * unreachable — no request could arrive at it (BUG-2461).
   *
   * `me/context` was always correctly placed, which is what made the fault
   * hard to see: one `me/` route worked and the other did not.
   */
  @Get('me/direct-reports')
  @Permissions('hierarchy.read')
  @RequirePermission(ENTITY_KEYS.HIERARCHY, 'read')
  getMyDirectReports(@CurrentUser() user: AuthenticatedUser) {
    return this.employeesService.getDirectReportsByUser(user);
  }

  @Get(':employeeId')
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
  ) {
    return this.employeeProfilesService.getProfile(user, employeeId);
  }

  @Get(':employeeId/export')
  @Permissions('employees.export')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  async exportOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.employeesService.exportEmployeeProfile(
      user,
      employeeId,
    );
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    return new StreamableFile(file.buffer);
  }

  @Patch(':employeeId/assign-owner')
  @Permissions('employees.assign')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'assign')
  assignOwner(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Body() dto: AssignOwnerDto,
  ) {
    return this.employeesService.assignOwner(
      user,
      [employeeId],
      dto.ownerUserId,
    );
  }

  @Delete(':employeeId')
  @Permissions('employees.delete')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'delete')
  deleteOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
  ) {
    return this.employeesService.bulkDelete(user, { ids: [employeeId] });
  }

  @Get(':employeeId/hierarchy')
  @Permissions('hierarchy.read')
  @RequirePermission(ENTITY_KEYS.HIERARCHY, 'read')
  getHierarchy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
  ) {
    return this.employeesService.getHierarchy(user.tenantId, employeeId);
  }

  @Get(':employeeId/reporting-structure')
  @Permissions('hierarchy.read')
  @RequirePermission(ENTITY_KEYS.HIERARCHY, 'read')
  getReportingStructure(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
  ) {
    return this.employeesService.getReportingStructure(
      user.tenantId,
      employeeId,
    );
  }

  @Get(':employeeId/direct-reports')
  @Permissions('hierarchy.read')
  @RequirePermission(ENTITY_KEYS.HIERARCHY, 'read')
  getDirectReports(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
  ) {
    return this.employeesService.getDirectReports(user.tenantId, employeeId);
  }

  @Post()
  @Permissions('employees.create')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'create')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEmployeeDto,
  ) {
    return this.employeesService.create(user, dto);
  }

  @Patch(':employeeId')
  @Permissions('employees.update')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employeesService.update(user, employeeId, dto);
  }

  @Post(':employeeId/provision-access')
  @Permissions('employees.update')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'assign')
  provisionAccess(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Body() dto: ProvisionEmployeeAccessDto,
  ) {
    return this.employeesService.provisionAccess(user, employeeId, dto);
  }

  @Post(':employeeId/resend-invite')
  @Permissions('employees.update')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  resendInvite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
  ) {
    return this.employeesService.resendInvitation(user, employeeId);
  }

  @Patch(':employeeId/reporting-manager')
  @Permissions('hierarchy.update')
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.HIERARCHY, action: 'write' },
    { entityKey: ENTITY_KEYS.HIERARCHY, action: 'manage' },
  )
  assignReportingManager(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Body() dto: AssignManagerDto,
  ) {
    return this.employeesService.assignManager(
      user.tenantId,
      employeeId,
      dto,
      user.userId,
    );
  }

  @Patch(':employeeId/manager')
  @Permissions('hierarchy.update')
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.HIERARCHY, action: 'write' },
    { entityKey: ENTITY_KEYS.HIERARCHY, action: 'manage' },
  )
  assignManagerAlias(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Body() dto: AssignManagerDto,
  ) {
    return this.employeesService.assignManager(
      user.tenantId,
      employeeId,
      dto,
      user.userId,
    );
  }

  @Patch(':employeeId/personal-info')
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  updatePersonalInfo(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Body() dto: UpdatePersonalInfoDto,
  ) {
    return this.employeeProfilesService.updatePersonalInfo(
      user,
      employeeId,
      dto,
    );
  }

  @Patch(':employeeId/address')
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  updateAddress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.employeeProfilesService.updateAddress(user, employeeId, dto);
  }

  @Patch(':employeeId/emergency-contact')
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  updateEmergencyContact(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Body() dto: UpdateEmergencyContactDto,
  ) {
    return this.employeeProfilesService.updateEmergencyContact(
      user,
      employeeId,
      dto,
    );
  }

  @Get(':employeeId/history')
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  getHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
  ) {
    return this.employeeProfilesService.listHistory(user, employeeId);
  }

  @Post(':employeeId/history')
  @Permissions('employees.history.create')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  createHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Body() dto: CreateEmployeeHistoryDto,
  ) {
    return this.employeeProfilesService.createHistory(user, employeeId, dto);
  }

  @Get(':employeeId/education')
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  getEducation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
  ) {
    return this.employeeProfilesService.listEducation(user, employeeId);
  }

  @Get(':employeeId/compensation')
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  getCompensation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
  ) {
    return this.employeeProfilesService.getCurrentCompensation(
      user,
      employeeId,
    );
  }

  @Put(':employeeId/compensation')
  @Permissions('payroll.write')
  @RequirePermission(ENTITY_KEYS.PAYROLL, 'write')
  upsertCompensation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Body() dto: UpsertEmployeeCompensationDto,
  ) {
    return this.employeeProfilesService.upsertCompensation(
      user,
      employeeId,
      dto,
    );
  }

  @Get(':employeeId/previous-employments')
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  getPreviousEmployments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
  ) {
    return this.employeeProfilesService.listPreviousEmployments(
      user,
      employeeId,
    );
  }

  @Post(':employeeId/previous-employments')
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  createPreviousEmployment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Body() dto: CreateEmployeePreviousEmploymentDto,
  ) {
    return this.employeeProfilesService.createPreviousEmployment(
      user,
      employeeId,
      dto,
    );
  }

  @Patch(':employeeId/previous-employments/:previousEmploymentId')
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  updatePreviousEmployment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Param('previousEmploymentId', new ParseUUIDPipe())
    previousEmploymentId: string,
    @Body() dto: UpdateEmployeePreviousEmploymentDto,
  ) {
    return this.employeeProfilesService.updatePreviousEmployment(
      user,
      employeeId,
      previousEmploymentId,
      dto,
    );
  }

  @Delete(':employeeId/previous-employments/:previousEmploymentId')
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  deletePreviousEmployment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Param('previousEmploymentId', new ParseUUIDPipe())
    previousEmploymentId: string,
  ) {
    return this.employeeProfilesService.removePreviousEmployment(
      user,
      employeeId,
      previousEmploymentId,
    );
  }

  @Post(':employeeId/education')
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  createEducation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Body() dto: CreateEmployeeEducationDto,
  ) {
    return this.employeeProfilesService.createEducation(user, employeeId, dto);
  }

  @Patch(':employeeId/education/:educationId')
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  updateEducation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Param('educationId', new ParseUUIDPipe()) educationId: string,
    @Body() dto: UpdateEmployeeEducationDto,
  ) {
    return this.employeeProfilesService.updateEducation(
      user,
      employeeId,
      educationId,
      dto,
    );
  }

  @Delete(':employeeId/education/:educationId')
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  deleteEducation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Param('educationId', new ParseUUIDPipe()) educationId: string,
  ) {
    return this.employeeProfilesService.removeEducation(
      user,
      employeeId,
      educationId,
    );
  }

  @Get(':employeeId/documents')
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  getDocuments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
  ) {
    return this.employeeProfilesService.listEmployeeDocuments(user, employeeId);
  }

  @Post(':employeeId/documents/upload')
  @UseInterceptors(FileInterceptor('file'))
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  uploadDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @UploadedFile() file: UploadedFile | undefined,
    @Body() dto: EmployeeDocumentUploadDto,
  ) {
    return this.employeeProfilesService.uploadEmployeeDocument(
      user,
      employeeId,
      file,
      dto,
    );
  }

  @Patch(':employeeId/documents/:documentId')
  @UseInterceptors(FileInterceptor('file'))
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  updateDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @UploadedFile() file: UploadedFile | undefined,
    @Body() dto: EmployeeDocumentUploadDto,
  ) {
    return this.employeeProfilesService.updateEmployeeDocument(
      user,
      employeeId,
      documentId,
      file,
      dto,
    );
  }

  @Get(':employeeId/documents/:documentId/download')
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  async downloadDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { document, file } =
      await this.employeeProfilesService.downloadEmployeeDocument(
        user,
        employeeId,
        documentId,
      );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${document.originalFileName}"`,
    );
    response.setHeader(
      'Content-Type',
      document.mimeType ?? 'application/octet-stream',
    );
    return new StreamableFile(file.stream);
  }

  @Get(':employeeId/documents/:documentId/view')
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  async viewDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { document, file } =
      await this.employeeProfilesService.downloadEmployeeDocument(
        user,
        employeeId,
        documentId,
      );
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${document.originalFileName}"`,
    );
    response.setHeader(
      'Content-Type',
      document.mimeType ?? 'application/octet-stream',
    );
    return new StreamableFile(file.stream);
  }

  @Delete(':employeeId/documents/:documentId')
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  deleteDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
  ) {
    return this.employeeProfilesService.removeEmployeeDocument(
      user,
      employeeId,
      documentId,
    );
  }

  @Post(':employeeId/profile-image/upload')
  @UseInterceptors(FileInterceptor('file'))
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  uploadProfileImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @UploadedFile() file: UploadedFile | undefined,
  ) {
    return this.employeeProfilesService.uploadProfileImage(
      user,
      employeeId,
      file,
    );
  }

  @Get(':employeeId/profile-image')
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  async getProfileImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { document, file } =
      await this.employeeProfilesService.getProfileImage(user, employeeId);
    response.setHeader('Content-Type', document.mimeType ?? 'image/jpeg');
    response.setHeader('Content-Length', String(file.size));
    response.setHeader('Cache-Control', 'private, max-age=300');
    return new StreamableFile(file.stream);
  }

  @Get(':employeeId/leave-history')
  @Permissions('employees.read')
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.EMPLOYEES, action: 'read' },
    { entityKey: ENTITY_KEYS.REPORTS, action: 'read' },
  )
  getLeaveHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
  ) {
    return this.employeeProfilesService.listLeaveHistory(user, employeeId);
  }

  @Get(':employeeId/attendance-history')
  @Permissions('employees.read')
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.EMPLOYEES, action: 'read' },
    { entityKey: ENTITY_KEYS.REPORTS, action: 'read' },
  )
  getAttendanceHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
  ) {
    return this.employeeProfilesService.listAttendanceHistory(user, employeeId);
  }

  @Get(':employeeId/timesheet-history')
  @Permissions('employees.read')
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.EMPLOYEES, action: 'read' },
    { entityKey: ENTITY_KEYS.REPORTS, action: 'read' },
  )
  getTimesheetHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
  ) {
    return this.employeeProfilesService.listTimesheetHistory(user, employeeId);
  }

  @Get(':employeeId/project-allocations')
  @Permissions('projects.read')
  @RequirePermission(ENTITY_KEYS.PROJECTS, 'read')
  getProjectAllocations(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
  ) {
    return this.employeesService.getProjectAllocations(user, employeeId);
  }

  @Post(':employeeId/send-reset-password-link')
  @Permissions('employees.update')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  sendResetPasswordLink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
  ) {
    return this.employeeProfilesService.sendPasswordResetLink(user, employeeId);
  }

  @Post(':employeeId/terminate')
  @Permissions('employees.terminate')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'delete')
  terminate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Body() dto: TerminateEmployeeDto,
  ) {
    return this.employeesService.terminate(
      user.tenantId,
      employeeId,
      dto,
      user.userId,
    );
  }
}
