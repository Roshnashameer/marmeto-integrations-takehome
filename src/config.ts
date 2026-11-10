import dotenv from 'dotenv';
dotenv.config();

export const CONFIG = {
  port: parseInt(process.env.PORT || '3000', 10),
  courierBaseUrl: process.env.COURIER_BASE_URL || 'http://localhost:4000',
  webhookSecret: process.env.WEBHOOK_SECRET || 'shh_marmeto_secret_key_123',
  dbPath: process.env.DB_PATH || 'marmeto.sqlite',
  maxRetries: parseInt(process.env.MAX_RETRIES || '4', 10),
  courierTimeoutMs: 3500 // Cut off before hanging 10s
};
