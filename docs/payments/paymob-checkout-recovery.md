# Paymob checkout recovery operations

## Durable result and replay

`PaymentExecutionAttempt` is authoritative for Paymob execution state and the provider checkout result. The checkout URL is AES-256-GCM encrypted with a random 96-bit nonce and authentication tag; it is selected explicitly by the backend because its query includes Paymob's intention-specific client secret. The serialized ciphertext includes a format version and key ID. `Payment` remains authoritative for merchant payment state and its provider payment ID; the attempt also retains the provider order reference used for callbacks. Merchant API credentials are never stored in the attempt.

The checkout intent route replays a `SESSION_CREATED` result for the same authenticated owner and idempotency request. A stored session is adopted into a still-created Payment transactionally; the existing ledger key keeps the pending event idempotent. Different keys remain blocked by the active Payment and unique Order execution reservation.

## Encryption key setup and rotation

Configure `PAYMOB_CHECKOUT_RESULT_KEYRING` as a JSON object mapping key IDs to 32-byte hexadecimal keys and `PAYMOB_CHECKOUT_RESULT_ACTIVE_KEY_ID` to one included ID. Keep the keyring in the deployment secret manager. Missing or malformed key configuration blocks Paymob session creation before the external request.

To rotate, add a new randomly generated key under a new key ID while retaining all previous key IDs, then change the active ID. New ciphertext uses the new key. Reads authenticate/decrypt old ciphertext and atomically re-encrypt it under the active key with a compare-and-set update. Keep old keys available until all rows have been read and migrated; dormant rows may remain. Before removing a key, verify through an approved maintenance query that no stored ciphertext still references it. For legacy `v1` ciphertext, retain `PAYMOB_CHECKOUT_RESULT_ENCRYPTION_KEY` until those rows have been lazily re-encrypted. Back up keys separately from the database; losing a key makes affected checkout URLs unrecoverable. Never log keys, plaintext URLs, or client secrets.

## Unresolved and rejected attempts

`REQUESTING`, `UNKNOWN`, and `REJECTED` attempts are not retried automatically. `UNKNOWN` means the create request may have succeeded even when the HTTP response was not received or validated. The Order stays reserved. The endpoint returns an operational error; a new idempotency key cannot create a second session.

Paymob's documented transaction inquiry by Order ID or merchant reference returns transaction details. It does not document recovery of an intention's client secret or checkout URL. The current integration therefore does not call inquiry to manufacture a checkout result, and does not treat a missing transaction as proof that intention creation failed. The request's `special_reference` is the merchant Payment ID.

For an unresolved attempt, an operator should:

1. Locate the attempt by the merchant Payment ID and inspect its status, timestamps, safe error code, and any persisted Paymob IDs. Do not copy checkout URLs or client secrets into tickets or logs.
2. Use the merchant's authenticated Paymob dashboard or Paymob support to determine whether an intention/session exists and whether it can still be used. Do not initiate a replacement while outcome is unknown.
3. Record the provider-confirmed outcome, support case/reference, operator identity, and timestamp in the merchant's controlled incident/audit system, then use the approved payment reconciliation review. This application intentionally has no endpoint that clears a `REQUESTING`, `UNKNOWN`, or `REJECTED` reservation or authorizes a replacement session. Do not edit financial collections directly. Keep the Payment and Order blocked until an independently reviewed engineering change implements a provider-evidenced resolution path.

Automatic expiry and replacement are intentionally unsupported. The current request does not set an expiration, and the public documentation describes an optional `expiration` request value but does not establish a query API or verified expiry signal suitable for safely releasing the Order. A confirmed provider rejection is retained as `REJECTED`; it is not by itself an automated replacement authorization.

## Early callbacks

After raw-body HMAC verification, safe canonical callback fields are durably stored even when the local Paymob order reference does not yet map to a persisted attempt. The receipt keeps the signed Paymob order ID and is marked `bindingPending`; it does not persist the raw callback or card-adjacent fields. The worker retries these binding-pending receipts without applying its normal bounded-attempt dead-letter limit. Once a `SESSION_CREATED` attempt becomes visible, the worker binds the Payment and provider references under the same MongoDB transaction and then processes the event through existing claim, transaction, amount, currency, provider-reference, state-machine, and ledger idempotency checks. Duplicate provider event IDs remain deduplicated. Invalid HMAC callbacks are rejected before receipt creation. Verified but permanently inconsistent events still dead-letter under existing rules.

## Storage and deployment

The new attempt and webhook fields are additive MongoDB document fields. No collection migration or index change is required. Existing `SESSION_CREATED` attempts without encrypted checkout URLs cannot be replayed; they remain blocked and require the manual reconciliation procedure above. Protect database access and backups accordingly.
