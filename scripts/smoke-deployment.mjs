#!/usr/bin/env node

const apiBaseUrl = (
  process.env.SMOKE_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.API_BASE_URL ||
  "http://127.0.0.1:4000/api"
).replace(/\/$/, "");

const email = process.env.SMOKE_LOGIN_EMAIL || process.env.BOOTSTRAP_ADMIN_EMAIL;
const password =
  process.env.SMOKE_LOGIN_PASSWORD || process.env.BOOTSTRAP_ADMIN_PASSWORD;
const origin =
  process.env.SMOKE_ORIGIN ||
  process.env.NEXT_PUBLIC_WEB_URL ||
  process.env.WEB_APP_URL ||
  "http://localhost:3001";

const failures = [];

async function check(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.error(`not ok - ${name}: ${error.message}`);
  }
}

async function request(path, init = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  return response;
}

function collectCookies(response) {
  const setCookie = response.headers.get("set-cookie");
  return setCookie
    ? setCookie
        .split(/,(?=\s*[^;]+?=)/)
        .map((item) => item.split(";")[0])
        .join("; ")
    : "";
}

await check("API health endpoint", async () => {
  const response = await request("/");
  if (!response.ok) throw new Error(`Expected 2xx, got ${response.status}`);
});

await check("protected profile rejects unauthenticated request", async () => {
  const response = await request("/auth/me");
  if (![401, 403].includes(response.status)) {
    throw new Error(`Expected 401/403, got ${response.status}`);
  }
});

let cookieHeader = "";
if (email && password) {
  await check("auth login works", async () => {
    const response = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, rememberMe: true }),
    });
    if (!response.ok) throw new Error(`Expected 2xx, got ${response.status}`);
    cookieHeader = collectCookies(response);
    if (!cookieHeader) throw new Error("Login did not return auth cookies.");
  });

  await check("authenticated profile works", async () => {
    const response = await request("/auth/me", {
      headers: { Cookie: cookieHeader },
    });
    if (!response.ok) throw new Error(`Expected 2xx, got ${response.status}`);
  });

  for (const path of ["/employees", "/leave-types", "/pay-components", "/claims/types"]) {
    await check(`major module list endpoint ${path}`, async () => {
      const response = await request(path, { headers: { Cookie: cookieHeader } });
      if (!response.ok) throw new Error(`Expected 2xx, got ${response.status}`);
    });
  }
} else {
  console.warn(
    "Skipping authenticated smoke checks. Set SMOKE_LOGIN_EMAIL and SMOKE_LOGIN_PASSWORD.",
  );
}

await check("CORS origin is accepted", async () => {
  const response = await request("/");
  const allowOrigin = response.headers.get("access-control-allow-origin");
  if (allowOrigin && allowOrigin !== origin && allowOrigin !== "*") {
    throw new Error(`Unexpected CORS origin: ${allowOrigin}`);
  }
});

if (failures.length) {
  console.error(`Smoke checks failed: ${failures.length}`);
  process.exit(1);
}

console.log("Deployment smoke checks completed successfully.");
