export type InertReasonCode =
  | 'NOT_IMPLEMENTED'
  | 'DUPLICATE_OF_DOMAIN_MODEL'
  | 'UNCONDITIONAL_BY_DESIGN'
  | 'DEFERRED_ATTENDANCE_WORK';

export declare const INERT_REASONS: Readonly<Record<InertReasonCode, string>>;

/** `'<category>.<key>'` -> reason code. */
export declare const INERT_TENANT_SETTING_KEYS: Readonly<
  Record<string, InertReasonCode>
>;

/** Inert keys whose editable control has not been withdrawn yet. */
export declare const INERT_KEYS_WITH_PENDING_UI_REMOVAL: readonly string[];

export declare function isInertTenantSettingKey(
  category: string,
  key: string,
): boolean;

export declare function isTenantSettingControlRenderable(
  category: string,
  key: string,
): boolean;
