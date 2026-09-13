import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EmailTemplate, EmailTemplateStatus, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-request.interface';
import {
  TENANT_MODULES,
  type TenantModuleKey,
} from '../../../common/constants/tenant-modules';
import { AuditService } from '../../audit/audit.service';
import { FeatureAccessService } from '../../tenant-settings/feature-access.service';
import type {
  CloneEmailTemplateDto,
  CreateEmailTemplateDto,
  PreviewDraftEmailTemplateDto,
  PreviewEmailTemplateDto,
  TestSendEmailTemplateDto,
  UpdateEmailTemplateDto,
} from '../dto';
import {
  emailTemplateVariablesForEvent,
  isEmailTemplateAuthorable,
  listEmailTemplateAuthoringEvents,
  resolveTemplateVariables,
  sampleVariables,
  systemEmailTemplateCopyForEvent,
  templateTokens,
  variablesAsRecord,
} from '../notification-events.catalog';
import {
  buildNotificationScopeKey,
  buildTenantNotificationScopeKey,
  EMAIL_TEMPLATE_SCOPE_LEVELS,
  EmailTemplateScopeLevel,
  parseNotificationScopeKey,
} from '../notifications.constants';
import { NotificationsRepository } from '../notifications.repository';
import type { EmailTemplateVariableDefinition } from '../system-email-templates.copy';
import { sanitizeEmailTemplateHtml } from './email-safety';
import { EmailTemplateRendererService } from './email-template-renderer.service';
import { EmailService } from './email.service';

/*
 * ITEM-0181. Everything the tenant email template screens do, in one place.
 *
 * These methods used to live on `NotificationsService` beside provider,
 * preference, rule and in-app logic. They moved when the editor stopped taking
 * raw HTML and JSON, because what a template may contain now depends on the
 * event catalog (which variables an event supplies, whether it sends email at
 * all) and on the tenant's plan, and that is a concern of its own.
 *
 * Tenant scoping: every read goes through `visibleTemplateWhere` or
 * `tenantOwnedTemplateWhere` with `user.tenantId`, and every write through
 * `assertTenantTemplate`, which refuses system rows and other tenants' rows.
 */

/*
 * Which plan feature each template module belongs to, for the Module picker.
 * The template module list and the plan feature catalog grew separately and do
 * not share keys (`employee` against `employees`). Claims, loans and benefits
 * are sold as part of payroll. A module with no entry (approvals, sign-in) is
 * part of every plan.
 */
const MODULE_FEATURE_KEYS: Partial<Record<TenantModuleKey, string>> = {
  employee: 'employees',
  leave: 'leave',
  attendance: 'attendance',
  timesheets: 'timesheets',
  payroll: 'payroll',
  claims: 'payroll',
  loans: 'payroll',
  benefits: 'payroll',
  recruitment: 'recruitment',
  onboarding: 'onboarding',
  performance: 'performance',
  documents: 'documents',
};

const SCOPE_LABELS: Record<EmailTemplateScopeLevel, string> = {
  TENANT: 'tenant',
  ORGANIZATION: 'organization',
  BUSINESS_UNIT: 'business unit',
  DEPARTMENT: 'department',
  TEAM: 'team',
};

const SCOPE_LEVEL_LABELS: Record<EmailTemplateScopeLevel, string> = {
  TENANT: 'Whole tenant',
  ORGANIZATION: 'Organization',
  BUSINESS_UNIT: 'Business unit',
  DEPARTMENT: 'Department',
  TEAM: 'Team',
};

type TemplateContentInput = {
  subjectTemplate: string;
  htmlTemplate: string;
  textTemplate?: string | null;
};

@Injectable()
export class EmailTemplateAuthoringService {
  constructor(
    private readonly repository: NotificationsRepository,
    private readonly emailService: EmailService,
    private readonly renderer: EmailTemplateRendererService,
    private readonly featureAccess: FeatureAccessService,
    private readonly auditService: AuditService,
  ) {}

  async listTemplates(currentUser: AuthenticatedUser) {
    const [templates, features] = await Promise.all([
      this.repository.listTemplates(currentUser.tenantId),
      this.enabledFeatureKeys(currentUser.tenantId),
    ]);

    return {
      items: templates
        .filter((template) => this.isVisibleToTenant(template, features))
        .map((template) => mapEmailTemplate(template, features)),
    };
  }

