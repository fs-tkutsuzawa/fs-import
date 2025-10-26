import type { Hono } from 'hono';
import { logger } from '../logger.ts';
import type { ExistingPeriodRecord } from '../service/timeline/timelineReconciler.ts';

interface RegisterTimelineAdminRoutesOptions {
  ensureTimeline: (params: {
    scenarioId: number;
    importDf?: unknown;
  }) => Promise<ExistingPeriodRecord[]>;
  fetchImportDf: (
    modelId: number
  ) => Promise<{ df_json: Array<Record<string, number>> | unknown }>;
  fetchTimeline: (scenarioId: number) => Promise<ExistingPeriodRecord[]>;
}

export const registerTimelineAdminRoutes = (
  app: Hono,
  {
    ensureTimeline,
    fetchImportDf,
    fetchTimeline,
  }: RegisterTimelineAdminRoutesOptions
) => {
  app.get('/api/v1/admin/timelines/:scenarioId', async (c) => {
    const scenarioId = Number(c.req.param('scenarioId'));
    if (!Number.isFinite(scenarioId) || scenarioId <= 0) {
      return c.json({ error: 'scenarioId を正の数値で指定してください' }, 400);
    }

    try {
      const periods = await fetchTimeline(scenarioId);
      return c.json({ periods });
    } catch (error) {
      logger.error('Failed to fetch timeline periods:', error);
      return c.json(
        {
          error: 'タイムラインの取得に失敗しました',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  });

  app.post('/api/v1/admin/timelines/sync', async (c) => {
    let payload: any;
    try {
      payload = await c.req.json();
    } catch (error) {
      return c.json({ error: 'JSON ボディの解析に失敗しました' }, 400);
    }

    const scenarioId = Number(payload?.scenarioId);
    const modelId = Number(payload?.modelId);

    if (!Number.isFinite(scenarioId) || scenarioId <= 0) {
      return c.json({ error: 'scenarioId を正の数値で指定してください' }, 400);
    }
    if (!Number.isFinite(modelId) || modelId <= 0) {
      return c.json({ error: 'modelId を正の数値で指定してください' }, 400);
    }

    try {
      const importDf = await fetchImportDf(modelId);
      const periods = await ensureTimeline({
        scenarioId,
        importDf: importDf.df_json,
      });
      return c.json({ periods });
    } catch (error) {
      logger.error('Failed to synchronize timeline:', error);
      return c.json(
        {
          error: 'タイムライン同期に失敗しました',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  });
};
