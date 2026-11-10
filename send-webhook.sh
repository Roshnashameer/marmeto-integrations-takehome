#!/usr/bin/env bash
set -e

PORT=${PORT:-3000}
SECRET=${WEBHOOK_SECRET:-"shh_marmeto_secret_key_123"}
ORDER_ID="ord_$(date +%s)"
WEBHOOK_ID="wh_$(date +%s)"

PAYLOAD="{\"id\":\"${ORDER_ID}\",\"shipping_address\":{\"city\":\"Bangalore\",\"zip\":\"560001\"},\"line_items\":[{\"sku\":\"ITEM-1\",\"qty\":2}]}"

# Calculate HMAC-SHA256 signature encoded as base64
SIGNATURE=$(printf "%s" "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" -binary | base64)

echo "=== 1. Sending Valid Webhook (Order: ${ORDER_ID}) ==="
curl -i -X POST "http://localhost:${PORT}/webhooks/orders-create" \
  -H "Content-Type: application/json" \
  -H "X-Shop-Hmac-Sha256: ${SIGNATURE}" \
  -H "X-Shop-Webhook-Id: ${WEBHOOK_ID}" \
  -d "$PAYLOAD"

echo -e "\n\n=== 2. Sending Duplicate Webhook (Same Webhook ID) ==="
curl -i -X POST "http://localhost:${PORT}/webhooks/orders-create" \
  -H "Content-Type: application/json" \
  -H "X-Shop-Hmac-Sha256: ${SIGNATURE}" \
  -H "X-Shop-Webhook-Id: ${WEBHOOK_ID}" \
  -d "$PAYLOAD"

echo -e "\n\n=== 3. Sending Invalid Signature (Expect 401) ==="
curl -i -X POST "http://localhost:${PORT}/webhooks/orders-create" \
  -H "Content-Type: application/json" \
  -H "X-Shop-Hmac-Sha256: invalid_base64_sig=" \
  -H "X-Shop-Webhook-Id: ${WEBHOOK_ID}_bad" \
  -d "$PAYLOAD"
echo ""
