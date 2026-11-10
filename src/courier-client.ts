import { CONFIG } from './config';

export interface CourierShipment {
  id: string;
  reference: string;
}

export class CourierClient {
  static async checkExistingShipment(reference: string): Promise<CourierShipment | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.courierTimeoutMs);

    try {
      const res = await fetch(`${CONFIG.courierBaseUrl}/shipments?reference=${encodeURIComponent(reference)}`, {
        signal: controller.signal
      });
      if (!res.ok) return null;
      const data = (await res.json()) as CourierShipment[];
      if (Array.isArray(data) && data.length > 0) {
        return data[0];
      }
      return null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  static async createShipment(order: { reference: string; address: string; items: string }): Promise<{
    success: boolean;
    shipmentId?: string;
    retryAfterSeconds?: number;
    error?: string;
  }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.courierTimeoutMs);

    try {
      const res = await fetch(`${CONFIG.courierBaseUrl}/shipments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference: order.reference,
          address: JSON.parse(order.address),
          items: JSON.parse(order.items)
        }),
        signal: controller.signal
      });

      if (res.status === 201) {
        const body = (await res.json()) as { shipmentId: string };
        return { success: true, shipmentId: body.shipmentId };
      }

      if (res.status === 429) {
        const retryHeader = res.headers.get('retry-after');
        const retryAfterSeconds = retryHeader ? parseInt(retryHeader, 10) : 2;
        return { success: false, retryAfterSeconds, error: 'Rate limit hit (429)' };
      }

      const errText = await res.text();
      return { success: false, error: `Upstream error ${res.status}: ${errText}` };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { success: false, error: 'Request timeout after 3500ms' };
      }
      return { success: false, error: err.message || 'Network error' };
    } finally {
      clearTimeout(timeout);
    }
  }
}
