/**
 * Proof-section metrics. All values are null until they are measured live.
 * A null value renders as "Measured live in the demo".
 */
export interface Metric {
  label: string;
  value: number | string | null;
  unit?: string;
  description: string;
}

export const metrics: Metric[] = [
  {
    label: "Components found",
    value: null,
    unit: "/ 17",
    description: "Affected components found out of the known list",
  },
  {
    label: "Grep coverage",
    value: null,
    unit: "%",
    description: "Fraction of the same list that grep alone finds",
  },
  {
    label: "Impact time",
    value: null,
    unit: "s",
    description: "Time to compute the full impact graph",
  },
  {
    label: "Fix time",
    value: null,
    unit: "min",
    description: "Time to apply all fixes across 17 components",
  },
  {
    label: "Dangling refs",
    value: null,
    unit: "",
    description: "Dangling references remaining after the change",
  },
  {
    label: "Tests passing",
    value: null,
    unit: "%",
    description: "Test suite pass rate after the automated fixes",
  },
  {
    label: "Permit blocks",
    value: null,
    unit: "",
    description: "Out-of-permit edits blocked live in the demo",
  },
];