  async getTemplate(currentUser: AuthenticatedUser, templateId: string) {
    const features = await this.enabledFeatureKeys(currentUser.tenantId);
    const template = await this.findTemplateForTenant(
      currentUser.tenantId,
      templateId,
      features,
    );

    return {
      ...mapEmailTemplate(template, features),
      variables: resolveTemplateVariables(
        template.eventCode,
        template.availableVariables,
      ),
    };
  }

  async listAuthoringEvents(currentUser: AuthenticatedUser) {
    const features = await this.enabledFeatureKeys(currentUser.tenantId);
    return { items: listEmailTemplateAuthoringEvents(features) };
  }

  /*
   * Everything the authoring screen needs to offer a placement: the tenant's
   * own organizations, business units, departments and teams, plus the modules
   * the tenant's plan actually includes.
   */
  async listTemplateScopeOptions(currentUser: AuthenticatedUser) {
    const [targets, features] = await Promise.all([
      this.repository.listScopeTargets(currentUser.tenantId),
      this.enabledFeatureKeys(currentUser.tenantId),
    ]);

    return {
      levels: EMAIL_TEMPLATE_SCOPE_LEVELS.map((level) => ({
        value: level,
        label: SCOPE_LEVEL_LABELS[level],
      })),
      ...targets,
      modules: TENANT_MODULES.filter((module) => {
        const featureKey = MODULE_FEATURE_KEYS[module.key];
        return !featureKey || features.has(featureKey);
      }).map((module) => ({ value: module.key, label: module.label })),
    };
  }

  async createTemplate(
    currentUser: AuthenticatedUser,
    dto: CreateEmailTemplateDto,
  ) {
    const features = await this.enabledFeatureKeys(currentUser.tenantId);
    const copy = systemEmailTemplateCopyForEvent(dto.eventCode.trim());
    if (!copy || !isEmailTemplateAuthorable(copy, features)) {
      throw new BadRequestException({
        code: 'EMAIL_TEMPLATE_EVENT_NOT_AUTHORABLE',
        message: 'Email templates cannot be created for this event.',
      });
    }

    const content = prepareContent(dto, copy.variables);
    const scopeKey = await this.resolveTemplateScopeKey(
      currentUser.tenantId,
      dto.scopeLevel,
      dto.scopeId,
    );
    const templateKey = dto.templateKey?.trim() || copy.templateKey;

    if (
      await this.repository.findTemplateByScopeAndKey(scopeKey, templateKey)
    ) {
      throw new ConflictException({
        code: 'EMAIL_TEMPLATE_KEY_TAKEN',
        message:
          'A template for this event already exists where this template applies.',
      });
    }

    const template = await this.repository.createTenantTemplate({
      tenantId: currentUser.tenantId,
      scopeKey,
      moduleKey: dto.moduleKey?.trim() || null,
      eventCode: copy.eventCode,
      templateKey,
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      ...content,
      availableVariables: variablesAsRecord(copy.variables),
      status: dto.status ?? EmailTemplateStatus.DRAFT,
      actorUserId: currentUser.userId,
    });

    await this.audit(currentUser, 'EMAIL_TEMPLATE_CREATED', template, null);
    return mapEmailTemplate(template, features);
  }

