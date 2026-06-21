import crypto from "node:crypto";

const USERS = [
  { username: "andrea", password: "andreaSpre", name: "Andrea", role: "staff" },
  { username: "ximena", password: "ximenaSpre", name: "Ximena", role: "staff" }
];

const TOKEN_HOURS = Number(process.env.AUTH_TOKEN_HOURS || 4);
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

function base64Url(value) {
  return Buffer.from(JSON.stringify(value))
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signJwt(payload) {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64Url(header);
  const encodedPayload = base64Url(payload);
  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { message: "Metodo no permitido" });
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const username = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || "");

    const user = USERS.find((item) => item.username === username && item.password === password);

    if (!user) {
      return jsonResponse(401, { message: "Usuario o contrasena incorrectos" });
    }

    const now = Math.floor(Date.now() / 1000);
    const exp = now + TOKEN_HOURS * 60 * 60;
    const publicUser = {
      username: user.username,
      name: user.name,
      role: user.role
    };

    const token = signJwt({
      ...publicUser,
      iat: now,
      exp
    });

    return jsonResponse(200, {
      token,
      user: publicUser,
      expiresAt: exp,
      expiresInHours: TOKEN_HOURS
    });
  } catch (error) {
    return jsonResponse(400, { message: "Solicitud invalida" });
  }
}
