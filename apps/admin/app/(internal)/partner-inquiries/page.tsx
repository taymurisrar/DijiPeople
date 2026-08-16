import { RuntimeModulePage } from "@/app/_components/runtime/runtime-module-page";

/**
 * BUG-0019. This route used to `redirect("/partners?viewId=partner-inquiries")`,
 * which shadowed the `partner-inquiries` runtime module that already existed and
 * sent the reviewer to a **Partner** list filtered by status instead.
 *
 * A PartnerInquiry is a different entity: its rows carry a reference number, a
 * proposed partnership model and a work e-mail, and its ids are what
 * `/partner-inquiries/[inquiryId]` loads. So the redirect both hid the correct
 * list and left the review screen unreachable — the rows it landed on linked to
 * `/partners/{partnerId}`, an id the detail page cannot resolve.
 */
export default function Page() {
  return <RuntimeModulePage moduleKey="partner-inquiries" />;
}
