import { reconcileTimeline } from '../service/timeline/timelineReconciler';

describe('TimelineReconciler', () => {
  const scenarioId = 42;

  it('marks all extracted periods for insertion when none exist', () => {
    const result = reconcileTimeline({
      scenarioId,
      existingPeriods: [],
      extractedPeriods: [
        {
          period_label: 'FY2020',
          period_type: 'Yearly',
          af_type: 'Actual',
          period_val: '2020-03',
          display_order: 1,
        },
        {
          period_label: 'FY2021',
          period_type: 'Yearly',
          af_type: 'Actual',
          period_val: '2021-03',
          display_order: 2,
        },
      ],
    });

    expect(result.upserts).toEqual([
      {
        id: undefined,
        scenario_id: scenarioId,
        period_label: 'FY2020',
        period_type: 'Yearly',
        af_type: 'Actual',
        period_val: '2020-03',
        display_order: 1,
      },
      {
        id: undefined,
        scenario_id: scenarioId,
        period_label: 'FY2021',
        period_type: 'Yearly',
        af_type: 'Actual',
        period_val: '2021-03',
        display_order: 2,
      },
    ]);
    expect(result.toDelete).toEqual([]);
  });

  it('updates metadata for matching periods and schedules obsolete rows for deletion', () => {
    const result = reconcileTimeline({
      scenarioId,
      existingPeriods: [
        {
          id: 1,
          scenario_id: scenarioId,
          period_label: 'FY2020',
          period_type: 'Monthly',
          af_type: 'Forecast',
          period_val: null,
          display_order: 3,
        },
        {
          id: 2,
          scenario_id: scenarioId,
          period_label: 'FY2019',
          period_type: 'Yearly',
          af_type: 'Actual',
          period_val: '2019-03',
          display_order: 1,
        },
      ],
      extractedPeriods: [
        {
          period_label: 'FY2020',
          period_type: 'Yearly',
          af_type: 'Actual',
          period_val: '2020-03',
          display_order: 1,
        },
        {
          period_label: 'FY2021',
          period_type: 'Yearly',
          af_type: 'Actual',
          period_val: '2021-03',
          display_order: 2,
        },
      ],
    });

    expect(result.upserts).toEqual([
      {
        id: 1,
        scenario_id: scenarioId,
        period_label: 'FY2020',
        period_type: 'Yearly',
        af_type: 'Actual',
        period_val: '2020-03',
        display_order: 1,
      },
      {
        id: undefined,
        scenario_id: scenarioId,
        period_label: 'FY2021',
        period_type: 'Yearly',
        af_type: 'Actual',
        period_val: '2021-03',
        display_order: 2,
      },
    ]);
    expect(result.toDelete).toEqual([2]);
  });
});
