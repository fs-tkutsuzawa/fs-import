export type CalculationJobStatus =
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

export interface CalculationJobSnapshot {
  status: CalculationJobStatus;
  request: CalculationJobRequest;
  requestedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  result?: CalculationJobResult;
}

export type CalculationJobUpdate = Partial<
  Omit<CalculationJobSnapshot, 'request' | 'requestedAt'>
> & {
  status?: CalculationJobStatus;
};

export interface CalculationJobStore {
  enqueue(request: CalculationJobRequest): string;
  put(jobId: string, snapshot: CalculationJobSnapshot): void;
  update(jobId: string, update: CalculationJobUpdate): void;
  setResult(jobId: string, result: CalculationJobResult): void;
  get(jobId: string): CalculationJobSnapshot | null;
}
