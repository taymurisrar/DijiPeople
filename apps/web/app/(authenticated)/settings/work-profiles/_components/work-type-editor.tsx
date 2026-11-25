"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import {
  CheckboxField,
  NumberField,
  SelectField,
  TextField,
} from "@/app/components/ui/form-control";
import {
  MEASUREMENT_MODES,
  MEASUREMENT_MODE_LABELS,
  WORK_TYPE_KINDS,
  WORK_TYPE_KIND_LABELS,
  defaultUnitKey,
  emptyWorkType,
  keyFromName,
  unitsForMode,
  type MeasurementMode,
  type WorkTypeDraft,
  type WorkTypeKind,
  type WorkUnit,
} from "../_lib/work-profile-form";

const KIND_OPTIONS = WORK_TYPE_KINDS.map((kind) => ({
  value: kind,
  label: WORK_TYPE_KIND_LABELS[kind],
}));
const MODE_OPTIONS = MEASUREMENT_MODES.map((mode) => ({
  value: mode,
  label: MEASUREMENT_MODE_LABELS[mode],
}));

/**
 * The rows of a profile version's definition: one block per work type with its
 * kind, unit, measurement mode, standard effort, complexity bands and quality
 * checks. Pure controlled UI: validation and persistence belong to the caller
 * and the API.
 */
export function WorkTypeEditor({
  disabled,
  drafts,
  onChange,
  units,
}: {
  disabled?: boolean;
  drafts: WorkTypeDraft[];
  onChange: (next: WorkTypeDraft[]) => void;
  units: WorkUnit[];
}) {
  const update = (index: number, patch: Partial<WorkTypeDraft>) =>
    onChange(
      drafts.map((draft, i) => (i === index ? { ...draft, ...patch } : draft)),
    );

  const rename = (index: number, name: string) => {
    const draft = drafts[index];
    // Keep the key following the name until someone edits the key themselves.
    const followsName = draft.key === keyFromName(draft.name);
    update(index, {
      name,
      ...(followsName ? { key: keyFromName(name) } : {}),
    });
  };

  const changeMode = (index: number, mode: MeasurementMode) => {
    const draft = drafts[index];
    const stillFits = unitsForMode(units, mode).some(
      (unit) => unit.key === draft.unitKey,
    );
    update(index, {
      measurementMode: mode,
      unitKey: stillFits ? draft.unitKey : defaultUnitKey(units, mode),
      ...(mode === "TIMED" ? { standardEffortMinutes: null } : {}),
    });
  };

  return (
    <div className="grid gap-4">
      {drafts.map((draft, index) => {
        const unitOptions = unitsForMode(
          units,
          draft.measurementMode,
          draft.unitKey,
        ).map((unit) => ({
          value: unit.key,
          label: unit.isActive ? unit.name : `${unit.name} (inactive)`,
        }));
        return (
          <fieldset
            className="grid gap-4 rounded-[22px] border border-border bg-white/70 p-4"
            disabled={disabled}
            key={index}
          >
            <legend className="px-2 text-sm font-semibold text-foreground">
              {draft.name.trim() || `Work type ${index + 1}`}
            </legend>
            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                label="Name"
                onChange={(value) => rename(index, value)}
                required
                value={draft.name}
              />
              <TextField
                label="Key"
                onChange={(value) => update(index, { key: value })}
                required
                value={draft.key}
              />
              <SelectField
                label="Kind"
                onChange={(value) =>
                  update(index, { kind: value as WorkTypeKind })
                }
                options={KIND_OPTIONS}
                value={draft.kind}
              />
              <SelectField
                label="Measurement mode"
                onChange={(value) => changeMode(index, value as MeasurementMode)}
                options={MODE_OPTIONS}
                value={draft.measurementMode}
              />
              <SelectField
                label="Unit"
                onChange={(value) => update(index, { unitKey: value })}
                options={unitOptions}
                placeholder="Select a unit"
                required
                value={draft.unitKey}
              />
              {draft.measurementMode !== "TIMED" ? (
                <NumberField
                  label="Standard effort (minutes per unit)"
                  min={0}
                  onChange={(value) =>
                    update(index, { standardEffortMinutes: value })
                  }
                  step={0.5}
                  value={draft.standardEffortMinutes}
                />
              ) : null}
              <NumberField
                label="Verification sample (%)"
                max={100}
                min={0}
                onChange={(value) => update(index, { samplePercent: value })}
                value={draft.samplePercent}
              />
              <CheckboxField
                checked={draft.requiresVerification}
                label="Requires verification"
                onChange={(checked) =>
                  update(index, { requiresVerification: checked })
                }
              />
            </div>

            {draft.bands.length ? (
              <div className="grid gap-3">
                <p className="text-sm font-medium text-foreground">
                  Complexity bands
                </p>
                {draft.bands.map((band, bandIndex) => (
                  <div
                    className="grid items-end gap-3 md:grid-cols-[1fr_1fr_8rem_auto]"
                    key={bandIndex}
                  >
                    <TextField
                      label="Band name"
                      onChange={(value) =>
                        update(index, {
                          bands: draft.bands.map((b, i) =>
                            i === bandIndex
                              ? {
                                  ...b,
                                  name: value,
                                  key:
                                    b.key === keyFromName(b.name)
                                      ? keyFromName(value)
                                      : b.key,
                                }
                              : b,
                          ),
                        })
                      }
                      value={band.name}
                    />
                    <TextField
                      label="Band key"
                      onChange={(value) =>
                        update(index, {
                          bands: draft.bands.map((b, i) =>
                            i === bandIndex ? { ...b, key: value } : b,
                          ),
                        })
                      }
                      value={band.key}
                    />
                    <NumberField
                      label="Multiplier"
                      min={0}
                      onChange={(value) =>
                        update(index, {
                          bands: draft.bands.map((b, i) =>
                            i === bandIndex ? { ...b, multiplier: value } : b,
                          ),
                        })
                      }
                      step={0.1}
                      value={band.multiplier}
                    />
                    <Button
                      aria-label={`Remove band ${bandIndex + 1}`}
                      leftIcon={<Trash2 className="h-4 w-4" />}
                      onClick={() =>
                        update(index, {
                          bands: draft.bands.filter((_, i) => i !== bandIndex),
                        })
                      }
                      size="icon-md"
                      type="button"
                      variant="danger"
                    />
                  </div>
                ))}
              </div>
            ) : null}

            <div className="flex flex-wrap justify-between gap-2">
              <Button
                leftIcon={<Plus className="h-4 w-4" />}
                onClick={() =>
                  update(index, {
                    bands: [
                      ...draft.bands,
                      { key: "", name: "", multiplier: 1 },
                    ],
                  })
                }
                size="xs"
                type="button"
                variant="outline"
              >
                Add complexity band
              </Button>
              <Button
                leftIcon={<Trash2 className="h-4 w-4" />}
                onClick={() => onChange(drafts.filter((_, i) => i !== index))}
                size="xs"
                type="button"
                variant="danger"
              >
                Remove work type
              </Button>
            </div>
          </fieldset>
        );
      })}

      <div>
        <Button
          disabled={disabled}
          leftIcon={<Plus className="h-4 w-4" />}
          onClick={() =>
            onChange([
              ...drafts,
              {
                ...emptyWorkType(),
                unitKey: defaultUnitKey(units, "QUANTITY"),
              },
            ])
          }
          size="sm"
          type="button"
          variant="outline"
        >
          Add work type
        </Button>
      </div>
    </div>
  );
}
