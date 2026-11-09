import test from "node:test";
import assert from "node:assert/strict";
import { getAuthReturnPath } from "../src/lib/authReturnPath.js";

test("preserves the full checkout URL after authentication", () => {
  assert.equal(
    getAuthReturnPath({ pathname: "/checkout", search: "?coupon=SAVE", hash: "#shipping" }),
    "/checkout?coupon=SAVE#shipping",
  );
});

test("uses a safe fallback when no intended route is supplied", () => {
  assert.equal(getAuthReturnPath(undefined, "/home"), "/home");
});

test("rejects external and malformed return destinations", () => {
  assert.equal(getAuthReturnPath({ pathname: "//example.com/checkout" }), "/");
  assert.equal(getAuthReturnPath({ pathname: "https://example.com/checkout" }), "/");
  assert.equal(getAuthReturnPath({ pathname: "/checkout", search: "redirect", hash: "orders" }), "/checkout");
});
