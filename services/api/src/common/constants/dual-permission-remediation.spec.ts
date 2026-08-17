import { METHOD_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { PayComponentsController } from '../../modules/pay-components/pay-components.controller';
import { PoliciesController } from '../../modules/policies/policies.controller';
import { TaxRulesController } from '../../modules/tax-rules/tax-rules.controller';
import { DocumentsController } from '../../modules/documents/documents.controller';
import { BillingController } from '../../modules/billing/controllers/billing.controller';
import { BusinessUnitsController } from '../../modules/organization/business-units.controller';
import { DepartmentsController } from '../../modules/organization/departments.controller';
import { DesignationsController } from '../../modules/organization/designations.controller';
import { LocationsController } from '../../modules/organization/locations.controller';
import { OrganizationsController } from '../../modules/organization/organizations.controller';
import { CustomizationController } from '../../modules/customization/customization.controller';
import { EnterpriseConfigurationController } from '../../modules/tenant-settings/enterprise-configuration.controller';
import { SettingsContextController } from '../../modules/tenant-settings/settings-context.controller';
import { TimesheetsController } from '../../modules/timesheets/timesheets.controller';
import { TimesheetPoliciesController } from '../../modules/timesheets/timesheet-policies.controller';
import { TimesheetJobsController } from '../../modules/timesheets/timesheet-jobs.controller';
import { TimesheetExportsController } from '../../modules/timesheets/timesheet-exports.controller';
import { PayrollController } from '../../modules/payroll/payroll.controller';
import { PayrollRunController } from '../../modules/payroll/payroll-run.controller';
import { EmployerBankAccountsController } from '../../modules/payroll/employer-bank-accounts.controller';
import { PayrollGlController } from '../../modules/payroll/payroll-gl.controller';
import { PayrollOperationsController } from '../../modules/payroll/payroll-operations.controller';
import { ClaimsController } from '../../modules/claims/claims.controller';
import { BenefitsController } from '../../modules/benefits/benefits.controller';
import { LoansController } from '../../modules/loans/loans.controller';
import { BusinessTripsController } from '../../modules/business-trips/business-trips.controller';
import { TimePayrollController } from '../../modules/time-payroll/time-payroll.controller';
import { CompensationController } from '../../modules/compensation/compensation.controller';
import { SalaryPackageRulesController } from '../../modules/compensation/salary-package-rules.controller';
import { PayslipsController } from '../../modules/payslips/payslips.controller';
import {
  REQUIRED_PERMISSIONS_KEY,
  REQUIRED_RBAC_PERMISSIONS_KEY,
} from '../decorators/require-permissions.decorator';

type ControllerClass = {
  name: string;
  prototype: Record<string, unknown>;
};

const REMEDIATED_CONTROLLERS: ControllerClass[] = [
  PayComponentsController as unknown as ControllerClass,
  PoliciesController as unknown as ControllerClass,
  TaxRulesController as unknown as ControllerClass,
  DocumentsController as unknown as ControllerClass,
  BillingController as unknown as ControllerClass,
  BusinessUnitsController as unknown as ControllerClass,
  DepartmentsController as unknown as ControllerClass,
  DesignationsController as unknown as ControllerClass,
  LocationsController as unknown as ControllerClass,
  OrganizationsController as unknown as ControllerClass,
  CustomizationController as unknown as ControllerClass,
  EnterpriseConfigurationController as unknown as ControllerClass,
  SettingsContextController as unknown as ControllerClass,
  TimesheetsController as unknown as ControllerClass,
  TimesheetPoliciesController as unknown as ControllerClass,
  TimesheetJobsController as unknown as ControllerClass,
  TimesheetExportsController as unknown as ControllerClass,
  PayrollController as unknown as ControllerClass,
  PayrollRunController as unknown as ControllerClass,
  EmployerBankAccountsController as unknown as ControllerClass,
  PayrollGlController as unknown as ControllerClass,
  PayrollOperationsController as unknown as ControllerClass,
  ClaimsController as unknown as ControllerClass,
  BenefitsController as unknown as ControllerClass,
  LoansController as unknown as ControllerClass,
  BusinessTripsController as unknown as ControllerClass,
  TimePayrollController as unknown as ControllerClass,
  CompensationController as unknown as ControllerClass,
  SalaryPackageRulesController as unknown as ControllerClass,
  PayslipsController as unknown as ControllerClass,
];

function routeHandlers(controller: ControllerClass) {
  return Object.getOwnPropertyNames(controller.prototype)
    .filter((name) => name !== 'constructor')
    .filter((name) => {
      const handler = controller.prototype[name];
      return (
        typeof handler === 'function' &&
        Reflect.getMetadata(METHOD_METADATA, handler) !== undefined
      );
    });
}

describe('completed dual-permission remediation batches', () => {
  it.each(REMEDIATED_CONTROLLERS)(
    '$name keeps both permission families on every route',
    (controller) => {
      const reflector = new Reflector();
      const missing: string[] = [];

      for (const name of routeHandlers(controller)) {
        const handler = controller.prototype[name] as object;
        const lookup = [handler, controller] as Parameters<
          Reflector['getAllAndOverride']
        >[1];
        const legacy = reflector.getAllAndOverride<string[]>(
          REQUIRED_PERMISSIONS_KEY,
          lookup,
        );
        const matrix = reflector.getAllAndOverride<unknown[]>(
          REQUIRED_RBAC_PERMISSIONS_KEY,
          lookup,
        );

        if (!legacy?.length || !matrix?.length) {
          missing.push(`${controller.name}.${name}`);
        }
      }

      expect(missing).toEqual([]);
    },
  );
});
