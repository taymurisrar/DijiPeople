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
} from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { AssignManagerDto } from './dto/assign-manager.dto';
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

  @Get()
  @Permissions('employees.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: EmployeeQueryDto,
  ) {
    return this.employeesService.findByTenant(user, query);
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

  @Get(':employeeId')
  @Permissions('employees.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
  ) {
    return this.employeeProfilesService.getProfile(user, employeeId);
  }

  @Get(':employeeId/hierarchy')
  @Permissions('hierarchy.read')
  getHierarchy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
  ) {
    return this.employeesService.getHierarchy(user.tenantId, employeeId);
  }

  @Get(':employeeId/direct-reports')
  @Permissions('hierarchy.read')
  getDirectReports(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
  ) {
    return this.employeesService.getDirectReports(user.tenantId, employeeId);
  }

  @Get('me/direct-reports')
  @Permissions('hierarchy.read')
  getMyDirectReports(@CurrentUser() user: AuthenticatedUser) {
    return this.employeesService.getDirectReportsByUser(user);
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
  @Permissions('employees.update')
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
  @Permissions('employees.update')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  updateAddress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.employeeProfilesService.updateAddress(user, employeeId, dto);
  }

  @Patch(':employeeId/emergency-contact')
  @Permissions('employees.update')
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
  @Permissions('employees.history.read')
  getHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
  ) {
    return this.employeeProfilesService.listHistory(user, employeeId);
  }

  @Post(':employeeId/history')
  @Permissions('employees.history.create')
  createHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Body() dto: CreateEmployeeHistoryDto,
  ) {
    return this.employeeProfilesService.createHistory(user, employeeId, dto);
  }

  @Get(':employeeId/education')
  @Permissions('employees.education.read')
  getEducation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
  ) {
    return this.employeeProfilesService.listEducation(user, employeeId);
  }

  @Get(':employeeId/compensation')
  @Permissions('payroll.read')
  @RequirePermission(ENTITY_KEYS.PAYROLL, 'read')
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
  @Permissions('employees.read')
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
  @Permissions('employees.update')
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
  @Permissions('employees.update')
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
  @Permissions('employees.update')
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
  @Permissions('employees.education.create')
  createEducation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Body() dto: CreateEmployeeEducationDto,
  ) {
    return this.employeeProfilesService.createEducation(user, employeeId, dto);
  }

  @Patch(':employeeId/education/:educationId')
  @Permissions('employees.education.update')
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
  @Permissions('employees.education.delete')
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
  @Permissions('employees.documents.read')
  getDocuments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
  ) {
    return this.employeeProfilesService.listEmployeeDocuments(user, employeeId);
  }

  @Post(':employeeId/documents/upload')
  @Permissions('employees.documents.upload')
  @UseInterceptors(FileInterceptor('file'))
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

  @Get(':employeeId/documents/:documentId/download')
  @Permissions('employees.documents.read')
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
  @Permissions('employees.documents.read')
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
  @Permissions('employees.documents.delete')
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
  @Permissions('employees.documents.upload')
  @UseInterceptors(FileInterceptor('file'))
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
  @Permissions('employees.documents.read')
  async getProfileImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { document, file } =
      await this.employeeProfilesService.getProfileImage(user, employeeId);
    response.setHeader('Content-Type', document.mimeType ?? 'image/jpeg');
    return new StreamableFile(file.stream);
  }

  @Get(':employeeId/leave-history')
  @Permissions('employees.read')
  getLeaveHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
  ) {
    return this.employeeProfilesService.listLeaveHistory(user, employeeId);
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
