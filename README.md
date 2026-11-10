# Marmeto Backend Integrations Take-Home

Idempotent, rate-limit-aware order webhook ingestion and courier dispatch engine.

---

## How to Run

### Requirements
- Node.js >= 18
- OpenSSL (for the test script)

### Setup & Run
```bash
# 1. Install dependencies
npm install

# 2. Terminal 1: Run the mock courier
npm run courier

# 3. Terminal 2: Start the integration service
npm start
```

### Verification & Testing

```bash
# Run automated tests
npm test

# Trigger the signed webhook delivery script
chmod +x send-webhook.sh
./send-webhook.sh

# Run reconciliation sweep on demand
npm run reconcile
```

---

## Architectural Decisions & Trade-offs

### 1. Ingestion Queue Choice

* **Chosen:** In-process polling worker backed by SQLite persistence with WAL mode.
* **Why:** Keeps local execution dependency-free (no Docker or external Redis instance needed for reviewers), while guaranteeing durability. If the Node process crashes, all unfulfilled orders remain safely stored with their backoff timers in the DB.
* **Trade-off:** In a distributed multi-node production setup, an external queue like **BullMQ with Redis** or **AWS SQS** is superior to avoid polling locks across distributed server instances.

### 2. Handling Non-Idempotent Upstream Couriers

* The mock courier creates duplicate shipments if the same order reference is submitted twice.
* When requests time out, the shipment might already exist upstream.
* **Solution:** Before issuing any `POST /shipments`, the worker always calls `GET /shipments?reference=<orderId>` to verify state. If a shipment is returned, the order status transitions directly to `CONFIRMED` without issuing a duplicate `POST`.

### 3. Rate Limiting & Backoff

* The client strictly inspects the `Retry-After` header when receiving HTTP 429.
* 5xx errors and network timeouts use an exponential backoff formula (2^attempts seconds).
* A request timeout of 3.5s is enforced via `AbortController` to cut off upstream calls before the courier's 10-second hang.
* After 4 unsuccessful attempts, the job is moved to `dead_letter_jobs` for manual replay via `/dead-letter/:orderId/replay`.

---

## What I Deliberately Left Out

* **Redis/BullMQ Dependency:** Omitted to allow one-command local evaluation without running external daemon containers.
* **Dynamic Cron Scheduler:** Left as an executable script (`npm run reconcile`) rather than a background cron ticker to keep test execution deterministic.
* **Complex Auth Layers:** The service focuses exclusively on HMAC header authentication as requested.

---

## What I Would Do With Another Day

1. **Distributed Queue:** Migrate the in-process poller to BullMQ with Redis streams, configuring concurrent worker concurrency and native dead-letter queues.
2. **Prometheus Metrics:** Add gauges and counters for `webhooks_received_total`, `courier_retry_count`, and `dead_letter_queue_size`.
3. **Automated Scheduled Cron:** Wrap `reconcile.ts` in a scheduled task runner or AWS EventBridge schedule running every 5 minutes.
