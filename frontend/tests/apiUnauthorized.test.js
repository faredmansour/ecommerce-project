import test from "node:test";
import assert from "node:assert/strict";
import { expireLocalSession } from "../src/lib/authSession.js";

test("expiring a session clears credentials without navigating a public page to login", () => {
  const values = new Map([["token", "expired-token"], ["user", "{}"]]);
  const events = [];
  globalThis.localStorage = {
    getItem: (key) => values.get(key) || null,
    removeItem: (key) => values.delete(key),
  };
  globalThis.window = {
    location: { href: "/category?search=phone" },
    dispatchEvent: (event) => events.push(event.type),
  };
  globalThis.Event = class Event { constructor(type) { this.type = type; } };

  expireLocalSession();

  assert.equal(values.has("token"), false);
  assert.equal(values.has("user"), false);
  assert.deepEqual(events, ["alfredo:unauthorized"]);
  assert.equal(window.location.href, "/category?search=phone");
});
