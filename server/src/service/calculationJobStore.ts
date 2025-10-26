import { randomUUID } from 'node:crypto';
import type {
  CalculationJobResult,
  CalculationJobRequest,
  CalculationJobSnapshot,
  CalculationJobStore,
  CalculationJobUpdate,
} from '@/model/calculation.js';

const cloneSnapshot = (
  snapshot: CalculationJobSnapshot
): CalculationJobSnapshot => ({
  status: snapshot.status,
  request: { ...snapshot.request },
  requestedAt: new Date(snapshot.requestedAt),
  startedAt: snapshot.startedAt ? new Date(snapshot.startedAt) : undefined,
  completedAt: snapshot.completedAt
    ? new Date(snapshot.completedAt)
    : undefined,
  error: snapshot.error,
  result: snapshot.result ? { ...snapshot.result } : undefined,
});

const ensureJob = (
  jobs: Map<string, CalculationJobSnapshot>,
  jobId: string
): CalculationJobSnapshot => {
  const job = jobs.get(jobId);
  if (!job) {
    throw new Error(`ジョブが見つかりません: ${jobId}`);
  }
  return job;
};

export const createInMemoryJobStore = (): CalculationJobStore & {
  jobs: Map<string, CalculationJobSnapshot>;
} => {
  const jobs = new Map<string, CalculationJobSnapshot>();

  return {
    jobs,

    enqueue(request: CalculationJobRequest): string {
      const jobId = randomUUID();
      const snapshot: CalculationJobSnapshot = {
        status: 'PENDING',
        request,
        requestedAt: new Date(),
      };
      jobs.set(jobId, snapshot);
      return jobId;
    },

    put(jobId: string, snapshot: CalculationJobSnapshot): void {
      jobs.set(jobId, {
        ...snapshot,
        request: { ...snapshot.request },
        requestedAt: new Date(snapshot.requestedAt),
        startedAt: snapshot.startedAt
          ? new Date(snapshot.startedAt)
          : undefined,
        completedAt: snapshot.completedAt
          ? new Date(snapshot.completedAt)
          : undefined,
      });
    },

    update(jobId: string, update: CalculationJobUpdate): void {
      const current = ensureJob(jobs, jobId);
      const next: CalculationJobSnapshot = {
        ...current,
        ...update,
        request: current.request,
        requestedAt: current.requestedAt,
      };
      if (update.startedAt) {
        next.startedAt = new Date(update.startedAt);
      }
      if (update.completedAt) {
        next.completedAt = new Date(update.completedAt);
      }
      jobs.set(jobId, next);
    },

    setResult(jobId: string, result: CalculationJobResult): void {
      const current = ensureJob(jobs, jobId);
      jobs.set(jobId, {
        ...current,
        result: { ...result },
      });
    },

    get(jobId: string): CalculationJobSnapshot | null {
      const snapshot = jobs.get(jobId);
      return snapshot ? cloneSnapshot(snapshot) : null;
    },
  };
};
