import {
  SINK_EMAIL_PROVIDER_TYPES,
  SUPPORTED_EMAIL_PROVIDER_TYPES,
} from "@repo/config";
import type {
  EffectiveEmailProvider,
  EmailDeliveryPath,
  EmailNotDeliveredReason,
  EmailProviderSetting,
  EmailProviderType,
  ProviderSchema,
} from "@/lib/notifications-api";

/*
 * BUG-3501 — what the Email Providers screen may say about delivery.
 *
 * The banner used to branch on `canSend` alone, which is true for a CONSOLE
 * provider, so the demo tenant read "Email is sent by this workspace's own
 * provider … over CONSOLE" while every message went to a server log. The
 * wording is decided here, away from React, so a test can prove a sink is
 * never described as delivering.
 */

export function isSinkProviderType(providerType: string | null | undefined) {
  return Boolean(
    providerType && SINK_EMAIL_PROVIDER_TYPES.includes(providerType),
  );
}

export function resolveEmailDeliveryPath(effective: EffectiveEmailProvider): {
  readonly path: EmailDeliveryPath;
  readonly reason: EmailNotDeliveredReason | null;
} {
  if (effective.deliveryPath) {
    return {
      path: effective.deliveryPath,
      reason:
        effective.deliveryPath === "NOT_DELIVERED"
          ? (effective.notDeliveredReason ?? "NO_PROVIDER")
          : null,
    };
  }

  /*
   * An API from before BUG-3501 sends no `deliveryPath`. Derive the same
   * answer from what it does send rather than falling back to "can send".
   */
  if (!effective.canSend) return { path: "NOT_DELIVERED", reason: "NO_PROVIDER" };
  if (isSinkProviderType(effective.providerType)) {
    return { path: "NOT_DELIVERED", reason: "SINK_PROVIDER" };
  }
  return {
    path: effective.inherited ? "PLATFORM_RELAY" : "TENANT_PROVIDER",
    reason: null,
  };
}

export type EmailDeliverySummary = {
  readonly tone: "ok" | "warning";
  readonly title: string;
  readonly detail: string | null;
};

export function describeEmailDelivery(
  effective: EffectiveEmailProvider,
  schemas: readonly ProviderSchema[] = [],
): EmailDeliverySummary {
  const { path, reason } = resolveEmailDeliveryPath(effective);

  if (path === "NOT_DELIVERED") {
    return {
      tone: "warning",
      title: "Email is not delivered",
      detail:
        reason === "SINK_PROVIDER"
          ? `The ${providerTypeLabel(effective.providerType, schemas)} provider does not send email.`
          : "No email provider is available.",
    };
  }

  return {
    tone: "ok",
    title:
      path === "TENANT_PROVIDER"
        ? "Email is delivered by this workspace's provider"
        : "Email is delivered by the DijiPeople platform relay",
    detail: senderLine(effective),
  };
}

function senderLine(effective: EffectiveEmailProvider) {
  if (!effective.fromEmail) return null;
  const sender = effective.fromName
    ? `${effective.fromName} <${effective.fromEmail}>`
    : effective.fromEmail;
  return effective.replyToEmail
    ? `Sent as ${sender}, replies to ${effective.replyToEmail}`
    : `Sent as ${sender}`;
}

export function providerTypeLabel(
  providerType: string | null | undefined,
  schemas: readonly ProviderSchema[],
) {
  return (
    schemas.find((schema) => schema.providerType === providerType)?.label ??
    String(providerType ?? "")
  );
}

/*
 * The API publishes which types may be chosen, because only it knows whether
 * this is production (ADR-0015). An API that predates that list gets no sink
 * offered at all: guessing the environment in the browser is how production
 * came to offer CONSOLE in the first place.
 */
export function selectableProviderTypes(
  fromServer: readonly string[] | undefined,
): EmailProviderType[] {
  const types =
    fromServer ??
    SUPPORTED_EMAIL_PROVIDER_TYPES.filter((type) => !isSinkProviderType(type));
  return [...types] as EmailProviderType[];
}

export type ProviderTypeOption = {
  readonly value: EmailProviderType;
  readonly label: string;
  readonly disabled: boolean;
};

/*
 * A stored row may use a type that can no longer be chosen — SES from before
 * BUG-0050, or a Console row in production. Dropping it from the list would
 * make the select show its first option, so saving the row would silently
 * rewrite its type. It stays visible and disabled instead.
 */
export function providerTypeOptions(
  selectable: readonly EmailProviderType[],
  stored: EmailProviderType | null,
  schemas: readonly ProviderSchema[],
): ProviderTypeOption[] {
  const options: ProviderTypeOption[] = selectable.map((type) => ({
    value: type,
    label: providerTypeLabel(type, schemas),
    disabled: false,
  }));
  if (stored && !selectable.includes(stored)) {
    options.push({
      value: stored,
      label: `${providerTypeLabel(stored, schemas)} (not available)`,
      disabled: true,
    });
  }
  return options;
}

/** A new provider starts on a type that delivers, never on a sink. */
export function defaultProviderType(
  selectable: readonly EmailProviderType[],
): EmailProviderType {
  return (
    selectable.find((type) => !isSinkProviderType(type)) ??
    selectable[0] ??
    "SMTP"
  );
}

export function providerStateLabel(
  provider: Pick<EmailProviderSetting, "enabled" | "isDefault" | "providerType">,
  sinkProvidersRetired: boolean,
) {
  if (!provider.enabled) return "Disabled";
  if (sinkProvidersRetired && isSinkProviderType(provider.providerType)) {
    return "Not used";
  }
  return provider.isDefault ? "Default" : "Enabled";
}
