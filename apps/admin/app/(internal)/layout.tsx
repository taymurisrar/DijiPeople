import { AdminShell } from "@/app/_components/admin-shell";
import { requireSuperAdminUser } from "@/lib/auth";

export default async function InternalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireSuperAdminUser("/tenants");

  return (
    <AdminShell
      user={{
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
      }}
    >
      {children}
    </AdminShell>
  );
}