  async updateTemplate(
    currentUser: AuthenticatedUser,
    templateId: string,
    dto: UpdateEmailTemplateDto,
  ) {
    const existing = await this.assertTenantTemplate(
      currentUser.tenantId,
      templateId,
    );
    const catalogVariables = emailTemplateVariablesForEvent(existing.eventCode);

    const contentChanged =
      dto.subjectTemplate !== undefined ||
      dto.htmlTemplate !== undefined ||
      dto.textTemplate !== undefined;
    const content = contentChanged
      ? prepareContent(
          {
            subjectTemplate: dto.subjectTemplate ?? existing.subjectTemplate,
            htmlTemplate: dto.htmlTemplate ?? existing.htmlTemplate,
            textTemplate:
              dto.textTemplate !== undefined
                ? dto.textTemplate
                : existing.textTemplate,
          },
          catalogVariables,
        )
      : null;

    /*
     * Re-placing a template moves it to a different scope key. The unique
     * constraint on (scopeKey, templateKey) means the target may already be
     * taken, which is reported plainly rather than surfacing a database error.
     */
    const scopeKey =
      dto.scopeLevel !== undefined || dto.scopeId !== undefined
        ? await this.resolveTemplateScopeKey(
            currentUser.tenantId,
            dto.scopeLevel,
            dto.scopeId,
          )
        : null;

    if (scopeKey && scopeKey !== existing.scopeKey) {
      const clash = await this.repository.findTemplateByScopeAndKey(
        scopeKey,
        existing.templateKey,
      );
      if (clash) {
        throw new ConflictException({
          code: 'EMAIL_TEMPLATE_KEY_TAKEN',
          message:
            'Another template with this key already exists at the selected scope.',
        });
      }
    }

    const activateAfterUpdate = dto.status === EmailTemplateStatus.ACTIVE;
    const data: Prisma.EmailTemplateUpdateManyMutationInput = {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description?.trim() || null }
        : {}),
      ...(content ?? {}),
      /*
       * A catalog event's variables are a fact about its emitters, so they are
       * rewritten from the catalog on every save and whatever the client sent
       * is ignored. Only a legacy template for an event with no copy keeps a
       * caller-supplied list.
       */
      ...(catalogVariables
        ? { availableVariables: variablesAsRecord(catalogVariables) }
        : dto.availableVariables !== undefined
          ? {
              availableVariables:
                dto.availableVariables as Prisma.InputJsonValue,
            }
          : {}),
      ...(dto.moduleKey !== undefined
        ? { moduleKey: dto.moduleKey?.trim() || null }
        : {}),
      ...(scopeKey && scopeKey !== existing.scopeKey ? { scopeKey } : {}),
      ...(dto.status !== undefined && !activateAfterUpdate
        ? { status: dto.status }
        : {}),
    };

    let template = await this.repository.updateTenantTemplate(
      currentUser.tenantId,
      templateId,
      data,
      currentUser.userId,
    );
    if (!template) {
      throw new NotFoundException('Email template was not found.');
    }

    if (activateAfterUpdate) {
      const activated = await this.repository.activateTenantTemplate(
        currentUser.tenantId,
        templateId,
      );
      if (!activated) {
        throw new NotFoundException('Email template was not found.');
      }
      template = activated;
    }

    await this.audit(currentUser, 'EMAIL_TEMPLATE_UPDATED', template, existing);
    return mapEmailTemplate(
      template,
      await this.enabledFeatureKeys(currentUser.tenantId),
    );
  }

  /*
   * ITEM-0181. "Customize" on a system template.
   *
   * The copy keeps the system template's key and sits at the tenant's own
   * scope, because that is what makes it replace the default: emitters resolve
   * by key, and the tenant scope is tried before SYSTEM. It is created DRAFT, so
   * nothing changes for recipients until it is activated. Customizing twice
   * opens the copy that already exists instead of failing on the unique key.
   */
  async cloneTemplate(
    currentUser: AuthenticatedUser,
    templateId: string,
    dto: CloneEmailTemplateDto = {},
  ) {
    const features = await this.enabledFeatureKeys(currentUser.tenantId);
    const source = await this.findTemplateForTenant(
      currentUser.tenantId,
      templateId,
      features,
    );

    if (source.isSystem) {
      const copy = systemEmailTemplateCopyForEvent(source.eventCode);
      if (!copy || !isEmailTemplateAuthorable(copy, features)) {
        throw new BadRequestException({
          code: 'EMAIL_TEMPLATE_NOT_CUSTOMIZABLE',
          message: 'This email template cannot be customized.',
        });
      }

      const scopeKey = buildTenantNotificationScopeKey(currentUser.tenantId);
      const occupant = await this.repository.findTemplateRowByScopeAndKey(
        scopeKey,
        source.templateKey,
      );
      if (occupant) {
        if (occupant.tenantId === currentUser.tenantId && !occupant.isSystem) {
          return mapEmailTemplate(occupant, features);
        }
        throw new ConflictException({
          code: 'EMAIL_TEMPLATE_KEY_TAKEN',
          message:
            'This template cannot be customized until the workspace configuration is updated.',
        });
      }

      const template = await this.repository.createTenantTemplate({
        tenantId: currentUser.tenantId,
        scopeKey,
        eventCode: source.eventCode,
        templateKey: source.templateKey,
        name: dto.name?.trim() || source.name,
        description: source.description,
        subjectTemplate: source.subjectTemplate,
        htmlTemplate: source.htmlTemplate,
        textTemplate: source.textTemplate,
        availableVariables: variablesAsRecord(copy.variables),
        status: EmailTemplateStatus.DRAFT,
        actorUserId: currentUser.userId,
      });

      await this.audit(
        currentUser,
        'EMAIL_TEMPLATE_CUSTOMIZED',
        template,
        null,
        {
          sourceTemplateId: source.id,
        },
      );
      return mapEmailTemplate(template, features);
    }

    const templateKey = dto.templateKey?.trim() || `${source.templateKey}-copy`;
    const scopeKey = buildTenantNotificationScopeKey(currentUser.tenantId);
    if (
      await this.repository.findTemplateByScopeAndKey(scopeKey, templateKey)
    ) {
      throw new ConflictException({
        code: 'EMAIL_TEMPLATE_KEY_TAKEN',
        message: 'A copy of this template already exists.',
      });
    }

    const template = await this.repository.createTenantTemplate({
      tenantId: currentUser.tenantId,
      scopeKey,
      eventCode: source.eventCode,
      templateKey,
      name: dto.name?.trim() || `${source.name} copy`,
      description: source.description,
      subjectTemplate: source.subjectTemplate,
      htmlTemplate: source.htmlTemplate,
      textTemplate: source.textTemplate,
      availableVariables: source.availableVariables as Prisma.InputJsonValue,
      status: EmailTemplateStatus.DRAFT,
      actorUserId: currentUser.userId,
    });

    await this.audit(currentUser, 'EMAIL_TEMPLATE_CLONED', template, null, {
      sourceTemplateId: source.id,
    });
    return mapEmailTemplate(template, features);
  }

  async activateTemplate(currentUser: AuthenticatedUser, templateId: string) {
    const existing = await this.assertTenantTemplate(
      currentUser.tenantId,
      templateId,
    );
    const template = await this.repository.activateTenantTemplate(
      currentUser.tenantId,
      templateId,
    );
    if (!template) {
      throw new NotFoundException('Email template was not found.');
    }

    await this.audit(
      currentUser,
      'EMAIL_TEMPLATE_ACTIVATED',
      template,
      existing,
    );
    return mapEmailTemplate(
      template,
      await this.enabledFeatureKeys(currentUser.tenantId),
    );
  }

  async archiveTemplate(currentUser: AuthenticatedUser, templateId: string) {
    const existing = await this.assertTenantTemplate(
      currentUser.tenantId,
      templateId,
    );
    await this.repository.archiveTenantTemplate(
      currentUser.tenantId,
      templateId,
    );

    await this.audit(
      currentUser,
      'EMAIL_TEMPLATE_ARCHIVED',
      { ...existing, status: EmailTemplateStatus.ARCHIVED },
      existing,
    );
    return { archived: true };
  }

  /*
   * ITEM-0181. Renders the saved template, or the unsaved content on screen,
   * with the catalog's sample values. Overrides go through the same sanitiser
   * a save does, so the preview shows what would be stored; they are never
   * written.
   */
  async previewTemplate(
    currentUser: AuthenticatedUser,
    templateId: string,
    dto: PreviewEmailTemplateDto,
  ) {
    const features = await this.enabledFeatureKeys(currentUser.tenantId);
    const template = await this.findTemplateForTenant(
      currentUser.tenantId,
      templateId,
      features,
    );

    return this.render(
      {
        subjectTemplate: dto.subjectTemplate ?? template.subjectTemplate,
        htmlTemplate:
          dto.htmlTemplate !== undefined
            ? sanitizeEmailTemplateHtml(dto.htmlTemplate)
            : template.htmlTemplate,
        textTemplate:
          dto.textTemplate !== undefined
            ? dto.textTemplate
            : template.textTemplate,
      },
      resolveTemplateVariables(template.eventCode, template.availableVariables),
      dto.variables,
    );
  }

  async previewDraftTemplate(
    currentUser: AuthenticatedUser,
    dto: PreviewDraftEmailTemplateDto,
  ) {
    const features = await this.enabledFeatureKeys(currentUser.tenantId);
    const copy = systemEmailTemplateCopyForEvent(dto.eventCode.trim());
    if (!copy || !isEmailTemplateAuthorable(copy, features)) {
      throw new BadRequestException({
        code: 'EMAIL_TEMPLATE_EVENT_NOT_AUTHORABLE',
        message: 'Email templates cannot be created for this event.',
      });
    }

    return this.render(
      {
        subjectTemplate: dto.subjectTemplate,
        htmlTemplate: sanitizeEmailTemplateHtml(dto.htmlTemplate),
        textTemplate: dto.textTemplate,
      },
      copy.variables,
      dto.variables,
    );
  }

  async testSendTemplate(
    currentUser: AuthenticatedUser,
    templateId: string,
    dto: TestSendEmailTemplateDto,
  ) {
    const features = await this.enabledFeatureKeys(currentUser.tenantId);
    const template = await this.findTemplateForTenant(
      currentUser.tenantId,
      templateId,
      features,
    );
    const variables = resolveTemplateVariables(
      template.eventCode,
      template.availableVariables,
    );

    return this.emailService.sendTemplateEmail({
      tenantId: currentUser.tenantId,
      eventCode: template.eventCode,
      templateId,
      recipient: dto.recipient.trim().toLowerCase(),
      cc: dto.cc?.trim() || null,
      bcc: dto.bcc?.trim() || null,
      variables: { ...sampleVariables(variables), ...(dto.variables ?? {}) },
      metadata: { ...(dto.metadata ?? {}), source: 'email-template-test-send' },
      requestedByUserId: currentUser.userId,
      dryRun: dto.dryRun ?? false,
    });
  }

  private render(
    content: TemplateContentInput,
    variables: readonly EmailTemplateVariableDefinition[],
    overrides: Record<string, unknown> | undefined,
  ) {
    /*
     * Variable values are HTML-escaped by the renderer, so a sample or an
     * override can never inject markup into the preview.
     */
    return this.renderer.render({
      template: {
        subjectTemplate: content.subjectTemplate,
        htmlTemplate: content.htmlTemplate,
        textTemplate: content.textTemplate ?? null,
        availableVariables: variablesAsRecord(variables),
      },
      variables: { ...sampleVariables(variables), ...(overrides ?? {}) },
    });
  }

  private async enabledFeatureKeys(tenantId: string) {
    const { enabledKeys } =
      await this.featureAccess.getResolvedTenantFeatures(tenantId);
    return new Set<string>(enabledKeys as readonly string[]);
  }

  /*
   * System templates a tenant can do nothing with — DijiPeople's own mail to
   * the tenant, events nothing sends, features outside the plan — are not
   * shown, read, previewed or cloned. Tenant-owned templates always are.
   */
  private isVisibleToTenant(
    template: EmailTemplate,
    features: ReadonlySet<string>,
  ) {
    if (!template.isSystem) return true;
    const copy = systemEmailTemplateCopyForEvent(template.eventCode);
    return Boolean(copy && isEmailTemplateAuthorable(copy, features));
  }

  private async findTemplateForTenant(
    tenantId: string,
    templateId: string,
    features: ReadonlySet<string>,
  ) {
    const template = await this.repository.findVisibleTemplateById(
      tenantId,
      templateId,
    );
    if (!template || !this.isVisibleToTenant(template, features)) {
      throw new NotFoundException('Email template was not found.');
    }
    return template;
  }

  private async assertTenantTemplate(tenantId: string, templateId: string) {
    const template = await this.repository.findVisibleTemplateById(
      tenantId,
      templateId,
    );
    if (!template) {
      throw new NotFoundException('Email template was not found.');
    }
    if (template.isSystem || !template.tenantId) {
      throw new ForbiddenException(
        'System email templates cannot be modified. Customize the template first.',
      );
    }
    if (template.tenantId !== tenantId) {
      throw new NotFoundException('Email template was not found.');
    }
    return template;
  }

  /*
   * Turns an authored placement into a scope key. Every level below tenant is
   * checked against the tenant first: without that, a user could point a
   * template at another tenant's business unit and have it resolve for them.
   */
  private async resolveTemplateScopeKey(
    tenantId: string,
    level: EmailTemplateScopeLevel | undefined,
    scopeId: string | null | undefined,
  ) {
    if (!level || level === 'TENANT') {
      return buildTenantNotificationScopeKey(tenantId);
    }

    if (!scopeId) {
      throw new BadRequestException(
        `A ${SCOPE_LABELS[level]} must be selected for this scope.`,
      );
    }

    const exists = await this.repository.scopeTargetExists({
      tenantId,
      level,
      scopeId,
    });
    if (!exists) {
      throw new BadRequestException(
        `The selected ${SCOPE_LABELS[level]} was not found in this tenant.`,
      );
    }

    return buildNotificationScopeKey(level, scopeId);
  }

  private audit(
    currentUser: AuthenticatedUser,
    action: string,
    after: EmailTemplate,
    before: EmailTemplate | null,
    extra: Record<string, unknown> = {},
  ) {
    return this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action,
      entityType: 'EmailTemplate',
      entityId: after.id,
      sourceModule: 'notifications',
      beforeSnapshot: before ? auditSnapshot(before) : null,
      afterSnapshot: { ...auditSnapshot(after), ...extra },
    });
  }
}

