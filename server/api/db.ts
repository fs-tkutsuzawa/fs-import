import dotenv from 'dotenv';
dotenv.config();

import pkg from 'pg';
const { Pool } = pkg;

const sslOption = process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : undefined;

const dbConfig = {
  user: process.env.POSTGRES_USER || 'finmodel',
  password: process.env.POSTGRES_PASSWORD || 'finmodel123',
  host: process.env.POSTGRES_HOST || 'postgres',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  database: process.env.POSTGRES_DB || 'financial_model',
  ssl: sslOption,
};
const pool = new Pool(dbConfig);

export default pool;
