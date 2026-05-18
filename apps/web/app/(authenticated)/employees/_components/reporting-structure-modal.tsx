"use client";

import { useState } from "react";
import { Button } from "@/app/components/ui/button";
import { UserAvatar } from "../../_components/user-avatar";

export type ReportingNode = {
  employeeId: string;
  displayName: string;
  jobTitle: string | null;
  department: string | null;
  profilePhotoUrl: string | null;
  managerId: string | null;
};

export type ReportingTreeNode = ReportingNode & {
  children: ReportingTreeNode[];
};

export function ReportingStructureModal({
  currentEmployeeId,
  fullTree,
}: {
  currentEmployeeId: string;
  fullTree: ReportingTreeNode[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} variant="secondary" size="md">
        View full reporting structure
      </Button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="flex max-h-[85vh] w-full max-w-5xl flex-col rounded-[28px] border border-border bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-semibold text-foreground">
                  Reporting Structure
                </h3>
                <p className="mt-1 text-sm text-muted">
                  Employee reporting chain for this tenant.
                </p>
              </div>
              <button
                className="rounded-full border border-border px-3 py-1 text-sm text-muted"
                onClick={() => setOpen(false)}
                type="button"
              >
                Close
              </button>
            </div>
            <div className="mt-6 overflow-auto rounded-2xl border border-border bg-slate-50/70 p-5">
              {fullTree.length === 0 ? (
                <p className="text-sm text-muted">
                  No reporting relationships have been configured yet.
                </p>
              ) : (
                <div className="grid gap-4">
                  {fullTree.map((node) => (
                    <TreeNode
                      key={node.employeeId}
                      currentEmployeeId={currentEmployeeId}
                      node={node}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function TreeNode({
  node,
  currentEmployeeId,
}: {
  node: ReportingTreeNode;
  currentEmployeeId: string;
}) {
  const parts = node.displayName.split(" ");
  const isCurrent = node.employeeId === currentEmployeeId;
  return (
    <div className="grid gap-3">
      <div
        className={`flex items-center gap-3 rounded-2xl border p-4 ${
          isCurrent ? "border-accent bg-accent/10" : "border-border bg-white"
        }`}
      >
        <UserAvatar
          firstName={parts[0] ?? node.displayName}
          lastName={parts.slice(1).join(" ")}
          imageSrc={node.profilePhotoUrl}
        />
        <div>
          <p className="font-medium text-foreground">{node.displayName}</p>
          <p className="text-sm text-muted">
            {[node.jobTitle, node.department].filter(Boolean).join(" • ") ||
              "Role not set"}
          </p>
        </div>
      </div>
      {node.children.length ? (
        <div className="ml-7 grid gap-3 border-l-2 border-border pl-5">
          {node.children.map((child) => (
            <TreeNode
              key={child.employeeId}
              currentEmployeeId={currentEmployeeId}
              node={child}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
