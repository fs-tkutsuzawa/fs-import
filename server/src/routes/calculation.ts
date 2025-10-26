import type { Hono } from 'hono';
import type {
  CalculationJobRequest,
  CalculationJobSnapshot,
  CalculationJobStore,
} from '@/model/calculation.js';

interface RegisterCalculationRoutesOptions {
  jobStore: CalculationJobStore;
  runJob: (
    jobId: string,
    request: CalculationJobRequest
  ) => void | Promise<void>;
}

const parseRequest = async (req: Request): Promise<CalculationJobRequest> => {
  const body = await req.json();

  const modelId = Number(body.modelId);
  const scenarioId = Number(body.scenarioId);
  const projectionYears = Number(body.projectionYears);
  const baseProfitAccountId = body.baseProfitAccountId
    ? String(body.baseProfitAccountId)
    : undefined;

  if (!Number.isFinite(modelId) || modelId <= 0) {
    throw new Error('modelId は正の数値で指定してください');
  }
  if (!Number.isFinite(scenarioId) || scenarioId <= 0) {
    throw new Error('scenarioId は正の数値で指定してください');
  }
  if (!Number.isFinite(projectionYears) || projectionYears <= 0) {
    throw new Error('projectionYears は正の数値で指定してください');
  }

  return {
    modelId,
    scenarioId,
    projectionYears,
    baseProfitAccountId,
  };
};

const notFound = (message: string) =>
  new Response(JSON.stringify({ error: message }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });

const jobToStatusPayload = (job: CalculationJobSnapshot) => ({
  status: job.status,
  requestedAt: job.requestedAt.toISOString(),
  startedAt: job.startedAt?.toISOString() ?? null,
  completedAt: job.completedAt?.toISOString() ?? null,
  error: job.error ?? null,
});

export const registerCalculationRoutes = (
  app: Hono,
  options: RegisterCalculationRoutesOptions
) => {
  app.post('/api/v1/calculations', async (c) => {
    let request: CalculationJobRequest;
    try {
      request = await parseRequest(c.req.raw);
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : 'リクエストの解析に失敗しました',
        },
        400
      );
    }

    const jobId = options.jobStore.enqueue(request);

    Promise.resolve(options.runJob(jobId, request)).catch((error) => {
      options.jobStore.update(jobId, {
        status: 'FAILED',
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date(),
      });
    });

    return c.json({ jobId }, 202);
  });

  app.get('/api/v1/calculations/status/:jobId', (c) => {
    const jobId = c.req.param('jobId');
    const job = options.jobStore.get(jobId);
    if (!job) {
      return notFound('指定したジョブIDは存在しません');
    }
    return c.json(jobToStatusPayload(job));
  });

  app.get('/api/v1/calculations/results/:jobId', (c) => {
    const jobId = c.req.param('jobId');
    const job = options.jobStore.get(jobId);
    if (!job) {
      return notFound('指定したジョブIDは存在しません');
    }
    if (!job.result) {
      return notFound('計算がまだ完了していません');
    }
    return c.json(job.result);
  });
};
