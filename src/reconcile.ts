import { db, initDb } from './db';
import { CourierClient } from './courier-client';
import { OrderQueue } from './queue';

initDb();

export async function runReconciliation() {
  console.log('[Reconciliation] Running sweep for unconfirmed orders...');
  const unconfirmedOrders = db
    .prepare(`SELECT * FROM orders WHERE status IN ('PENDING', 'PROCESSING', 'FAILED')`)
    .all() as any[];

  console.log(`[Reconciliation] Found ${unconfirmedOrders.length} unconfirmed order(s).`);

  for (const order of unconfirmedOrders) {
    console.log(`[Reconciliation] Auditing order: ${order.order_id}`);
    
    // Step 1: Safely check if mock courier actually has the shipment (handles timeout after creation)
    const existing = await CourierClient.checkExistingShipment(order.order_id);
    if (existing) {
      console.log(`[Reconciliation] Found upstream shipment ${existing.id} for order ${order.order_id}. Resolving.`);
      db.prepare(
        `UPDATE orders 
         SET status = 'CONFIRMED', shipment_id = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE order_id = ?`
      ).run(existing.id, order.order_id);
      db.prepare('DELETE FROM dead_letter_jobs WHERE order_id = ?').run(order.order_id);
      continue;
    }

    // Step 2: Courier has no record; safely trigger worker retry
    console.log(`[Reconciliation] Upstream has no record. Triggering retry for ${order.order_id}`);
    await OrderQueue.processOrder(order);
  }

  console.log('[Reconciliation] Sweep completed.');
}

if (require.main === module) {
  runReconciliation()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
