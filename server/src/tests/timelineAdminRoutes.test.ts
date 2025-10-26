import { jest } from '@jest/globals';
import { Hono } from 'hono';
import { registerTimelineAdminRoutes } from '../routes/timelineAdmin';
import type { ExistingPeriodRecord } from '../service/timeline/timelineReconciler';

const createApp = (deps: {
  ensureTimeline: ReturnType<typeof jest.fn>;
  fetchImportDf: ReturnType<typeof jest.fn>;
  fetchTimeline: ReturnType<typeof jest.fn>;
}) => {
  const app = new Hono();
  registerTimelineAdminRoutes(app, deps);
  return app;
};

describe('timeline admin routes', () => {
  const periods: ExistingPeriodRecord[] = [
    {
      id: 1,
      scenario_id: 42,
      period_label: 'FY2023',
      period_type: 'Yearly',
      af_type: 'Actual',
      period_val: '2023-12-31',
      display_order: 1,
    },
  ];

  it('returns 400 when scenarioId is invalid', async () => {
    const app = createApp({
      ensureTimeline: jest.fn(),
      fetchImportDf: jest.fn(),
      fetchTimeline: jest.fn(),
    });

    const res = await app.request('/api/v1/admin/timelines/not-a-number');
    expect(res.status).toBe(400);
  });

  it('returns current periods for a scenario', async () => {
    const fetchTimeline = jest.fn(async () => periods);
    const app = createApp({
      ensureTimeline: jest.fn(),
      fetchImportDf: jest.fn(),
      fetchTimeline,
    });

    const res = await app.request('/api/v1/admin/timelines/42');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.periods).toEqual(periods);
    expect(fetchTimeline).toHaveBeenCalledWith(42);
  });

  it('validates POST payload and synchronizes timeline', async () => {
    const ensureTimeline = jest.fn(async () => periods);
    const fetchImportDf = jest.fn(async () => ({ df_json: {} }));
    const fetchTimeline = jest.fn(async () => periods);
    const app = createApp({ ensureTimeline, fetchImportDf, fetchTimeline });

    const res = await app.request('/api/v1/admin/timelines/sync', {
      method: 'POST',
      body: JSON.stringify({ scenarioId: 42, modelId: 7 }),
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.periods).toEqual(periods);
    expect(fetchImportDf).toHaveBeenCalledWith(7);
    expect(ensureTimeline).toHaveBeenCalledWith({
      scenarioId: 42,
      importDf: {},
    });
  });

  it('returns 500 when synchronization fails', async () => {
    const ensureTimeline = jest.fn(async () => {
      throw new Error('sync failed');
    });
    const fetchImportDf = jest.fn(async () => ({ df_json: {} }));
    const app = createApp({
      ensureTimeline,
      fetchImportDf,
      fetchTimeline: jest.fn(async () => periods),
    });

    const res = await app.request('/api/v1/admin/timelines/sync', {
      method: 'POST',
      body: JSON.stringify({ scenarioId: 42, modelId: 7 }),
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status).toBe(500);
  });
});
