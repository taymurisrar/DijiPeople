import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  AddSupportCaseActivityDto,
  CreateSupportCaseDto,
  LinkSupportIncidentDto,
  MergeSupportCaseDto,
  SendCustomerUpdateDto,
  SupportCaseQueryDto,
  UpdateSupportCaseDto,
} from './dto/support-cases.dto';
import { SupportCasesService } from './support-cases.service';

@Controller('support-cases')
@UseGuards(JwtAuthGuard)
export class SupportCasesController {
  constructor(private readonly service: SupportCasesService) {}
  @Get() list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SupportCaseQueryDto,
  ) {
    return this.service.list(user, query);
  }
  @Get('metrics') metrics(@CurrentUser() user: AuthenticatedUser) {
    return this.service.metrics(user);
  }
  @Post() create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSupportCaseDto,
  ) {
    return this.service.create(user, dto);
  }
  @Post('from-incident/:errorLogId') fromIncident(
    @CurrentUser() user: AuthenticatedUser,
    @Param('errorLogId') errorLogId: string,
  ) {
    return this.service.createFromIncident(user, errorLogId);
  }
  @Get(':id') get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.service.get(user, id);
  }
  @Patch(':id') update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateSupportCaseDto,
  ) {
    return this.service.update(user, id, dto);
  }
  @Post(':id/timeline') activity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddSupportCaseActivityDto,
  ) {
    return this.service.addActivity(user, id, dto);
  }
  @Post(':id/customer-updates') customerUpdate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SendCustomerUpdateDto,
  ) {
    return this.service.sendCustomerUpdate(user, id, dto);
  }
  @Post(':id/incidents') linkIncident(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: LinkSupportIncidentDto,
  ) {
    return this.service.linkIncident(user, id, dto);
  }
  @Post(':id/merge') merge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: MergeSupportCaseDto,
  ) {
    return this.service.merge(user, id, dto);
  }
  @Post(':id/attachments')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  uploadAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile()
    file: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      size: number;
    },
    @Body('customerSafe') customerSafe?: string,
  ) {
    return this.service.uploadAttachment(
      user,
      id,
      file,
      customerSafe === 'true',
    );
  }
  @Get('attachments/:attachmentId/download')
  async downloadAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('attachmentId') attachmentId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { attachment, file } = await this.service.openAttachment(
      user,
      attachmentId,
    );
    response.setHeader('Content-Type', attachment.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${attachment.fileName}"`,
    );
    return new StreamableFile(file.stream);
  }
}
