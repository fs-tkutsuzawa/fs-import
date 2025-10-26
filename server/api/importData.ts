import pool from './db.ts';
import { logger } from '../src/logger.ts';

// Save imported JSON data to import_df table
export const saveImportData = async (modelId, jsonData) => {
  logger.log('=== saveImportData called ===');
  logger.log('Model ID:', modelId);
  logger.log('JSON Data:', JSON.stringify(jsonData, null, 2));

  if (!modelId || !jsonData) {
    throw new Error('modelId and jsonData are required');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check if model exists
    const modelCheckQuery = 'SELECT id FROM models WHERE id = $1';
    const modelResult = await client.query(modelCheckQuery, [modelId]);

    if (modelResult.rows.length === 0) {
      throw new Error(`Model with ID ${modelId} not found`);
    }

    // Delete existing import data for this model
    await client.query('DELETE FROM import_df WHERE id = $1', [modelId]);
    logger.log(`Cleared existing import data for model ${modelId}`);

    // Insert new import data
    const insertQuery = `
      INSERT INTO import_df (model_id, df_json)
      VALUES ($1, $2)
      RETURNING *
    `;

    const values = [modelId, JSON.stringify(jsonData)];
    const result = await client.query(insertQuery, values);

    await client.query('COMMIT');
    logger.log(
      `Successfully saved import data with ID: ${result.rows[0].import_df_id}`
    );

    return {
      success: true,
      message: 'Import data saved successfully',
      importData: result.rows[0],
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error saving import data:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Get import data for a model
export const getImportData = async (modelId) => {
  logger.log('=== getImportData called ===');
  logger.log('Model ID:', modelId);

  if (!modelId) {
    throw new Error('modelId is required');
  }

  try {
    const query = `
      SELECT * FROM import_df 
      WHERE model_id = $1 
      ORDER BY created_at DESC 
      LIMIT 1
    `;

    const result = await pool.query(query, [modelId]);

    if (result.rows.length === 0) {
      return {
        success: true,
        message: 'No import data found for this model',
        importData: null,
      };
    }

    logger.log(`Retrieved import data for model ${modelId}`);

    return {
      success: true,
      importData: result.rows[0],
    };
  } catch (error) {
    logger.error('Error fetching import data:', error);
    throw error;
  }
};

// Get all import data
export const getAllImportData = async () => {
  logger.log('=== getAllImportData called ===');

  try {
    const query = `
      SELECT 
        id.id,
        id.model_id,
        id.df_json,
        id.created_at,
        id.updated_at,
        m.model_name,
        p.project_name,
        c.company_name
      FROM import_df id
      LEFT JOIN models m ON id.model_id = m.id
      LEFT JOIN projects p ON m.project_id = p.project_id
      LEFT JOIN companies c ON p.company_id = c.company_id
      ORDER BY id.created_at DESC
    `;

    const result = await pool.query(query);

    logger.log(`Retrieved ${result.rows.length} import data records`);

    return {
      success: true,
      importData: result.rows,
    };
  } catch (error) {
    logger.error('Error fetching all import data:', error);
    throw error;
  }
};

// Delete import data
export const deleteImportData = async (importDataId) => {
  logger.log('=== deleteImportData called ===');
  logger.log('Import Data ID:', importDataId);

  if (!importDataId) {
    throw new Error('importDataId is required');
  }

  try {
    const query = 'DELETE FROM import_df WHERE import_df_id = $1 RETURNING *';
    const result = await pool.query(query, [importDataId]);

    if (result.rows.length === 0) {
      throw new Error('Import data not found');
    }

    logger.log(`Deleted import data ID: ${result.rows[0].import_df_id}`);

    return {
      success: true,
      message: 'Import data deleted successfully',
      importData: result.rows[0],
    };
  } catch (error) {
    logger.error('Error deleting import data:', error);
    throw error;
  }
};