/*
 * The subject, sanitised body and text a template may store. Tokens the event
 * does not supply are refused, because the renderer would silently render them
 * blank. `variables` is null for a legacy template whose event has no catalog
 * copy; its tokens are not checked.
 */
function prepareContent(
  input: TemplateContentInput,
  variables: readonly EmailTemplateVariableDefinition[] | null,
) {
  const subjectTemplate = input.subjectTemplate.trim();
  if (!subjectTemplate) {
    throw new BadRequestException('Email subject cannot be empty.');
  }
  const htmlTemplate = sanitizeEmailTemplateHtml(input.htmlTemplate);
  const textTemplate = input.textTemplate?.trim() || null;

  if (variables) {
    const supplied = new Set(variables.map((definition) => definition.key));
    const unknownVariables = templateTokens(
      subjectTemplate,
      htmlTemplate,
      textTemplate,
    ).filter((token) => !supplied.has(token));

    if (unknownVariables.length > 0) {
      throw new BadRequestException({
        code: 'EMAIL_TEMPLATE_VARIABLES_UNKNOWN',
        message: `This event does not supply: ${unknownVariables.join(', ')}.`,
        unknownVariables,
      });
    }
  }

  return { subjectTemplate, htmlTemplate, textTemplate };
}

function auditSnapshot(template: EmailTemplate) {
  return {
    eventCode: template.eventCode,
    templateKey: template.templateKey,
    name: template.name,
    subjectTemplate: template.subjectTemplate,
    status: template.status,
    scopeKey: template.scopeKey,
    moduleKey: template.moduleKey,
    version: template.version,
  };
}

export function mapEmailTemplate(
  template: EmailTemplate,
  features: ReadonlySet<string>,
) {
  const copy = template.isSystem
    ? systemEmailTemplateCopyForEvent(template.eventCode)
    : null;
  const scope = parseNotificationScopeKey(template.scopeKey);

  return {
    id: template.id,
    tenantId: template.tenantId,
    eventCode: template.eventCode,
    templateKey: template.templateKey,
    name: template.name,
    description: template.description,
    subjectTemplate: template.subjectTemplate,
    htmlTemplate: template.htmlTemplate,
    textTemplate: template.textTemplate,
    availableVariables: template.availableVariables,
    moduleKey: template.moduleKey,
    scopeKey: template.scopeKey,
    scopeLevel: scope.level,
    scopeId: scope.id,
    status: template.status,
    version: template.version,
    isSystem: template.isSystem,
    customizable: Boolean(copy && isEmailTemplateAuthorable(copy, features)),
    createdBy: template.createdBy,
    updatedBy: template.updatedBy,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}
