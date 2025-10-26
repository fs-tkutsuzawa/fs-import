import { randomUUID } from 'node:crypto';
import { createInMemoryJobStore } from '../service/calculationJobStore';

describe('計算ジョブストア（メモリ実装）', () => {
  test('新規ジョブ作成時にPENDING状態で登録される', () => {
    const store = createInMemoryJobStore();
    const jobId = store.enqueue({
      modelId: 1,
      scenarioId: 11,
      projectionYears: 5,
      baseProfitAccountId: '102',
    });

    const snapshot = store.get(jobId);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.status).toBe('PENDING');
    expect(snapshot?.requestedAt).toBeInstanceOf(Date);
  });

  test('ステータスと結果、エラーを更新できる', () => {
    const store = createInMemoryJobStore();
    const jobId = randomUUID();

    store.put(jobId, {
      status: 'RUNNING',
      requestedAt: new Date('2025-01-01T00:00:00Z'),
      request: {
        modelId: 1,
        scenarioId: 11,
        projectionYears: 3,
      },
    });

    store.update(jobId, { status: 'COMPLETED', completedAt: new Date() });
    store.setResult(jobId, {
      metadata: { jobId },
      financialData: [],
    });

    const snapshot = store.get(jobId);
    expect(snapshot?.status).toBe('COMPLETED');
    expect(snapshot?.result).toEqual({
      metadata: { jobId },
      financialData: [],
    });

    store.update(jobId, { status: 'FAILED', error: '計算エラー' });
    const failed = store.get(jobId);
    expect(failed?.status).toBe('FAILED');
    expect(failed?.error).toBe('計算エラー');
  });

  test('存在しないジョブ操作は例外を投げる', () => {
    const store = createInMemoryJobStore();
    const missing = () => store.update('missing', { status: 'COMPLETED' });
    expect(missing).toThrow('ジョブが見つかりません: missing');
  });
});
