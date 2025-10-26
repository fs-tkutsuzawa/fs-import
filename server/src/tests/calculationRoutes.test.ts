import { jest } from '@jest/globals';
import { Hono } from 'hono';
import { registerCalculationRoutes } from '../routes/calculation';
import { createInMemoryJobStore } from '../service/calculationJobStore';
import type { CalculationJobRequest } from '../model/calculation';

const jsonHeaders = {
  'Content-Type': 'application/json',
};

describe('計算APIルート（スケルトン）', () => {
  test('POSTでジョブIDが払い出され、ステータスと結果APIが参照できる', async () => {
    const app = new Hono();
    const jobStore = createInMemoryJobStore();
    const runJob = jest.fn(
      async (_jobId: string, _request: CalculationJobRequest) => {
        return undefined;
      }
    );

    registerCalculationRoutes(app, {
      jobStore,
      runJob,
    });

    const requestPayload = {
      modelId: 1,
      scenarioId: 11,
      projectionYears: 5,
      baseProfitAccountId: '102',
    };

    const postResponse = await app.request('/api/v1/calculations', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(requestPayload),
    });

    expect(postResponse.status).toBe(202);
    const postBody = await postResponse.json();
    expect(typeof postBody.jobId).toBe('string');
    expect(runJob).toHaveBeenCalledWith(postBody.jobId, requestPayload);

    jobStore.update(postBody.jobId, { status: 'RUNNING' });

    const statusResponse = await app.request(
      `/api/v1/calculations/status/${postBody.jobId}`
    );
    expect(statusResponse.status).toBe(200);
    const statusBody = await statusResponse.json();
    expect(statusBody.status).toBe('RUNNING');

    jobStore.update(postBody.jobId, { status: 'COMPLETED' });
    jobStore.setResult(postBody.jobId, {
      metadata: { jobId: postBody.jobId },
      financialData: [],
    });

    const resultResponse = await app.request(
      `/api/v1/calculations/results/${postBody.jobId}`
    );
    expect(resultResponse.status).toBe(200);
    const resultBody = await resultResponse.json();
    expect(resultBody.metadata.jobId).toBe(postBody.jobId);
    expect(Array.isArray(resultBody.financialData)).toBe(true);
  });

  test('存在しないジョブIDは404を返す', async () => {
    const app = new Hono();
    registerCalculationRoutes(app, {
      jobStore: createInMemoryJobStore(),
      runJob: jest.fn(
        async (_jobId: string, _request: CalculationJobRequest) => {
          return undefined;
        }
      ),
    });

    const statusResponse = await app.request(
      '/api/v1/calculations/status/missing'
    );
    expect(statusResponse.status).toBe(404);

    const resultResponse = await app.request(
      '/api/v1/calculations/results/missing'
    );
    expect(resultResponse.status).toBe(404);
  });
});
