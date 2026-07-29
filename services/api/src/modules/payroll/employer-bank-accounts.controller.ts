import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  CreateEmployerBankAccountDto,
  UpdateEmployerBankAccountDto,
} from './dto/employer-bank-account.dto';
import { EmployerBankAccountsService } from './employer-bank-accounts.service';

@Controller('payroll/employer-bank-accounts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EmployerBankAccountsController {
  constructor(private readonly service: EmployerBankAccountsService) {}

  @Get()
  @Permissions('payroll.settings.read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
  ) {
    return this.service.list(user, {
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      search,
    });
  }

  @Post()
  @Permissions('payroll.settings.update')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEmployerBankAccountDto,
  ) {
    return this.service.create(user, dto);
  }

  @Get(':id')
  @Permissions('payroll.settings.read')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.detail(user, id);
  }

  @Patch(':id')
  @Permissions('payroll.settings.update')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateEmployerBankAccountDto,
  ) {
    return this.service.update(user, id, dto);
  }

  @Post(':id/deactivate')
  @Permissions('payroll.settings.update')
  deactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.deactivate(user, id);
  }

  @Post(':id/set-default-payroll')
  @Permissions('payroll.settings.update')
  setDefaultPayroll(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.setDefaultPayrollAccount(user, id);
  }

  @Get('actions/export')
  @Permissions('payroll.settings.read')
  async exportCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const exported = await this.service.exportCsv(user);
    response.setHeader('Content-Type', exported.contentType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${exported.fileName}"`,
    );
    response.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(exported.buffer);
  }

  @Get('actions/export-template')
  @Permissions('payroll.settings.read')
  exportTemplate(@Res({ passthrough: true }) response: Response) {
    const exported = this.service.exportTemplate();
    response.setHeader('Content-Type', exported.contentType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${exported.fileName}"`,
    );
    response.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(exported.buffer);
  }

  @Post('actions/import')
  @Permissions('payroll.settings.update')
  importRows(
    @CurrentUser() user: AuthenticatedUser,
    @Body() rows: Array<CreateEmployerBankAccountDto & { bankCode?: string }>,
  ) {
    return this.service.importRows(user, rows);
  }
}
