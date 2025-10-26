import pool from '../../api/db';
import type {
  ExistingPeriodRecord,
  UpsertPeriodRecord,
} from './timelineReconciler.ts';

const mapRowToPeriod = (row: any): ExistingPeriodRecord => ({
  id: row.id,
  scenario_id: row.scenario_id,
  period_label: row.period_label,
  period_type: row.period_type,
  af_type: row.af_type,
  period_val: row.period_val,
  display_order: row.display_order,
});

export const fetchByScenario = async (
  scenarioId: number
): Promise<ExistingPeriodRecord[]> => {
  const sql = `
    SELECT id,
           scenario_id,
           period_label,
           period_type,
           af_type,
           period_val,
           display_order
      FROM periods
     WHERE scenario_id = $1
     ORDER BY display_order
  `;
  const result = await pool.query(sql, [scenarioId]);
  return result.rows.map(mapRowToPeriod);
};

export const upsertMany = async (
  records: UpsertPeriodRecord[]
): Promise<ExistingPeriodRecord[]> => {
  if (!records.length) return [];

  const client = await pool.connect();
  try {
    const output: ExistingPeriodRecord[] = [];
    for (const record of records) {
      if (record.id != null) {
        const updateSql = `
          UPDATE periods
             SET period_label = $2,
                 period_type = $3,
                 af_type = $4,
                 period_val = $5,
                 display_order = $6
           WHERE id = $1
             AND scenario_id = $7
         RETURNING id,
                   scenario_id,
                   period_label,
                   period_type,
                   af_type,
                   period_val,
                   display_order
        `;
        const params = [
          record.id,
          record.period_label,
          record.period_type,
          record.af_type,
          record.period_val,
          record.display_order,
          record.scenario_id,
        ];
        const result = await client.query(updateSql, params);
        if (result.rows.length === 0) {
          throw new Error(
            `期間ID ${record.id} を更新できませんでした (scenario_id=${record.scenario_id})`
          );
        }
        output.push(mapRowToPeriod(result.rows[0]));
      } else {
        const insertSql = `
          INSERT INTO periods (
            scenario_id,
            period_label,
            period_type,
            af_type,
            period_val,
            display_order
          ) VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id,
                    scenario_id,
                    period_label,
                    period_type,
                    af_type,
                    period_val,
                    display_order
        `;
        const params = [
          record.scenario_id,
          record.period_label,
          record.period_type,
          record.af_type,
          record.period_val,
          record.display_order,
        ];
        const result = await client.query(insertSql, params);
        output.push(mapRowToPeriod(result.rows[0]));
      }
    }
    return output;
  } finally {
    client.release();
  }
};

export const deleteMany = async (periodIds: number[]): Promise<void> => {
  if (!periodIds.length) return;
  const sql = `
    DELETE FROM periods
     WHERE id = ANY($1::int[])
  `;
  await pool.query(sql, [periodIds]);
};

export const timelineRepository = {
  fetchByScenario,
  upsertMany,
  deleteMany,
};

export type TimelineRepository = typeof timelineRepository;
