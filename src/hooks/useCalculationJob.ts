import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiUrl } from '../config/api';

export type CalculationJobStatus =
  | 'IDLE'
  | 'REQUESTING'
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED';

export interface CalculationJobRequest {
  modelId: number;
  scenarioId: number;
  projectionYears: number;
  baseProfitAccountId?: string;
}

export interface CalculationJobResult {
  metadata: Record<string, unknown>;
  financialData: Array<Record<string, unknown>>;
}

interface UseCalculationJobOptions {
  pollIntervalMs?: number;
  maxPollCount?: number;
}

interface CalculationStatusResponse {
  status: CalculationJobStatus | 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  error?: string;
}

const DEFAULT_POLL_INTERVAL = 2000;
const DEFAULT_MAX_POLL_COUNT = 60;

export const useCalculationJob = (options?: UseCalculationJobOptions) => {
  const pollIntervalMs = options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL;
  const maxPollCount = options?.maxPollCount ?? DEFAULT_MAX_POLL_COUNT;

  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<CalculationJobStatus>('IDLE');
  const [data, setData] = useState<CalculationJobResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const attemptsRef = useRef(0);
  const pollingRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearTimer();
    setJobId(null);
    setStatus('IDLE');
    setData(null);
    setError(null);
    setIsLoading(false);
  }, [clearTimer]);

  const fetchResult = useCallback(
    async (currentJobId: string) => {
      const response = await fetch(
        getApiUrl(`/api/v1/calculations/results/${currentJobId}`)
      );
      if (!response.ok) {
        throw new Error('計算結果の取得に失敗しました');
      }
      const payload = (await response.json()) as CalculationJobResult;
      setData(payload);
      setStatus('COMPLETED');
      setIsLoading(false);
      clearTimer();
      return payload;
    },
    [clearTimer]
  );

  const pollStatus = useCallback(
    async (currentJobId: string) => {
      const response = await fetch(
        getApiUrl(`/api/v1/calculations/status/${currentJobId}`)
      );
      if (!response.ok) {
        throw new Error('計算ステータスの取得に失敗しました');
      }
      const payload = (await response.json()) as CalculationStatusResponse;
      const nextStatus = payload.status as CalculationJobStatus;
      setStatus(nextStatus);

      if (nextStatus === 'COMPLETED') {
        await fetchResult(currentJobId);
        return true;
      }
      if (nextStatus === 'FAILED') {
        setError(payload.error ?? '計算が失敗しました');
        setIsLoading(false);
        clearTimer();
        return true;
      }
      return false;
    },
    [clearTimer, fetchResult]
  );

  const startPolling = useCallback(
    (currentJobId: string) => {
      attemptsRef.current = 0;
      clearTimer();
      timerRef.current = setInterval(async () => {
        if (pollingRef.current) return;
        pollingRef.current = true;
        attemptsRef.current += 1;

        try {
          const finished = await pollStatus(currentJobId);
          if (finished) {
            pollingRef.current = false;
            return;
          }
          if (attemptsRef.current >= maxPollCount) {
            setError('計算がタイムアウトしました');
            setStatus('FAILED');
            setIsLoading(false);
            clearTimer();
          }
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : '計算ステータス取得でエラーが発生しました'
          );
          setStatus('FAILED');
          setIsLoading(false);
          clearTimer();
        } finally {
          pollingRef.current = false;
        }
      }, pollIntervalMs);
    },
    [clearTimer, maxPollCount, pollIntervalMs, pollStatus]
  );

  const startCalculation = useCallback(
    async (payload: CalculationJobRequest) => {
      try {
        clearTimer();
        setError(null);
        setData(null);
        setIsLoading(true);
        setStatus('REQUESTING');

        const response = await fetch(getApiUrl('/api/v1/calculations'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const message = '計算ジョブの作成に失敗しました';
          throw new Error(message);
        }

        const body = (await response.json()) as { jobId: string };
        const newJobId = body.jobId;
        if (!newJobId) {
          throw new Error('ジョブIDが取得できませんでした');
        }

        setJobId(newJobId);
        setStatus('PENDING');

        const finishedImmediately = await pollStatus(newJobId);
        if (!finishedImmediately) {
          startPolling(newJobId);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : '計算ジョブの開始に失敗しました';
        setError(message);
        setStatus('FAILED');
        setIsLoading(false);
        clearTimer();
      }
    },
    [clearTimer, pollStatus, startPolling]
  );

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  return {
    jobId,
    status,
    data,
    error,
    isLoading,
    startCalculation,
    reset,
  } as const;
};
