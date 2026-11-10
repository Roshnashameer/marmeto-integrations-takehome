import { db } from '../db';
import { CourierClient } from '../courier-client';
import { runReconciliation } from '../reconcile';

jest.mock('../courier-client');

describe('Reconciliation Suite', () => {
  const orderId = 'ord_timeout_test';

  beforeEach(() => {
    (CourierClient.createShipment as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Test courier failure'
    });
    db.prepare(`DELETE FROM orders WHERE order_id = ?`).run(orderId);
    db.prepare(`DELETE FROM dead_letter_jobs WHERE order_id = ?`).run(orderId);
  });

  it('safely confirms orders where mock courier created shipment before hanging', async () => {
    db.prepare(
      `INSERT INTO orders (order_id, address, items, status) VALUES (?, '{}', '[]', 'PROCESSING')`
    ).run(orderId);

    // Simulate courier having created shipment upstream
    (CourierClient.checkExistingShipment as jest.Mock).mockImplementation(async (reference: string) =>
      reference === orderId ? { id: 'shp_reconciled_99', reference: orderId } : null
    );

    await runReconciliation();

    const updated = db.prepare('SELECT status, shipment_id FROM orders WHERE order_id = ?').get(orderId) as any;
    expect(updated.status).toBe('CONFIRMED');
    expect(updated.shipment_id).toBe('shp_reconciled_99');
  });
});
