import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PublicRateLimitGuard } from '../../common/guards/public-rate-limit.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { ContractsService, type ContractUploadFile } from './contracts.service';
import {
  ApprovalDecisionDto,
  CompleteSignatureDto,
  CopyContractDto,
  ContractQueryDto,
  ContractStageTransitionDto,
  ContractPartyDto,
  ContractFieldPlacementDto,
  ContractReasonDto,
  CreateDerivedContractDto,
  CreateContractDto,
  CreateContractFromSourceDto,
  CreateUploadedContractDto,
  CreateContractTemplateDto,
  CreateContractTemplateVersionDto,
  DeclineSignatureDto,
  RequestSignatureChangesDto,
  SaveContractVersionDto,
  SendSignatureRequestDto,
  UpdateContractDto,
  UpdateContractPartyDto,
  UpdateContractTemplateStateDto,
} from './dto/contracts.dto';

@Controller('contracts')
@UseGuards(JwtAuthGuard)
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ContractQueryDto,
  ) {
    return this.contracts.list(user, query);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateContractDto,
  ) {
    return this.contracts.create(user, dto);
  }

  @Post('from-source')
  fromSource(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateContractFromSourceDto,
  ) {
    return this.contracts.createFromSource(user, dto);
  }

  @Post('copy')
  copy(@CurrentUser() user: AuthenticatedUser, @Body() dto: CopyContractDto) {
    return this.contracts.copy(user, dto);
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: ContractUploadFile,
    @Body() dto: CreateUploadedContractDto,
  ) {
    return this.contracts.createFromUpload(user, dto, file);
  }

  @Post('import-document')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  importDocument(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: ContractUploadFile,
  ) {
    return this.contracts.importDocument(user, file);
  }

  @Get('placeholder-definitions')
  placeholderDefinitions(@CurrentUser() user: AuthenticatedUser) {
    return this.contracts.listPlaceholderDefinitions(user);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.contracts.get(user, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateContractDto,
  ) {
    return this.contracts.update(user, id, dto);
  }

  @Post(':id/versions')
  saveVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SaveContractVersionDto,
  ) {
    return this.contracts.saveVersion(user, id, dto);
  }

  @Get(':id/versions/compare')
  compareVersions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.contracts.compareVersions(user, id, Number(from), Number(to));
  }

  @Post(':id/submit-approval')
  submitApproval(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.contracts.submitApproval(user, id);
  }

  @Post(':id/transition')
  transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ContractStageTransitionDto,
  ) {
    return this.contracts.transitionStage(user, id, dto.direction, dto.reason);
  }

  @Post(':id/signature-requests')
  sendForSignature(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SendSignatureRequestDto,
  ) {
    return this.contracts.sendForSignature(user, id, dto);
  }

  @Post(':id/parties')
  addParty(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ContractPartyDto,
  ) {
    return this.contracts.addParty(user, id, dto);
  }

  @Patch(':id/parties/:partyId')
  updateParty(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('partyId') partyId: string,
    @Body() dto: UpdateContractPartyDto,
  ) {
    return this.contracts.updateParty(user, id, partyId, dto);
  }

  @Delete(':id/parties/:partyId')
  removeParty(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('partyId') partyId: string,
  ) {
    return this.contracts.removeParty(user, id, partyId);
  }

  @Post(':id/field-placements')
  addFieldPlacement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ContractFieldPlacementDto,
  ) {
    return this.contracts.addFieldPlacement(user, id, dto);
  }

  @Post(':id/void')
  voidContract(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ContractReasonDto,
  ) {
    return this.contracts.voidContract(user, id, dto.reason);
  }

  @Post(':id/terminate')
  terminate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ContractReasonDto,
  ) {
    return this.contracts.terminateContract(user, id, dto.reason);
  }

  @Post(':id/amend')
  amend(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateDerivedContractDto,
  ) {
    return this.contracts.createDerivedContract(user, id, 'AMENDMENT', dto);
  }

  @Post(':id/renew')
  renew(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateDerivedContractDto,
  ) {
    return this.contracts.createDerivedContract(user, id, 'RENEWAL', dto);
  }

  @Post(':id/generate/:format')
  async generate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('format') format: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (format !== 'pdf' && format !== 'docx')
      throw new Error('Unsupported document format.');
    const generated = await this.contracts.generateDocument(user, id, format);
    response.setHeader('Content-Type', generated.document.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${generated.document.fileName}"`,
    );
    return new StreamableFile(generated.buffer);
  }

  @Get('documents/:documentId/download')
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId') documentId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { document, file } = await this.contracts.openDocument(
      user,
      documentId,
    );
    response.setHeader('Content-Type', document.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${document.fileName}"`,
    );
    response.setHeader('Content-Length', String(file.size));
    return new StreamableFile(file.stream);
  }
}

