import crypto from "node:crypto";

const JWT_SECRET = process.env.JWT_SECRET || "esspreso-dev-secret-change-this-value";

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(payload)
  };
}

function base64UrlDecode(value = "") {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + (4 - normalized.length % 4) % 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function verifyToken(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;
  const expectedSignature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  if (signature !== expectedSignature) return null;

  const data = JSON.parse(base64UrlDecode(payload));
  if (!data.exp || data.exp * 1000 <= Date.now()) return null;

  return data;
}

export async function handler(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const payload = verifyToken(token);

  if (!payload) {
    return jsonResponse(401, { valid: false, message: "Sesion invalida o caducada" });
  }

  return jsonResponse(200, {
    valid: true,
    user: {
      username: payload.username,
      name: payload.name,
      role: payload.role
    },
    exp: payload.exp
  });
}
