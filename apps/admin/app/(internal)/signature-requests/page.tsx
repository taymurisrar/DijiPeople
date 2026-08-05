import { redirect } from "next/navigation";
export default function Page() {
  redirect("/contracts?viewId=awaiting-external-signature");
}
