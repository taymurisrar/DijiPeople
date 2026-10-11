import {
  Body,
  Controller,
  Delete,
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
import { uploadLimits } from '../../common/storage/upload-limits';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  AddSupportCaseActivityDto,
  AssignSupportCaseDto,
  CreateSupportCaseDto,
  CreateSupportCaseRelationDto,
  EscalateSupportCaseDto,
  LinkSupportIncidentDto,
  MergeSupportCaseDto,
  ReopenSupportCaseDto,
  RequestSupportCaseInfoDto,
  ResolveSupportCaseDto,
  SendCustomerUpdateDto,
  SupportCaseQueryDto,
  TransitionSupportCaseDto,
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
  /*
   * Lifecycle commands (WS11). Authorization stays where this controller has
   * always kept it — in the service (support.read / support.manage) — so every
   * route, old and new, is checked by the same code.
   */
  @Post(':id/transition') transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: TransitionSupportCaseDto,
  ) {
    return this.service.transition(user, id, dto);
  }
  @Post(':id/escalate') escalate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: EscalateSupportCaseDto,
  ) {
    return this.service.escalate(user, id, dto);
  }
  @Post(':id/request-info') requestInfo(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RequestSupportCaseInfoDto,
  ) {
    return this.service.requestInfo(user, id, dto);
  }
  @Post(':id/resolve') resolve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ResolveSupportCaseDto,
  ) {
    return this.service.resolve(user, id, dto);
  }
  @Post(':id/reopen') reopen(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReopenSupportCaseDto,
  ) {
    return this.service.reopen(user, id, dto);
  }
  @Post(':id/assign') assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignSupportCaseDto,
  ) {
    return this.service.assign(user, id, dto);
  }
  @Get(':id/relations') relations(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.service.listRelations(user, id);
  }
  @Post(':id/relations') createRelation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateSupportCaseRelationDto,
  ) {
    return this.service.createRelation(user, id, dto);
  }
  @Delete(':id/relations/:relationId') deleteRelation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('relationId') relationId: string,
  ) {
    return this.service.deleteRelation(user, id, relationId);
  }
  @Delete(':id/incidents/:linkId') unlinkIncident(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('linkId') linkId: string,
  ) {
    return this.service.unlinkIncident(user, id, linkId);
  }
  @Post(':id/merge') merge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: MergeSupportCaseDto,
  ) {
    return this.service.merge(user, id, dto);
  }
  @Post(':id/attachments')
  @UseInterceptors(FileInterceptor('file', uploadLimits('document')))
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
