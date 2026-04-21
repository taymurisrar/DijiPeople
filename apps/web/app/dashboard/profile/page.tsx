import Link from "next/link";
import {
  Briefcase,
  ChevronDown,
  FileText,
  GraduationCap,
  Mail,
  ShieldCheck,
  User,
  UserCircle2,
} from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { apiRequestJson } from "@/lib/server-api";
import { getCurrentEmployee } from "../_lib/current-employee";
import { EmployeeSelfProfileForm } from "../_components/employee-self-profile-form";
import { EmployeeDocumentsManager } from "../employees/_components/employee-documents-manager";
import { EmployeeEducationManager } from "../employees/_components/employee-education-manager";
import { EmployeeProfileImageCard } from "../employees/_components/employee-profile-image-card";
import { EmployeeProfile } from "../employees/types";

type UserProfile = {
  userId: string;
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  tenant: {
    id: string;
    name: string;
    slug: string;
    status: string;
  };
  roles: Array<{
    id: string;
    key: string;
    name: string;
  }>;
};

export default async function ProfilePage() {
  const sessionUser = await getSessionUser();

  if (!sessionUser) {
    return null;
  }

  const [userProfile, currentEmployeeContext] = await Promise.all([
    apiRequestJson<UserProfile>("/users/me"),
    getCurrentEmployee(sessionUser),
  ]);

  const employee = currentEmployeeContext.employee;

  const employeeProfile = employee
    ? await apiRequestJson<EmployeeProfile>(`/employees/${employee.id}`)
    : null;

  return (
    <main className="grid gap-6">
      <section className="rounded-[28px] border border-border bg-surface p-8 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <UserCircle2 className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-muted">
              My Profile
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-foreground">
              Manage your employee profile
            </h1>
            <p className="mt-2 max-w-3xl text-muted">
              Keep your personal information, documents, and education records
              updated in one clean self-service workspace.
            </p>
          </div>
        </div>
      </section>

      {employeeProfile ? (
        <div className="grid gap-6">
          <section className="grid gap-6 xl:grid-cols-[0.42fr_0.58fr]">
            <TopInfoCard
              icon={<UserCircle2 className="h-5 w-5" />}
              title="Profile Image"
              description="Upload and manage your profile picture."
            >
              <EmployeeProfileImageCard
                employeeId={employeeProfile.id}
                employeeName={employeeProfile.fullName}
                profileImage={employeeProfile.profileImage}
              />
            </TopInfoCard>

            <TopInfoCard
              icon={<ShieldCheck className="h-5 w-5" />}
              title="Account Information"
              description="Basic account details linked to your employee profile."
            >
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                <DetailRow
                  icon={<User className="h-4 w-4" />}
                  label="Account name"
                  value={`${userProfile.firstName} ${userProfile.lastName}`}
                />
                <DetailRow
                  icon={<Mail className="h-4 w-4" />}
                  label="Login email"
                  value={userProfile.email}
                />
                <DetailRow
                  icon={<ShieldCheck className="h-4 w-4" />}
                  label="Role"
                  value={userProfile.roles[0]?.name ?? "Employee"}
                />
                <DetailRow
                  icon={<Briefcase className="h-4 w-4" />}
                  label="Employee code"
                  value={employeeProfile.employeeCode}
                />
                <DetailRow
                  icon={<Briefcase className="h-4 w-4" />}
                  label="Employment status"
                  value={employeeProfile.employmentStatus}
                />
                <DetailRow
                  icon={<Briefcase className="h-4 w-4" />}
                  label="Department"
                  value={employeeProfile.department?.name ?? "Not assigned"}
                />
              </div>
            </TopInfoCard>
          </section>

          <AccordionCard
            id="personal-details"
            icon={<User className="h-5 w-5" />}
            title="Personal Details"
            description="Basic personal, contact, and profile information."
            defaultOpen
          >
            <EmployeeSelfProfileForm employee={employeeProfile} />
          </AccordionCard>

          <AccordionCard
            id="employment-details"
            icon={<Briefcase className="h-5 w-5" />}
            title="Employment Details"
            description="Read-only employment information."
          >
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              <DetailRow
                icon={<Briefcase className="h-4 w-4" />}
                label="Department"
                value={employeeProfile.department?.name ?? "Not assigned"}
              />
              <DetailRow
                icon={<Briefcase className="h-4 w-4" />}
                label="Designation"
                value={employeeProfile.designation?.name ?? "Not assigned"}
              />
              <DetailRow
                icon={<User className="h-4 w-4" />}
                label="Reporting manager"
                value={employeeProfile.reportingManager?.fullName ?? "Not assigned"}
              />
              <DetailRow
                icon={<Briefcase className="h-4 w-4" />}
                label="Employment status"
                value={employeeProfile.employmentStatus}
              />
              <DetailRow
                icon={<Briefcase className="h-4 w-4" />}
                label="Employee code"
                value={employeeProfile.employeeCode}
              />
              <DetailRow
                icon={<Briefcase className="h-4 w-4" />}
                label="Hire date"
                value={new Date(employeeProfile.hireDate).toLocaleDateString()}
              />
            </div>
          </AccordionCard>

          <AccordionCard
            id="documents"
            icon={<FileText className="h-5 w-5" />}
            title="Documents"
            description="Upload and manage your profile documents."
          >
            <EmployeeDocumentsManager
              documents={employeeProfile.documents}
              employeeId={employeeProfile.id}
            />
          </AccordionCard>

          <AccordionCard
            id="education"
            icon={<GraduationCap className="h-5 w-5" />}
            title="Education"
            description="Add and maintain your academic records."
          >
            <EmployeeEducationManager
              educationRecords={employeeProfile.educationRecords}
              employeeId={employeeProfile.id}
            />
          </AccordionCard>
        </div>
      ) : (
        <section className="rounded-[24px] border border-dashed border-border bg-surface p-10 shadow-sm">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Employee profile not linked
          </p>
          <h4 className="mt-3 text-2xl font-semibold text-foreground">
            This account does not have an employee record yet.
          </h4>
          <p className="mt-3 max-w-3xl text-muted">
            An administrator needs to link your user to an employee record
            before leave, attendance, timesheets, and profile editing are fully
            available.
          </p>
          <Link
            className="mt-6 inline-flex rounded-2xl border border-border px-5 py-3 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
            href="/dashboard"
          >
            Back to dashboard
          </Link>
        </section>
      )}
    </main>
  );
}

function TopInfoCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/10 text-accent">
          {icon}
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <p className="mt-1 text-sm text-muted">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function AccordionCard({
  id,
  icon,
  title,
  description,
  children,
  defaultOpen = false,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      className="group rounded-[24px] border border-border bg-surface shadow-sm"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            {icon}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">{title}</h3>
            <p className="mt-1 text-sm text-muted">{description}</p>
          </div>
        </div>

        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border transition group-open:rotate-180">
          <ChevronDown className="h-5 w-5 text-muted" />
        </span>
      </summary>

      <div className="border-t border-border px-6 py-6">{children}</div>
    </details>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-border/70 bg-background/60 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-muted">
        {icon ? <span className="text-accent">{icon}</span> : null}
        <span>{label}</span>
      </div>
      <p className="mt-2 break-words text-sm font-medium text-foreground">
        {value || "-"}
      </p>
    </div>
  );
}