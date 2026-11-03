import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const METADATA_KEY_PATTERN = /^[a-z][a-zA-Z0-9]*$/;

/**
 * Reconcile the CALLER'S workspace against the module provisioning plan.
 * The workspace is always the signed-in user's; nothing here selects another.
 * Omit `apply` for a dry run.
 */
export class ReconcileModulesDto {
  /** Limit to these custom modules; omit for every custom module in the workspace. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @Matches(METADATA_KEY_PATTERN, { each: true })
  @MaxLength(80, { each: true })
  tableKeys?: string[];

  /** Default false = dry run. */
  @IsOptional()
  @IsBoolean()
  apply?: boolean;

  /** Required with `apply`: the workspace's own slug, retyped as a deliberate confirmation. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  confirmTenantSlug?: string;

  /** Required with `apply` on a PRODUCTION workspace: the owner approval reference. Recorded in the audit log. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  authorizationRef?: string;

  /** Custom package the new components are added to; defaults to the workspace's custom package. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  packageId?: string;
}
