import { readFileSync } from "node:fs";
import { join } from "node:path";

import type {
  EffectiveEmailProvider,
  ProviderSchema,
} from "@/lib/notifications-api";
import {
  defaultProviderType,
  describeEmailDelivery,
  providerStateLabel,
  providerTypeOptions,
  resolveEmailDeliveryPath,
  selectableProviderTypes,
} from "./email-delivery-path";

/*
 * BUG-3501 / REG-518 — the Email Providers screen states the real delivery path.
 *
 * The demo tenant's banner read "Email is sent by this workspace's own provider
 * … over CONSOLE" while nothing was delivered. These pin that a sink is never
 * described as delivering, whichever API version answers, and that the
 * developer copy removed from the screen stays removed.
 */

const SCHEMAS: ProviderSchema[] = [
  { providerType: "CONSOLE", label: "Console", description: "", fields: [] },
  { providerType: "DEV", label: "Development", description: "", fields: [] },
  { providerType: "SMTP", label: "SMTP", description: "", fields: [] },
];

function effective(
  overrides: Partial<EffectiveEmailProvider> = {},
): EffectiveEmailProvider {
  return {
    canSend: true,
    source: "tenant",
    inherited: false,
    providerType: "SMTP",
    providerSettingId: "provider-1",
    fromEmail: "no-reply@acme.test",
    fromName: "Acme",
    replyToEmail: null,
    ...overrides,
  };
}

describe("describeEmailDelivery", () => {
  it("names this workspace's provider when it delivers", () => {
    expect(
      describeEmailDelivery(
        effective({ deliveryPath: "TENANT_PROVIDER", notDeliveredReason: null }),
        SCHEMAS,
      ),
    ).toEqual({
      tone: "ok",
      title: "Email is delivered by this workspace's provider",
      detail: "Sent as Acme <no-reply@acme.test>",
    });
  });

  it("names the platform relay when the workspace inherits it", () => {
    expect(
      describeEmailDelivery(
        effective({
          source: "platform",
          inherited: true,
          providerSettingId: null,
          fromEmail: "notifications@dijipeople.com",
          fromName: "DijiPeople",
          replyToEmail: "support@dijipeople.com",
          deliveryPath: "PLATFORM_RELAY",
          notDeliveredReason: null,
        }),
      ),
    ).toEqual({
      tone: "ok",
      title: "Email is delivered by the DijiPeople platform relay",
      detail:
        "Sent as DijiPeople <notifications@dijipeople.com>, replies to support@dijipeople.com",
    });
  });

  it("says a Console provider does not deliver — the demo tenant's state", () => {
    const summary = describeEmailDelivery(
      effective({
        providerType: "CONSOLE",
        deliveryPath: "NOT_DELIVERED",
        notDeliveredReason: "SINK_PROVIDER",
      }),
      SCHEMAS,
    );

    expect(summary).toEqual({
      tone: "warning",
      title: "Email is not delivered",
      detail: "The Console provider does not send email.",
    });
  });

  it("says nothing is delivered when no provider resolves", () => {
    expect(
      describeEmailDelivery(
        effective({
          canSend: false,
          source: null,
          providerType: null,
          fromEmail: null,
          fromName: null,
          deliveryPath: "NOT_DELIVERED",
          notDeliveredReason: "NO_PROVIDER",
        }),
      ),
    ).toMatchObject({
      tone: "warning",
      title: "Email is not delivered",
      detail: "No email provider is available.",
    });
  });

  /*
   * The version seam: the web app can deploy before the API. An API without
   * `deliveryPath` reports a Console tenant as `canSend: true, inherited:
   * false` — exactly what the old banner turned into "is sent".
   */
  it.each(["CONSOLE", "DEV"])(
    "never describes a %s sink as delivering, even from an older API",
    (providerType) => {
      const summary = describeEmailDelivery(effective({ providerType }), SCHEMAS);
      expect(summary.tone).toBe("warning");
      expect(summary.title).toBe("Email is not delivered");
      expect(`${summary.title} ${summary.detail}`).not.toMatch(/delivered by|sent as/i);
    },
  );

  it("derives the relay path from an older API's inherited flag", () => {
    expect(
      resolveEmailDeliveryPath(effective({ source: "platform", inherited: true })),
    ).toEqual({ path: "PLATFORM_RELAY", reason: null });
  });
});

describe("provider type choices", () => {
  it("offers only what the API says is selectable", () => {
    expect(selectableProviderTypes(["SMTP"])).toEqual(["SMTP"]);
    expect(selectableProviderTypes(["CONSOLE", "DEV", "SMTP"])).toEqual([
      "CONSOLE",
      "DEV",
      "SMTP",
    ]);
  });

  it("offers no sink when an older API sends no list", () => {
    expect(selectableProviderTypes(undefined)).toEqual(["SMTP"]);
  });

  it("keeps a stored Console type visible but not choosable", () => {
    expect(providerTypeOptions(["SMTP"], "CONSOLE", SCHEMAS)).toEqual([
      { value: "SMTP", label: "SMTP", disabled: false },
      { value: "CONSOLE", label: "Console (not available)", disabled: true },
    ]);
  });

  it("starts a new provider on a type that delivers", () => {
    expect(defaultProviderType(["CONSOLE", "DEV", "SMTP"])).toBe("SMTP");
    expect(defaultProviderType(["SMTP"])).toBe("SMTP");
  });
});

describe("providerStateLabel", () => {
  const consoleRow = {
    providerType: "CONSOLE" as const,
    enabled: true,
    isDefault: true,
  };

  it("marks an enabled Console row as not used where sinks are retired", () => {
    expect(providerStateLabel(consoleRow, true)).toBe("Not used");
    expect(providerStateLabel(consoleRow, false)).toBe("Default");
  });

  it("reports disabled and enabled rows plainly", () => {
    expect(
      providerStateLabel({ ...consoleRow, enabled: false }, true),
    ).toBe("Disabled");
    expect(
      providerStateLabel(
        { providerType: "SMTP", enabled: true, isDefault: false },
        true,
      ),
    ).toBe("Enabled");
  });
});

describe("Email Providers screen copy (ITEM-0183 occurrence 4)", () => {
  const manager = readFileSync(
    join(__dirname, "email-providers-manager.tsx"),
    "utf8",
  );
  const page = readFileSync(
    join(__dirname, "..", "providers", "page.tsx"),
    "utf8",
  );

  it.each([
    "Configuration JSON is sent to the backend as-is",
    "Masked secrets remain protected by backend merge rules",
    "Console provider does not send real emails",
    "rely on backend environment fallback",
    "This provider needs no extra configuration",
    "Adding a provider below and marking it Default overrides this",
    "Disabling every provider below returns this workspace",
  ])("no longer renders %p", (text) => {
    expect(manager.includes(text)).toBe(false);
  });

  it("keeps the page free of its explanatory description", () => {
    expect(page.includes("The fields below change with the provider")).toBe(
      false,
    );
  });

  it("puts the form behind an Add provider action in a dialog", () => {
    expect(manager.includes("Add provider")).toBe(true);
    expect(manager.includes("<Dialog")).toBe(true);
  });
});
