import type { ExtractedTimelineEntry } from './timelineExtractor';

export interface ExistingPeriodRecord {
  id: number;
  scenario_id: number;
  period_label: string;
  period_type: 'Yearly' | 'Monthly' | 'Event';
  af_type: 'Actual' | 'Forecast';
  period_val: string | null;
  display_order: number;
}

export interface TimelineReconcileParams {
  scenarioId: number;
  existingPeriods: ExistingPeriodRecord[];
  extractedPeriods: ExtractedTimelineEntry[];
}

export interface UpsertPeriodRecord {
  id?: number;
  scenario_id: number;
  period_label: string;
  period_type: 'Yearly' | 'Monthly' | 'Event';
  af_type: 'Actual' | 'Forecast';
  period_val: string | null;
  display_order: number;
}

export interface TimelineReconcileResult {
  upserts: UpsertPeriodRecord[];
  toDelete: number[];
}

const labelKey = (label: string): string => label.trim().toUpperCase();

export const reconcileTimeline = ({
  scenarioId,
  existingPeriods,
  extractedPeriods,
}: TimelineReconcileParams): TimelineReconcileResult => {
  const existingByLabel = new Map<string, ExistingPeriodRecord>();
  for (const period of existingPeriods) {
    existingByLabel.set(labelKey(period.period_label), period);
  }

  const seenIds = new Set<number>();
  const upserts: UpsertPeriodRecord[] = [];

  for (const extracted of extractedPeriods) {
    const key = labelKey(extracted.period_label);
    const current = existingByLabel.get(key);

    if (current) {
      seenIds.add(current.id);
      upserts.push({
        id: current.id,
        scenario_id: scenarioId,
        period_label: extracted.period_label,
        period_type: extracted.period_type,
        af_type: extracted.af_type,
        period_val: extracted.period_val,
        display_order: extracted.display_order,
      });
    } else {
      upserts.push({
        id: undefined,
        scenario_id: scenarioId,
        period_label: extracted.period_label,
        period_type: extracted.period_type,
        af_type: extracted.af_type,
        period_val: extracted.period_val,
        display_order: extracted.display_order,
      });
    }
  }

  const toDelete = existingPeriods
    .filter((period) => !seenIds.has(period.id))
    .map((period) => period.id)
    .filter((id) => !upserts.some((u) => u && u.id === id));

  return { upserts, toDelete };
};
