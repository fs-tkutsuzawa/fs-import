import { extractTimelineFromImportDf } from './timelineExtractor.ts';
import {
  reconcileTimeline,
  type ExistingPeriodRecord,
  type TimelineReconcileResult,
  type UpsertPeriodRecord,
} from './timelineReconciler.ts';
import { timelineRepository as defaultTimelineRepository } from './timelineRepository.ts';

export interface TimelineRepository {
  fetchByScenario: (scenarioId: number) => Promise<ExistingPeriodRecord[]>;
  upsertMany: (
    records: UpsertPeriodRecord[]
  ) => Promise<ExistingPeriodRecord[]>;
  deleteMany: (periodIds: number[]) => Promise<void>;
}

export interface TimelineOrchestratorDeps {
  timelineRepository: TimelineRepository;
  extractFromImportDf?: (
    importDf: unknown
  ) => ReturnType<typeof extractTimelineFromImportDf>;
  reconcile?: (
    params: Parameters<typeof reconcileTimeline>[0]
  ) => TimelineReconcileResult;
}

export interface EnsureScenarioTimelineParams {
  scenarioId: number;
  importDf?: unknown;
  projectionYears?: number;
}

export const createTimelineOrchestrator = ({
  timelineRepository,
  extractFromImportDf = extractTimelineFromImportDf,
  reconcile = reconcileTimeline,
}: TimelineOrchestratorDeps) => {
  const ensureScenarioTimeline = async ({
    scenarioId,
    importDf,
    projectionYears,
  }: EnsureScenarioTimelineParams): Promise<ExistingPeriodRecord[]> => {
    const existing = await timelineRepository.fetchByScenario(scenarioId);
    const actualPeriods = importDf
      ? extractFromImportDf(importDf)
      : extractFromImportDf({ periods: [] });

    const sortedExisting = existing.sort(
      (a, b) => a.display_order - b.display_order
    );

    if (!actualPeriods.length) {
      return sortedExisting;
    }

    const forecastEntries: ReturnType<typeof extractFromImportDf> = [];
    const normalizedActualLabels = new Set(
      actualPeriods.map((entry) => entry.period_label.trim().toUpperCase())
    );

    const actualYears = actualPeriods
      .map((entry) => {
        const match = entry.period_label.match(/(\d{4})$/);
        return match ? Number(match[1]) : undefined;
      })
      .filter((value): value is number => Number.isFinite(value));

    const maxActualYear =
      actualYears.length > 0
        ? Math.max(...actualYears)
        : (() => {
            const fallback = sortedExisting
              .map((period) => {
                const match = period.period_label.match(/(\d{4})$/);
                return match ? Number(match[1]) : undefined;
              })
              .filter((value): value is number => Number.isFinite(value));
            return fallback.length ? Math.max(...fallback) : undefined;
          })();

    const sanitizedProjectionYears =
      projectionYears && projectionYears > 0 ? projectionYears : 0;

    if (maxActualYear != null && sanitizedProjectionYears > 0) {
      for (let offset = 1; offset <= sanitizedProjectionYears; offset += 1) {
        const year = maxActualYear + offset;
        const label = `FY${year}`;
        const normalized = label.trim().toUpperCase();
        if (normalizedActualLabels.has(normalized)) {
          continue;
        }
        forecastEntries.push({
          period_label: label,
          period_type: 'Yearly',
          af_type: 'Forecast',
          period_val: `${year}-12-31`,
          display_order: actualPeriods.length + forecastEntries.length + 1,
        });
      }
    }

    const { upserts, toDelete } = reconcile({
      scenarioId,
      existingPeriods: sortedExisting,
      extractedPeriods: [...actualPeriods, ...forecastEntries],
    });

    if (toDelete.length > 0) {
      await timelineRepository.deleteMany(toDelete);
    }

    if (upserts.length > 0) {
      await timelineRepository.upsertMany(upserts);
    }

    const refreshed = await timelineRepository.fetchByScenario(scenarioId);
    return refreshed.sort((a, b) => a.display_order - b.display_order);
  };

  return {
    ensureScenarioTimeline,
  };
};

export const createDefaultTimelineOrchestrator = () =>
  createTimelineOrchestrator({
    timelineRepository: defaultTimelineRepository,
  });
