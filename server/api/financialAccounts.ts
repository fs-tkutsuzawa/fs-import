import pool from './db.ts';

export const getFinancialAccounts = async () => {
  try {
    const result = await pool.query(`
            SELECT 
                id,
                fs_type,
                ga_name,
                ga_code,
                ga_type,
                is_credit,
                parent_ga_id,
                sort_num,
                indent_num
            FROM global_accounts 
            ORDER BY fs_type, sort_num
        `);
    return result.rows;
  } catch (error) {
    console.error('Error fetching financial accounts:', error);
    throw error;
  }
};

export const updateFinancialAccountName = async (
  id: string,
  newName: string
) => {
  try {
    const result = await pool.query(
      'UPDATE global_accounts SET ga_name = $1 WHERE id = $2 RETURNING *',
      [newName, id]
    );
    return result.rows[0];
  } catch (error) {
    console.error(`Error updating financial account name for id ${id}:`, error);
    throw error;
  }
};

// UAD-008: Get all distinct fs_types
export const getAllFsTypes = async () => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT fs_type
      FROM global_accounts
      ORDER BY fs_type
    `);
    return result.rows.map((row) => row.fs_type);
  } catch (error) {
    console.error('Error fetching fs_types:', error);
    throw error;
  }
};

// UAD-008: Get GA names (集約科目) for a given fs_type
export const getGlobalAccountsByFsType = async (fsType: string) => {
  try {
    const result = await pool.query(
      `
      SELECT
        id,
        ga_name,
        ga_code,
        ga_type,
        fs_type
      FROM global_accounts
      WHERE fs_type = $1
      ORDER BY sort_num
    `,
      [fsType]
    );
    return result.rows;
  } catch (error) {
    console.error(
      `Error fetching global accounts for fs_type ${fsType}:`,
      error
    );
    throw error;
  }
};
