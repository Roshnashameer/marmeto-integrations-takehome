import request from 'supertest';
import crypto from 'crypto';
import { app } from '../index';
import { CONFIG } from '../config';

describe('Idempotency Suite', () => {
  const orderId = 'ord_idem_' + Math.random().toString(36).substring(2, 7);
  const payload = { id: orderId, shipping_address: { city: 'Kochi' }, line_items: [] };
  const rawBody = JSON.stringify(payload);
  const validHmac = crypto.createHmac('sha256', CONFIG.webhookSecret).update(rawBody).digest('base64');
  const webhookId = 'wh_idem_' + Math.random().toString(36).substring(2, 7);

  it('accepts first webhook and suppresses duplicate delivery without error', async () => {
    const res1 = await request(app)
      .post('/webhooks/orders-create')
      .set('Content-Type', 'application/json')
      .set('X-Shop-Hmac-Sha256', validHmac)
      .set('X-Shop-Webhook-Id', webhookId)
      .send(rawBody);

    expect(res1.status).toBe(202);

    // Duplicate webhook delivery with same webhook ID
    const res2 = await request(app)
      .post('/webhooks/orders-create')
      .set('Content-Type', 'application/json')
      .set('X-Shop-Hmac-Sha256', validHmac)
      .set('X-Shop-Webhook-Id', webhookId)
      .send(rawBody);

    expect(res2.status).toBe(200);
    expect(res2.body.status).toBe('ignored');
  });
});
