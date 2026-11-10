import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { CONFIG } from './config';
import { db, initDb } from './db';
import { OrderQueue } from './queue';

initDb();
OrderQueue.start();

export const app = express();

app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    }
  })
);

export function verifyShopHmac(rawBody: Buffer | undefined, headerHmac: string | undefined): boolean {
  if (!rawBody || !headerHmac) return false;
  const calculated = crypto
    .createHmac('sha256', CONFIG.webhookSecret)
    .update(rawBody)
    .digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(calculated), Buffer.from(headerHmac));
  } catch {
    return false;
  }
}

app.post('/webhooks/orders-create', (req: Request, res: Response): any => {
  const hmacHeader = req.headers['x-shop-hmac-sha256'] as string;
  const webhookId = req.headers['x-shop-webhook-id'] as string;

  // 1. Signature Verification
  if (!verifyShopHmac((req as any).rawBody, hmacHeader)) {
    return res.status(401).json({ error: 'Unauthorized: Invalid HMAC signature' });
  }

  const { id: orderId, shipping_address, line_items } = req.body;
  if (!orderId) {
    return res.status(400).json({ error: 'Missing order id' });
  }

  // 2. Idempotency Check (Webhook ID & Order ID)
  if (webhookId) {
    const existingWebhook = db
      .prepare('SELECT webhook_id FROM processed_webhooks WHERE webhook_id = ?')
      .get(webhookId);
    if (existingWebhook) {
      return res.status(200).json({ status: 'ignored', message: 'Webhook already processed' });
    }
  }

  const existingOrder = db.prepare('SELECT order_id, status FROM orders WHERE order_id = ?').get(String(orderId));
  if (existingOrder) {
    return res.status(200).json({ status: 'acknowledged', message: 'Order already recorded' });
  }

  // 3. Atomic Ingestion
  const insertTx = db.transaction(() => {
    if (webhookId) {
      db.prepare('INSERT INTO processed_webhooks (webhook_id) VALUES (?)').run(webhookId);
    }
    db.prepare(
      `INSERT INTO orders (order_id, address, items, status, next_retry_at) 
       VALUES (?, ?, ?, 'PENDING', ?)`
    ).run(
      String(orderId),
      JSON.stringify(shipping_address || {}),
      JSON.stringify(line_items || []),
      Date.now()
    );
  });

  insertTx();

  // 4. Fast Ack under 1s
  return res.status(202).json({
    status: 'accepted',
    orderId,
    message: 'Order queued for background courier dispatch'
  });
});

// Dead letter inspection & manual replay endpoint
app.get('/dead-letter', (_req: Request, res: Response) => {
  const deadJobs = db.prepare('SELECT * FROM dead_letter_jobs').all();
  res.json(deadJobs);
});

app.post('/dead-letter/:orderId/replay', (req: Request, res: Response): any => {
  const { orderId } = req.params;
  const job = db.prepare('SELECT * FROM dead_letter_jobs WHERE order_id = ?').get(orderId);
  if (!job) return res.status(404).json({ error: 'Dead-letter job not found' });

  db.transaction(() => {
    db.prepare('DELETE FROM dead_letter_jobs WHERE order_id = ?').run(orderId);
    db.prepare(`UPDATE orders SET status = 'PENDING', attempts = 0, next_retry_at = ? WHERE order_id = ?`).run(
      Date.now(),
      orderId
    );
  })();

  return res.json({ status: 'requeued', orderId });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(CONFIG.port, () => {
    console.log(`Integration service listening on port ${CONFIG.port}`);
  });
}
