import { extractTimelineFromImportDf } from '../service/timeline/timelineExtractor';

describe('TimelineExtractor', () => {
  it('imports Legacy df_json periods into normalized timeline entries', () => {
    const dfJson = {
      rows: [
        {
          type: 'Account',
          label: '売上高',
          values: [100, 110, 120, 130, null],
        },
      ],
      periods: ['2020-03', '2021-03', '2022-03', '2023-03', 'EOL'],
    };

    const timeline = extractTimelineFromImportDf(dfJson);

    expect(timeline).toEqual([
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
      {
        period_label: 'FY2022',
        period_type: 'Yearly',
        af_type: 'Actual',
        period_val: '2022-03-31',
        display_order: 3,
      },
      {
        period_label: 'FY2023',
        period_type: 'Yearly',
        af_type: 'Actual',
        period_val: '2023-03-31',
        display_order: 4,
      },
    ]);
  });
});
