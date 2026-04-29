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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { CandidateQueryDto } from './dto/candidate-query.dto';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { RegisterCandidateDocumentDto } from './dto/register-candidate-document.dto';
import { TriggerDocumentParseDto } from './dto/trigger-document-parse.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { RecruitmentService } from './recruitment.service';

type UploadedResumeFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

@Controller('candidates')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CandidatesController {
  constructor(private readonly recruitmentService: RecruitmentService) {}

  @Get()
  @Permissions('recruitment.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CandidateQueryDto,
  ) {
    return this.recruitmentService.findCandidates(user.tenantId, query);
  }

  @Get(':candidateId')
  @Permissions('recruitment.read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('candidateId', new ParseUUIDPipe()) candidateId: string,
  ) {
    return this.recruitmentService.findCandidateById(
      user.tenantId,
      candidateId,
    );
  }

  @Post()
  @Permissions('recruitment.create')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCandidateDto,
  ) {
    return this.recruitmentService.createCandidate(user, dto);
  }

  @Post('parse-upload')
  @Permissions('recruitment.create')
  @UseInterceptors(FileInterceptor('file'))
  parseUploadedResumeDraft(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: UploadedResumeFile | undefined,
  ) {
    return this.recruitmentService.parseUploadedResumeDraft(user, file);
  }

  @Patch(':candidateId')
  @Permissions('recruitment.update')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('candidateId', new ParseUUIDPipe()) candidateId: string,
    @Body() dto: UpdateCandidateDto,
  ) {
    return this.recruitmentService.updateCandidate(user, candidateId, dto);
  }

  @Post(':candidateId/documents')
  @Permissions('recruitment.update')
  registerDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('candidateId', new ParseUUIDPipe()) candidateId: string,
    @Body() dto: RegisterCandidateDocumentDto,
  ) {
    return this.recruitmentService.registerCandidateDocument(
      user,
      candidateId,
      dto,
    );
  }

  @Post(':candidateId/documents/:documentId/parse')
  @Permissions('recruitment.update')
  triggerDocumentParsing(
    @CurrentUser() user: AuthenticatedUser,
    @Param('candidateId', new ParseUUIDPipe()) candidateId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Body() dto: TriggerDocumentParseDto,
  ) {
    return this.recruitmentService.triggerCandidateDocumentParsing(
      user,
      candidateId,
      documentId,
      dto,
    );
  }

  @Get(':candidateId/documents/:documentId/view')
  @Permissions('recruitment.read')
  async viewCandidateDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('candidateId', new ParseUUIDPipe()) candidateId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { document, file, redirectUrl } =
      await this.recruitmentService.openCandidateDocumentForView(
        user.tenantId,
        candidateId,
        documentId,
      );

    if (redirectUrl) {
      response.redirect(redirectUrl);
      return;
    }

    response.setHeader(
      'Content-Type',
      document.contentType ?? 'application/octet-stream',
    );
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${document.fileName}"`,
    );
    if (!file) {
      return;
    }
    return new StreamableFile(file.stream);
  }

  @Get(':candidateId/documents/:documentId/download')
  @Permissions('recruitment.read')
  async downloadCandidateDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('candidateId', new ParseUUIDPipe()) candidateId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { document, file, redirectUrl } =
      await this.recruitmentService.openCandidateDocumentForDownload(
        user.tenantId,
        candidateId,
        documentId,
      );

    if (redirectUrl) {
      response.redirect(redirectUrl);
      return;
    }

    response.setHeader(
      'Content-Type',
      document.contentType ?? 'application/octet-stream',
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${document.fileName}"`,
    );
    if (!file) {
      return;
    }
    return new StreamableFile(file.stream);
  }
}
