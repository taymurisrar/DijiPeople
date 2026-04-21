import { redirect } from "next/navigation";

export default function PayrollIndexPage() {
  redirect("/dashboard/payroll/cycles");
}

