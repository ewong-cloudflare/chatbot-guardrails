import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export function extractAccessToken(request: Request): string | null {
  const header = request.headers.get("Cf-Access-Jwt-Assertion");
  if (header) return header;

  const cookie = request.headers.get("Cookie");
  if (cookie) {
    for (const part of cookie.split(";")) {
      const [name, ...rest] = part.trim().split("=");
      if (name === "CF_Authorization") return rest.join("=");
    }
  }
  return null;
}

export function toSessionName(identity: string): string {
  const safe = identity
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `u_${safe}`;
}

function normalizeIdentity(payload: JWTPayload): string | null {
  const email = payload.email;
  if (typeof email === "string" && email.length > 0) return email;
  if (typeof payload.sub === "string" && payload.sub.length > 0) {
    return payload.sub;
  }
  return null;
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(teamDomain: string) {
  let jwks = jwksCache.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`https://${teamDomain}/cdn-cgi/access/certs`)
    );
    jwksCache.set(teamDomain, jwks);
  }
  return jwks;
}

export async function getSessionName(
  request: Request,
  env: Env
): Promise<string | null> {
  const teamDomain = env.ACCESS_TEAM_DOMAIN;
  const aud = env.ACCESS_AUD;
  if (!teamDomain || !aud) return null;

  const token = extractAccessToken(request);
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getJwks(teamDomain), {
      audience: aud
    });
    const identity = normalizeIdentity(payload);
    return identity ? toSessionName(identity) : null;
  } catch (err) {
    console.warn("Access JWT verification failed:", (err as Error).message);
    return null;
  }
}
