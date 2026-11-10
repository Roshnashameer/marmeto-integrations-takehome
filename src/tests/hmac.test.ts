import request from 'supertest';
import crypto from 'crypto';
import { app } from '../index';
import { CONFIG } from '../config';

describe('HMAC Verification Suite', () => {
  const orderId = `ord_test_${crypto.randomUUID()}`;
  const payload = {
    id: orderId,
    shipping_address: { city: 'Trivandrum', zip: '695001' },
    line_items: [{ sku: 'SKU-A', qty: 1 }]
  };
  const bodyString = JSON.stringify(payload);

  it('rejects requests with missing HMAC signature', async () => {
    const res = await request(app)
      .post('/webhooks/orders-create')
      .set('Content-Type', 'application/json')
      .send(bodyString);
    expect(res.status).toBe(401);
  });

  it('rejects requests with invalid HMAC signature', async () => {
    const res = await request(app)
      .post('/webhooks/orders-create')
      .set('Content-Type', 'application/json')
      .set('X-Shop-Hmac-Sha256', 'invalid_signature_base64')
      .send(bodyString);
    expect(res.status).toBe(401);
  });

  it('accepts correctly signed requests and returns 202', async () => {
    const validHmac = crypto
      .createHmac('sha256', CONFIG.webhookSecret)
      .update(bodyString)
      .digest('base64');

    const res = await request(app)
      .post('/webhooks/orders-create')
      .set('Content-Type', 'application/json')
      .set('X-Shop-Hmac-Sha256', validHmac)
      .set('X-Shop-Webhook-Id', `wh_test_${crypto.randomUUID()}`)
      .send(bodyString);

    expect(res.status).toBe(202);
    expect(res.body.status).toBe('accepted');
  });
});
