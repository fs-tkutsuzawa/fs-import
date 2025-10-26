import { jest } from '@jest/globals';
import { createTimelineOrchestrator } from '../service/timeline/timelineOrchestrator';
import type { ExtractedTimelineEntry } from '../service/timeline/timelineExtractor';
import type {
  ExistingPeriodRecord,
  UpsertPeriodRecord,
} from '../service/timeline/timelineReconciler';

describe('TimelineOrchestrator', () => {
  const scenarioId = 501;

  const extracted: ExtractedTimelineEntry[] = [
    {
      period_label: 'FY2020',
      period_type: 'Yearly',
      af_type: 'Actual',
      period_val: '2020-03-31',
      display_order: 1,
    },
    {
      period_label: 'FY2021',
      period_type: 'Yearly',
      af_type: 'Actual',
      period_val: '2021-03-31',
      display_order: 2,
    },
  ];

  it('extracts timeline, reconciles, and persists changes', async () => {
    const fetchPeriods = jest
      .fn<(scenarioId: number) => Promise<ExistingPeriodRecord[]>>()
      .mockResolvedValueOnce([
        {
          id: 30,
          scenario_id: scenarioId,
          period_label: 'FY2020',
          period_type: 'Monthly',
          af_type: 'Forecast',
          period_val: null,
          display_order: 10,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 30,
          scenario_id: scenarioId,
          period_label: 'FY2020',
          period_type: 'Yearly',
          af_type: 'Actual',
          period_val: '2020-03-31',
          display_order: 1,
        },
        {
          id: 901,
          scenario_id: scenarioId,
          period_label: 'FY2021',
          period_type: 'Yearly',
          af_type: 'Actual',
          period_val: '2021-03-31',
          display_order: 2,
        },
      ]);
    const upsertPeriods = jest.fn<
      (records: UpsertPeriodRecord[]) => Promise<ExistingPeriodRecord[]>
    >(async (records: UpsertPeriodRecord[]) =>
      records.map((record, index) => ({
        ...record,
        id: record.id ?? 900 + index,
        scenario_id: scenarioId,
      }))
    );
    const deletePeriods = jest.fn<(periodIds: number[]) => Promise<void>>(
      async () => undefined
    );
    const extractor = jest.fn(() => extracted);

    const orchestrator = createTimelineOrchestrator({
      timelineRepository: {
        fetchByScenario: fetchPeriods,
        upsertMany: upsertPeriods,
        deleteMany: deletePeriods,
      },
      extractFromImportDf: extractor,
    });

    const importDf = { periods: ['2020-03', '2021-03'] };
    const result = await orchestrator.ensureScenarioTimeline({
      scenarioId,
      importDf,
    });

    expect(extractor).toHaveBeenCalledWith(importDf);
    expect(upsertPeriods).toHaveBeenCalledWith([
      {
        id: 30,
        scenario_id: scenarioId,
        period_label: 'FY2020',
        period_type: 'Yearly',
        af_type: 'Actual',
        period_val: '2020-03-31',
        display_order: 1,
      },
      {
        id: undefined,
        scenario_id: scenarioId,
        period_label: 'FY2021',
        period_type: 'Yearly',
        af_type: 'Actual',
        period_val: '2021-03-31',
        display_order: 2,
      },
    ]);
    expect(deletePeriods).not.toHaveBeenCalled();

    expect(fetchPeriods).toHaveBeenCalledTimes(2);
    expect(result).toEqual([
      {
        id: 30,
        scenario_id: scenarioId,
        period_label: 'FY2020',
        period_type: 'Yearly',
        af_type: 'Actual',
        period_val: '2020-03-31',
        display_order: 1,
      },
      {
        id: 901,
        scenario_id: scenarioId,
        period_label: 'FY2021',
        period_type: 'Yearly',
        af_type: 'Actual',
        period_val: '2021-03-31',
        display_order: 2,
      },
    ]);
  });

  it('skips persistence when no extracted periods found', async () => {
    const fetchPeriods = jest.fn<
      (scenarioId: number) => Promise<ExistingPeriodRecord[]>
    >(async () => []);
    const upsertPeriods =
      jest.fn<
        (records: UpsertPeriodRecord[]) => Promise<ExistingPeriodRecord[]>
      >();
    const deletePeriods = jest.fn<(periodIds: number[]) => Promise<void>>();
    const extractor = jest.fn(() => []);

    const orchestrator = createTimelineOrchestrator({
      timelineRepository: {
        fetchByScenario: fetchPeriods,
        upsertMany: upsertPeriods,
        deleteMany: deletePeriods,
      },
      extractFromImportDf: extractor,
    });

    const result = await orchestrator.ensureScenarioTimeline({
      scenarioId,
      importDf: { periods: [] },
    });

    expect(upsertPeriods).not.toHaveBeenCalled();
    expect(deletePeriods).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('appends forecast periods based on projectionYears when missing', async () => {
    const existing: ExistingPeriodRecord[] = [
      {
        id: 10,
        scenario_id: scenarioId,
        period_label: 'FY2022',
        period_type: 'Yearly',
        af_type: 'Actual',
        period_val: '2022-03-31',
        display_order: 1,
      },
      {
        id: 20,
        scenario_id: scenarioId,
        period_label: 'FY2023',
        period_type: 'Yearly',
        af_type: 'Actual',
        period_val: '2023-03-31',
        display_order: 2,
      },
    ];

    const fetchPeriods = jest
      .fn<(scenarioId: number) => Promise<ExistingPeriodRecord[]>>()
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce([
        ...existing,
        {
          id: 901,
          scenario_id: scenarioId,
          period_label: 'FY2024',
          period_type: 'Yearly',
          af_type: 'Forecast',
          period_val: '2024-12-31',
          display_order: 3,
        },
        {
          id: 902,
          scenario_id: scenarioId,
          period_label: 'FY2025',
          period_type: 'Yearly',
          af_type: 'Forecast',
          period_val: '2025-12-31',
          display_order: 4,
        },
      ]);

    const upsertPeriods = jest.fn<
      (records: UpsertPeriodRecord[]) => Promise<ExistingPeriodRecord[]>
    >(async (records: UpsertPeriodRecord[]) =>
      records.map((record, index) => ({
        ...record,
        id: record.id ?? 900 + index,
        scenario_id: scenarioId,
      }))
    );
    const deletePeriods = jest.fn<(periodIds: number[]) => Promise<void>>();
    const extractor = jest.fn<() => ExtractedTimelineEntry[]>(() => [
      {
        period_label: 'FY2022',
        period_type: 'Yearly',
        af_type: 'Actual',
        period_val: '2022-12-31',
        display_order: 1,
      },
      {
        period_label: 'FY2023',
        period_type: 'Yearly',
        af_type: 'Actual',
        period_val: '2023-12-31',
        display_order: 2,
      },
    ]);

    const orchestrator = createTimelineOrchestrator({
      timelineRepository: {
        fetchByScenario: fetchPeriods,
        upsertMany: upsertPeriods,
        deleteMany: deletePeriods,
      },
      extractFromImportDf: extractor,
    });

    const importDf = { periods: ['2022', '2023'] };
    const result = await orchestrator.ensureScenarioTimeline({
      scenarioId,
      importDf,
      projectionYears: 2,
    });

    expect(extractor).toHaveBeenCalledWith(importDf);
    expect(upsertPeriods).toHaveBeenCalledWith([
      {
        id: 10,
        scenario_id: scenarioId,
        period_label: 'FY2022',
        period_type: 'Yearly',
        af_type: 'Actual',
        period_val: '2022-12-31',
        display_order: 1,
      },
      {
        id: 20,
        scenario_id: scenarioId,
        period_label: 'FY2023',
        period_type: 'Yearly',
        af_type: 'Actual',
        period_val: '2023-12-31',
        display_order: 2,
      },
      {
        id: undefined,
        scenario_id: scenarioId,
        period_label: 'FY2024',
        period_type: 'Yearly',
        af_type: 'Forecast',
        period_val: '2024-12-31',
        display_order: 3,
      },
      {
        id: undefined,
        scenario_id: scenarioId,
        period_label: 'FY2025',
        period_type: 'Yearly',
        af_type: 'Forecast',
        period_val: '2025-12-31',
        display_order: 4,
      },
    ]);
    expect(deletePeriods).not.toHaveBeenCalled();
    expect(fetchPeriods).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(4);
    expect(result[2]).toMatchObject({
      period_label: 'FY2024',
      af_type: 'Forecast',
      display_order: 3,
    });
    expect(result[3]).toMatchObject({
      period_label: 'FY2025',
      af_type: 'Forecast',
      display_order: 4,
    });
  });
});
