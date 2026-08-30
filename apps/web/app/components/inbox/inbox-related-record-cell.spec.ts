import { isValidElement } from "react";
import { relatedRecordCell } from "./inbox-table";
import type { InboxNotification } from "./inbox-types";

/**
 * BUG-2017 — the inbox "Related record" column rendered the bare
 * `relatedEntityId` UUID as plain text: no label, no link, on a row whose
 * every other cell rendered correctly. `apps/web` has no jsdom, so this
 * inspects the returned React element tree directly rather than rendering it.
 */
function notification(overrides: Partial<InboxNotification> = {}): InboxNotification {
  return {
    id: "notif-1",
    eventKey: null,
    moduleKey: "leave",
    type: "approval-requested",
    category: "approvals",
    priority: 1,
    title: "Leave request needs approval",
    summary: null,
    body: null,
    relatedEntityType: null,
    relatedEntityId: null,
    relatedRecordNumber: null,
    targetUrl: null,
    status: "UNREAD",
    requiresAction: true,
    createdAtUtc: "2026-08-29T01:16:00.000Z",
    ...overrides,
  };
}

describe("relatedRecordCell — BUG-2017", () => {
  it("never renders a bare UUID as the cell's sole content", () => {
    const cell = relatedRecordCell(
      notification({
        relatedEntityId: "fea7a460-6e29-4241-b55f-c0a20bef74bd",
        relatedEntityType: null,
        relatedRecordNumber: null,
        targetUrl: null,
      }),
    );

    expect(cell).not.toBe("fea7a460-6e29-4241-b55f-c0a20bef74bd");
    if (typeof cell === "string") {
      expect(cell).not.toContain("fea7a460");
    }
  });

  it("links to targetUrl with the denormalised record number as the label", () => {
    const cell = relatedRecordCell(
      notification({
        relatedEntityId: "fea7a460-6e29-4241-b55f-c0a20bef74bd",
        relatedRecordNumber: "Annual Leave, 07 Sep – 09 Sep",
        targetUrl: "/leaves/fea7a460-6e29-4241-b55f-c0a20bef74bd",
      }),
    );

    expect(isValidElement(cell)).toBe(true);
    if (isValidElement(cell)) {
      const props = cell.props as { href: string; children: string };
      expect(props.href).toBe("/leaves/fea7a460-6e29-4241-b55f-c0a20bef74bd");
      expect(props.children).toBe("Annual Leave, 07 Sep – 09 Sep");
    }
  });

  it("falls back to the humanised entity type when no record number exists", () => {
    const cell = relatedRecordCell(
      notification({
        relatedEntityType: "leave-request",
        relatedRecordNumber: null,
        targetUrl: "/leaves/abc",
      }),
    );

    expect(isValidElement(cell)).toBe(true);
    if (isValidElement(cell)) {
      expect((cell.props as { children: string }).children).toBe(
        "Leave Request",
      );
    }
  });

  it("renders plain text, not a link, when there is no target to open", () => {
    const cell = relatedRecordCell(
      notification({
        relatedEntityType: "leave-request",
        relatedRecordNumber: null,
        targetUrl: null,
      }),
    );

    expect(isValidElement(cell)).toBe(false);
    expect(cell).toBe("Leave Request");
  });

  it("shows literal 'No record' only when there is truly nothing to show", () => {
    const cell = relatedRecordCell(
      notification({
        relatedEntityId: null,
        relatedEntityType: null,
        relatedRecordNumber: null,
        targetUrl: null,
      }),
    );

    expect(cell).toBe("No record");
  });
});
