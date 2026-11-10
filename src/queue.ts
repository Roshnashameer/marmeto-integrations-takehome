import { db } from './db';
import { CONFIG } from './config';
import { CourierClient } from './courier-client';

export class OrderQueue {
  private static running = false;
  private static intervalHandle: NodeJS.Timeout | null = null;

  static start() {
    if (this.running) return;
    this.running = true;
    this.intervalHandle = setInterval(() => this.processNextBatch(), 1000);
  }

  static stop() {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
    this.running = false;
  }

  static async processNextBatch() {
    const now = Date.now();
    const readyOrders = db
      .prepare(
        `SELECT * FROM orders 
         WHERE status IN ('PENDING', 'PROCESSING') 
         AND next_retry_at <= ? 
         LIMIT 5`
      )
      .all(now) as any[];

    for (const order of readyOrders) {
      await this.processOrder(order);
    }
  }

  static async processOrder(order: any) {
    // 1. Guard against non-idempotent courier duplicates: inspect GET /shipments first
    const existing = await CourierClient.checkExistingShipment(order.order_id);
    if (existing) {
      db.prepare(
        `UPDATE orders 
         SET status = 'CONFIRMED', shipment_id = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE order_id = ?`
      ).run(existing.id, order.order_id);
      return;
    }

    // 2. Dispatch to mock courier
    const result = await CourierClient.createShipment({
      reference: order.order_id,
      address: order.address,
      items: order.items
    });

    if (result.success && result.shipmentId) {
      db.prepare(
        `UPDATE orders 
         SET status = 'CONFIRMED', shipment_id = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE order_id = ?`
      ).run(result.shipmentId, order.order_id);
      return;
    }

    // 3. Handle failure / backoff / dead-letter
    const nextAttempts = order.attempts + 1;
    if (nextAttempts >= CONFIG.maxRetries) {
      db.transaction(() => {
        db.prepare(
          `UPDATE orders 
           SET status = 'FAILED', attempts = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP 
           WHERE order_id = ?`
        ).run(nextAttempts, result.error || 'Max retries exhausted', order.order_id);

        db.prepare(
          `INSERT OR REPLACE INTO dead_letter_jobs (order_id, last_error, attempts) 
           VALUES (?, ?, ?)`
        ).run(order.order_id, result.error || 'Max retries exhausted', nextAttempts);
      })();
      return;
    }

    const backoffSeconds = result.retryAfterSeconds ?? Math.pow(2, nextAttempts);
    const nextRetryAt = Date.now() + backoffSeconds * 1000;

    db.prepare(
      `UPDATE orders 
       SET status = 'PROCESSING', attempts = ?, next_retry_at = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE order_id = ?`
    ).run(nextAttempts, nextRetryAt, result.error, order.order_id);
  }
}
