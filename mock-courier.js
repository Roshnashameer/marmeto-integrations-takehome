const http = require('http');
const url = require('url');

const PORT = process.env.COURIER_PORT || 4000;
const inMemoryShipments = []; // { id, reference, address, items, createdAt }

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);

  if (req.method === 'GET' && parsedUrl.pathname === '/shipments') {
    const reference = parsedUrl.query.reference;
    const matches = reference
      ? inMemoryShipments.filter((s) => s.reference === reference)
      : inMemoryShipments;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(matches));
  }

  if (req.method === 'POST' && parsedUrl.pathname === '/shipments') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const roll = Math.random();

        // 10% hang for 10s after creating shipment (simulated timeout)
        if (roll < 0.10) {
          const shipmentId = 'shp_' + Math.random().toString(36).substring(2, 9);
          inMemoryShipments.push({
            id: shipmentId,
            reference: payload.reference,
            address: payload.address,
            items: payload.items,
            createdAt: new Date().toISOString()
          });
          console.log(`[MockCourier] ⏳ 10s timeout injected for reference: ${payload.reference} (Shipment created: ${shipmentId})`);
          setTimeout(() => {
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ shipmentId, reference: payload.reference }));
          }, 10000);
          return;
        }

        // 10% return 429
        if (roll < 0.20) {
          console.log(`[MockCourier] ⚠️ 429 Rate limited for reference: ${payload.reference}`);
          res.writeHead(429, {
            'Content-Type': 'application/json',
            'Retry-After': '2'
          });
          return res.end(JSON.stringify({ error: 'Too Many Requests' }));
        }

        // 20% return 500
        if (roll < 0.40) {
          console.log(`[MockCourier] 💥 500 Internal Error for reference: ${payload.reference}`);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Upstream Courier Server Error' }));
        }

        // Successful 201
        const shipmentId = 'shp_' + Math.random().toString(36).substring(2, 9);
        inMemoryShipments.push({
          id: shipmentId,
          reference: payload.reference,
          address: payload.address,
          items: payload.items,
          createdAt: new Date().toISOString()
        });
        console.log(`[MockCourier] ✅ 201 Created shipment ${shipmentId} for reference: ${payload.reference}`);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ shipmentId, reference: payload.reference }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(PORT, () => {
  console.log(`Mock Courier API listening on http://localhost:${PORT}`);
});
