-- DP-MASTER WP-36.S2: a duty occurrence points at its work item with a real foreign key, so lists can filter and page by visibility in SQL. Additive; every existing occurrence was created together with its work item.

ALTER TABLE "DutyOccurrence" ADD CONSTRAINT "DutyOccurrence_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