@Controller('contract-templates')
@UseGuards(JwtAuthGuard)
export class ContractTemplatesController {
  constructor(private readonly contracts: ContractsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.contracts.listTemplates(user);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateContractTemplateDto,
  ) {
    return this.contracts.createTemplate(user, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.contracts.getTemplate(user, id);
  }

  @Post(':id/versions')
  version(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateContractTemplateVersionDto,
  ) {
    return this.contracts.createTemplateVersion(user, id, dto);
  }

  @Post(':id/clone')
  clone(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.contracts.cloneTemplate(user, id);
  }

  @Patch(':id/state')
  state(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateContractTemplateStateDto,
  ) {
    return this.contracts.updateTemplateState(user, id, dto.state);
  }
}

@Controller('signature-requests')
@UseGuards(JwtAuthGuard)
export class SignatureRequestsController {
  constructor(private readonly contracts: ContractsService) {}

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.contracts.getSignatureRequest(user, id);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.contracts.cancelSignatureRequest(user, id);
  }

  @Post(':id/resend')
  resend(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.contracts.resendSignatureRequest(user, id);
  }

  @Post(':id/remind')
  remind(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.contracts.resendSignatureRequest(user, id);
  }
}

@Controller('platform-approvals')
@UseGuards(JwtAuthGuard)
export class PlatformApprovalsController {
  constructor(private readonly contracts: ContractsService) {}

  @Post(':requestId/:decision')
  decide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
    @Param('decision') decision: string,
    @Body() dto: ApprovalDecisionDto,
  ) {
    if (!['approve', 'reject', 'return'].includes(decision))
      throw new Error('Unsupported approval decision.');
    return this.contracts.decideApproval(
      user,
      requestId,
      decision as 'approve' | 'reject' | 'return',
      dto,
    );
  }
}

@Controller('public/signatures')
@UseGuards(PublicRateLimitGuard)
export class PublicSignaturesController {
  constructor(private readonly contracts: ContractsService) {}

  @Get(':token')
  session(@Param('token') token: string) {
    return this.contracts.getSigningSession(token);
  }

  @Post(':token/sign')
  sign(
    @Param('token') token: string,
    @Body() dto: CompleteSignatureDto,
    @Req() request: Request,
  ) {
    return this.contracts.completeSignature(token, dto, {
      ipAddress: request.ip,
      userAgent: request.get('user-agent'),
      sessionId: request.get('x-request-id'),
    });
  }

  @Post(':token/decline')
  decline(
    @Param('token') token: string,
    @Body() dto: DeclineSignatureDto,
    @Req() request: Request,
  ) {
    return this.contracts.declineSignature(token, dto, {
      ipAddress: request.ip,
      userAgent: request.get('user-agent'),
    });
  }

  @Post(':token/request-changes')
  requestChanges(
    @Param('token') token: string,
    @Body() dto: RequestSignatureChangesDto,
    @Req() request: Request,
  ) {
    return this.contracts.requestSignatureChanges(token, dto, {
      ipAddress: request.ip,
      userAgent: request.get('user-agent'),
    });
  }
}
