const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeRoute } = require("../lib/route.js");

test("normalizes trailing slashes and sorts query parameters", () => {
  assert.equal(normalizeRoute("https://staging.example.com/checkout/?b=2&a=1#pay"), "/checkout?a=1&b=2");
});

test("can ignore all query parameters", () => {
  assert.equal(normalizeRoute("https://example.com/account?id=42", { queryMode: "ignore" }), "/account");
});

test("can ignore selected query parameters", () => {
  assert.equal(
    normalizeRoute("https://example.com/search?q=lens&utm_source=email", { ignoreQueryParams: ["utm_source"] }),
    "/search?q=lens"
  );
});
