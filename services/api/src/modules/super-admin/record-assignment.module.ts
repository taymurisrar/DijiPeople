import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AssignmentRulesService } from './assignment-rules.service';
import { RecordAssignmentService } from './record-assignment.service';

/*
 * Deliberately standalone: it imports nothing from SuperAdminModule, so
 * LeadsModule, BillingModule and the support-cases module can all import it
 * without creating a cycle (SuperAdminModule already imports BillingModule).
 * The HTTP controller stays in SuperAdminModule, where the platform guards live.
 */
@Module({
  imports: [AuditModule],
  providers: [RecordAssignmentService, AssignmentRulesService],
  exports: [RecordAssignmentService, AssignmentRulesService],
})
export class RecordAssignmentModule {}
