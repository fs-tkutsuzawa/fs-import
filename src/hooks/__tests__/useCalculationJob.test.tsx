import { renderHook, act } from '@testing-library/react';
import {
  jest,
  describe,
  test,
  beforeEach,
  afterEach,
  expect,
} from '@jest/globals';
import { useCalculationJob } from '../useCalculationJob';

jest.mock('../../config/api', () => ({
  getApiUrl: (endpoint: string) => endpoint,
}));

const flushPromises = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

describe('useCalculationJob', () => {
  let fetchMock: ReturnType<typeof jest.fn>;

  beforeEach(() => {
    jest.useFakeTimers();
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetAllMocks();
  });

  const mockFetchSequence = (responses: Array<Record<string, unknown>>) => {
    fetchMock.mockImplementation(() => {
      const payload = responses.shift();
      if (!payload) {
        return Promise.reject(new Error('unexpected fetch call'));
      }
      const { ok = true, status = 200, json } = payload as any;
      return Promise.resolve({
        ok,
        status,
        json: json || (async () => payload.body),
      });
    });
  };

  test('計算ジョブが完了すると結果が保持される', async () => {
    mockFetchSequence([
      {
        body: { jobId: 'job-1' },
      },
      {
        body: { status: 'RUNNING' },
      },
      {
        body: { status: 'COMPLETED' },
      },
      {
        body: {
          metadata: { modelId: 1, scenarioId: 11, currency: 'JPY' },
          financialData: [{ ua_id: 101, period_label: 'FY2023', value: 100 }],
        },
      },
    ]);

    const { result } = renderHook(() =>
      useCalculationJob({ pollIntervalMs: 100, maxPollCount: 5 })
    );

    await act(async () => {
      await result.current.startCalculation({
        modelId: 1,
        scenarioId: 11,
        projectionYears: 2,
      });
    });

    await flushPromises();

    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    await flushPromises();

    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result.current.status).toBe('COMPLETED');
    expect(result.current.data?.financialData).toHaveLength(1);
    expect(result.current.isLoading).toBe(false);
  });

  test('FAILED ステータスを受信した場合はエラー状態になる', async () => {
    mockFetchSequence([
      {
        body: { jobId: 'job-2' },
      },
      {
        body: { status: 'FAILED', error: '計算失敗' },
      },
    ]);

    const { result } = renderHook(() =>
      useCalculationJob({ pollIntervalMs: 100, maxPollCount: 2 })
    );

    await act(async () => {
      await result.current.startCalculation({
        modelId: 1,
        scenarioId: 22,
        projectionYears: 1,
      });
    });

    await flushPromises();

    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    await flushPromises();

    expect(result.current.status).toBe('FAILED');
    expect(result.current.error).toBe('計算失敗');
    expect(result.current.isLoading).toBe(false);
  });
});
