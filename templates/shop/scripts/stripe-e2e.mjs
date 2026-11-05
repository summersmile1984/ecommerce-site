#!/usr/bin/env node
/**
 * Real-Stripe checkout e2e — the redirect to Stripe's hosted page.
 *
 * The template ships a credential-free mock gateway for local e2e (see
 * README → Stripe); this script covers the REAL gateway, which needs a
 * backend with `settings:stripeSecretKey` set. It asserts the one thing the
 * mock cannot: that create-session hands the shopper to checkout.stripe.com.
 *
 * Usage:
 *   node scripts/stripe-e2e.mjs [--frontend http://localhost:4322] [--provider stripe|mock]
 *
 *   --provider mock  exercises the same harness against the credential-free
 *                     mock gateway (backend setting paymentProvider="mock")
 *                     and asserts the storefront thank-you redirect.
 *
 * Exit codes: 0 = passed · 1 = failed · 2 = skipped (no Stripe key/backend)
 */
import { readFileSync } from "node:fs";

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? dflt : process.argv[i + 1];
};
const FRONTEND = arg("--frontend", process.env.SITE_URL ?? "http://localhost:4322").replace(/\/$/, "");
const PROVIDER = arg("--provider", "stripe");

function loadEnv() {
  try {
    for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (process.env[k] === undefined) process.env[k] = v;
    }
  } catch {
    /* no .env — env vars only */
  }
}
loadEnv();

const BACKEND = (process.env.EMDASH_URL ?? "").replace(/\/$/, "");
const PAT = process.env.PAT ?? "";

const fail = (msg) => {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
};
const skip = (msg) => {
  console.log(`SKIP: ${msg}`);
  process.exit(2);
};

if (!BACKEND || !PAT) skip("EMDASH_URL/PAT missing — run npm run new-backend and fill .env");

// 1. the backend must actually have a Stripe key (mock gateway is not a substitute here)
const settings = await (await fetch(`${BACKEND}/_emdash/api/plugins/dashcommerce/admin/settings`, {
  headers: { Authorization: `Bearer ${PAT}` },
})).json();
if (PROVIDER === "mock") {
  if (settings?.paymentProvider !== "mock") {
    skip('backend is not on the mock gateway — set settings.paymentProvider="mock" (or use --provider stripe)');
  }
} else if (!settings?.stripeSecretKey) {
  skip("backend has no settings:stripeSecretKey — export STRIPE_SECRET_KEY=sk_test_… and re-run npm run new-backend");
}

// 2. a product to buy
const products = await (await fetch(`${BACKEND}/_emdash/api/content/products?limit=1&status=published`, {
  headers: { Authorization: `Bearer ${PAT}` },
})).json();
const product = products?.data?.items?.[0];
if (!product?.id) fail("backend has no published product");

// 3. drive the cart through the storefront relay (cookie relayed to the backend)
const jar = new Map();
const remember = (res) => {
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
};
const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
const origin = new URL(FRONTEND).origin;
const post = async (path, body) => {
  const res = await fetch(`${FRONTEND}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: origin,
      Accept: "text/html",
      ...(jar.size ? { Cookie: cookie() } : {}),
    },
    body: new URLSearchParams(body).toString(),
  });
  remember(res);
  return res;
};

const add = await post("/api/cart/items", { productId: product.id, quantity: "1" });
if (add.status !== 303) fail(`add-to-cart → ${add.status} ${await add.text()}`);
await post("/api/cart/shipping-location", { country: "US", postalCode: "10001", returnTo: "/cart" });

// 4. pick the first shipping rate the backend offers for that address
const rates = await (await fetch(`${BACKEND}/_emdash/api/plugins/dashcommerce/cart/shipping-methods`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${PAT}`,
    ...(jar.size ? { Cookie: cookie() } : {}),
  },
  body: "{}",
})).json();
const methodId = rates?.options?.[0]?.methodId;
if (!methodId) fail("backend offers no shipping rate for US/10001");
await post("/api/cart/shipping-method", { methodId, returnTo: "/cart" });

// 5. the assertion: create-session must hand off to the gateway
const session = await post("/api/checkout/session", { returnTo: "/checkout" });
const location = session.headers.get("location") ?? "";
if (session.status !== 303) fail(`create-session → ${session.status} ${await session.text()}`);
if (PROVIDER === "mock") {
  const parsed = new URL(location, FRONTEND);
  if (!parsed.pathname.startsWith("/thank-you/") || !parsed.searchParams.get("mock")) {
    fail(`expected the mock thank-you redirect, got ${location || "(none)"}`);
  }
  console.log(`PASS: create-session redirected to the mock gateway\n  ${location}`);
  console.log("  (the order stays pending until a gateway webhook arrives)");
} else {
  if (!location.startsWith("https://checkout.stripe.com/")) {
    fail(`expected a checkout.stripe.com redirect, got ${location || "(none)"}`);
  }
  console.log(`PASS: create-session redirected to Stripe\n  ${location}`);
  console.log("  (complete the payment in the browser; the order flips to paid via the Stripe webhook)");
}
