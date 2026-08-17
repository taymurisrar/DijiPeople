# Data Management

Bulk import and export for tenant modules, reached from **Settings → Data Management → Import & Export**.

## What exists today

| Capability                         | State                                                              |
| ---------------------------------- | ------------------------------------------------------------------ |
| Metadata-driven templates (.xlsx)  | Done                                                               |
| Upload, parse, auto column mapping | Done                                                               |
| Validation that predicts execution | Done                                                               |
| Import execution, all four modes   | Done (employees)                                                   |
| Import as a background job         | Done (queue, worker, progress polling)                             |
| Export as a background job         | Done (employees, attendance)                                       |
| Import history                     | Done                                                               |
| Downloadable error file            | Done                                                               |
| Cancellation                       | Done (between chunks)                                              |
| Saved mapping profiles             | Deliberately not built; `DataMappingProfile` model retained unused |
| Attendance import execution        | Done (shift and work-site rules predicted)                         |

## How it fits together

```
template.service         builds the .xlsx a user fills in
module-registry.service  derives importable fields from the generated runtime schema
import-analysis.service  upload -> parse -> auto-map -> validate (writes nothing)
import-execution.service runs a validated job through the owning module
export-execution.service produces a module's export file
data-job-worker.service  drains queued jobs of either kind
```

### Templates

`DataTemplateService` produces a workbook with three kinds of sheet:

- **Data** - row 1 human labels (`*` marks required), row 2 hidden machine keys,
  row 3 an example marked `#EXAMPLE`, data from row 4.
- **Instructions** - every column documented, plus the fields that cannot be
  imported and why.
- **Reference** - the values this tenant accepts for each lookup column.

Mapping prefers the hidden key row over the visible labels, so renaming or
translating a header does not break a file.

### The registry is the source of truth for fields

`MODULE_DEFINITIONS` declares each module's model, matching keys and
capabilities. Importable fields are derived from
`platform-runtime-schema.generated.json` rather than hand-listed, so a field
added to a module becomes importable without touching this feature.

Three things are filtered out:

- `PROTECTED_FIELD_KEYS` - ids, tenant, audit, ownership, password and similar.
  These can never be set from a file.
- `unsupportedFields` - declared per module, with the reason shown to the user.
- Relation objects where a writable foreign-key scalar exists.

`fieldAliases` renames a model field to the name the module's create contract
uses (`email` becomes `workEmail`). Keep this accurate: a template column the
module rejects is worse than an absent one.

### Validation predicts execution

Two passes run per row:

1. Field-level: type, required, enum, date and email checks from the registry.
2. Module rules: mandatory-field settings the module itself enforces.

The second pass calls `EmployeesService.collectCreateSettingsIssues()`, the same
function `assertEmployeeSettingsRulesForCreate()` throws from. One rule set, two
presentations, so a dry run cannot drift from what execution accepts.

**When adding a module, wire its rules into `buildModuleRowValidator()`.**
Without it, validation will pass rows the module then rejects.

Attendance shows the shape when a rule needs a database lookup: it calls
`AttendanceService.describeManualEntryBlockers()`, which answers the same shift
and work-schedule question `createManualEntry` asks. Results are cached per
employee and date for the run, and the lookup is capped so a very large file
does not issue thousands of queries; beyond the cap execution still reports
those rows individually.

`fieldOverrides` corrects a descriptor when the contract expects a different
shape than the column. Attendance stores `checkIn` as a timestamp while manual
entry takes `HH:mm`, so the aliased field carries the contract's type - without
it, validation rejects values the module would accept.

### Execution writes through the module

Every row goes through the module's own `create()` / `update()`. Permissions,
tenant scoping, validation and audit behave exactly as for a record created by
hand - an import is never a shortcut into the database.

Rows are processed in chunks of 100. Cancellation is checked between chunks, so
a stopped import never leaves a row half written. Each `DataJobRow` keeps its
status and the resulting `recordId`.

Modes: `VALIDATE_ONLY`, `CREATE_ONLY`, `UPDATE_ONLY`, `CREATE_OR_UPDATE`.
Matching uses the module's declared `matchingKeys`.

## Background execution

`DataJobWorkerService` polls every 5 seconds and drains queued jobs of either
kind. Two things matter here:

- **Jobs are claimed with a conditional update** filtered on `status: QUEUED`.
  Two workers racing produce one winner and one no-op rather than running the
  same job twice. A `cycleRunning` flag stops a slow job from having a second
  cycle stacked on it.
- **The worker runs as the submitting user.** It reloads that user's access
  context and passes it into execution, so rows are written with their own
  permissions and scope. A worker with ambient elevated rights would be a way to
  write past the checks every other path enforces.

Endpoints return immediately with `QUEUED`; the UI polls the status endpoint
until the job reaches `COMPLETED`, `PARTIALLY_COMPLETED`, `FAILED` or
`CANCELLED`.

Exports are produced by the owning module's own export method, so a file
contains exactly the rows that user could already list. The result is written
through `StorageService` and only the storage key is kept on the job.

## Permissions

| Key                                 | Grants                         |
| ----------------------------------- | ------------------------------ |
| `data-management.view`              | See the page and history       |
| `data-management.template.download` | Download templates             |
| `data-management.import.validate`   | Upload and check a file        |
| `data-management.import.execute`    | Run an import                  |
| `data-management.import.cancel`     | Cancel a running import        |
| `data-management.export`            | Queue and download exports     |
| `data-management.jobs.readAll`      | See other users' jobs          |
| `data-management.import.retry`      | Retry a failed import          |
| `data-management.mappings.manage`   | Manage saved mappings (unused) |

Held by global-admin, system-admin and HR. Validate and execute are separate on
purpose: checking a file is safe, writing records is not.

## Uploads

Accepts `.xlsx` and `.csv`, max 25 MB, 25 sheets, 20,000 rows. Extension and MIME
type are both checked. Cell values are flattened through `cellToString`, which
unwraps rich text and takes a formula's computed result rather than its
expression - a bare `String()` yields `"[object Object]"` and would import
garbage that looks successful.

Uploaded workbooks are stored via `StorageService`; only the storage key is kept
on `DataJob`, never the binary.

## Adding a module

1. Add an entry to `MODULE_DEFINITIONS` with its model, matching keys and
   `supportsImport` / `supportsExport`.
2. Diff its importable fields against its create DTO. Add `fieldAliases` for
   renames and `unsupportedFields` for anything the contract rejects.
3. Wire its mandatory-field rules into `buildModuleRowValidator()`.
4. Add an executor to `ImportExecutionService.executors()` implementing
   `findExisting` / `create` / `update` through the module's own service.
5. For export, add a producer to `ExportExecutionService.producers()` that calls
   the module's own export method.

The UI needs no change: capability badges and the module list come from the
server, so a new module appears once the registry declares it.
