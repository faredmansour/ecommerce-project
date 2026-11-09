import test from "node:test";
import assert from "node:assert/strict";
import { restoreSession } from "../src/lib/authSession.js";

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test("restores from the backend when cached user JSON is malformed", async () => {
  const storage = createStorage({ token: "stored-access-token", user: "{" });
  const serverUser = { id: "customer-1", email: "customer@example.test", role: "user" };
  let calls = 0;

  const session = await restoreSession({
    storage,
    getMe: async () => { calls += 1; return { data: { data: serverUser } }; },
  });

  assert.equal(calls, 1);
  assert.deepEqual(session, { token: "stored-access-token", user: serverUser });
  assert.deepEqual(JSON.parse(storage.getItem("user")), serverUser);
});

test("clears an expired restored session after the backend returns 401", async () => {
  const storage = createStorage({ token: "expired-access-token", user: JSON.stringify({ id: "customer-1", role: "user" }) });

  const session = await restoreSession({
    storage,
    getMe: async () => { throw Object.assign(new Error("Unauthorized"), { response: { status: 401 } }); },
  });

  assert.equal(session, null);
  assert.equal(storage.getItem("token"), null);
  assert.equal(storage.getItem("user"), null);
});

test("clears a restored session that backend policy rejects with 403", async () => {
  const storage = createStorage({ token: "blocked-access-token", user: JSON.stringify({ id: "customer-1", role: "user" }) });
  const session = await restoreSession({
    storage,
    getMe: async () => { throw Object.assign(new Error("Forbidden"), { response: { status: 403 } }); },
  });
  assert.equal(session, null);
  assert.equal(storage.getItem("token"), null);
  assert.equal(storage.getItem("user"), null);
});

test("uses the backend role rather than a stale cached admin role", async () => {
  const storage = createStorage({ token: "valid-access-token", user: JSON.stringify({ id: "customer-1", role: "admin" }) });

  const session = await restoreSession({
    storage,
    getMe: async () => ({ data: { data: { id: "customer-1", role: "user" } } }),
  });

  assert.equal(session.user.role, "user");
  assert.equal(JSON.parse(storage.getItem("user")).role, "user");
});

test("does not treat an unvalidated stored token as an authenticated session", async () => {
  const storage = createStorage({ token: "stored-access-token", user: JSON.stringify({ id: "customer-1", role: "admin" }) });

  const session = await restoreSession({
    storage,
    getMe: async () => { throw Object.assign(new Error("Service unavailable"), { response: { status: 503 } }); },
  });

  assert.equal(session, null);
  assert.equal(storage.getItem("user"), null);
  assert.equal(storage.getItem("token"), "stored-access-token");
});
