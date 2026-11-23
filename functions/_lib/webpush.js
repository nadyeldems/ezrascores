// Minimal Web Push sender for Cloudflare Workers / Pages Functions.
// - Payload encryption: RFC 8291 (aes128gcm content coding, RFC 8188).
// - Server identification: VAPID, RFC 8292 (ES256 JWT).
// Uses WebCrypto only, so it runs on the Workers runtime and in Node 20+.

const encoder = new TextEncoder();

export function b64urlToBytes(value) {
  const s = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = s + "===".slice((s.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToB64url(bytes) {
  let bin = "";
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i += 1) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

async function hmacSha256(keyBytes, data) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
}

// HKDF with a single output block (enough for every length used here, <= 32 bytes).
async function hkdf(salt, ikm, info, length) {
  const prk = await hmacSha256(salt, ikm);
  const okm = await hmacSha256(prk, concat(info, new Uint8Array([1])));
  return okm.slice(0, length);
}

/**
 * Encrypt a push payload for one subscription.
 * @param {Uint8Array} payload  plaintext bytes (keep under ~3 KB)
 * @param {string} p256dh       subscription.keys.p256dh (base64url, 65-byte point)
 * @param {string} auth         subscription.keys.auth (base64url, 16 bytes)
 * @param {{salt?: Uint8Array, localKeyPair?: CryptoKeyPair}} [testing] fixed values for tests only
 */
export async function encryptPayload(payload, p256dh, auth, testing = {}) {
  const uaPublic = b64urlToBytes(p256dh);
  const authSecret = b64urlToBytes(auth);
  if (uaPublic.length !== 65 || authSecret.length !== 16) throw new Error("Invalid subscription keys");

  const local = testing.localKeyPair || (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]));
  const localPublic = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256));

  const keyInfo = concat(encoder.encode("WebPush: info\0"), uaPublic, localPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const salt = testing.salt || crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);

  // Single record: plaintext followed by the 0x02 "last record" delimiter.
  const plaintext = concat(payload, new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, plaintext));

  const header = new Uint8Array(16 + 4 + 1 + localPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = localPublic.length;
  header.set(localPublic, 21);
  return concat(header, ciphertext);
}

async function importVapidPrivateKey(publicKeyB64, privateKeyB64) {
  const pub = b64urlToBytes(publicKeyB64);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error("VAPID public key must be an uncompressed P-256 point");
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: bytesToB64url(pub.slice(1, 33)),
    y: bytesToB64url(pub.slice(33, 65)),
    d: String(privateKeyB64 || "").trim(),
    ext: true,
  };
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

export async function vapidAuthorization(endpoint, vapid, nowSeconds = Math.floor(Date.now() / 1000)) {
  const audience = new URL(endpoint).origin;
  const header = bytesToB64url(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = bytesToB64url(
    encoder.encode(JSON.stringify({ aud: audience, exp: nowSeconds + 12 * 60 * 60, sub: vapid.subject }))
  );
  const unsigned = `${header}.${claims}`;
  const key = await importVapidPrivateKey(vapid.publicKey, vapid.privateKey);
  // WebCrypto returns the raw r||s signature JWS expects.
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, encoder.encode(unsigned)));
  return `vapid t=${unsigned}.${bytesToB64url(signature)}, k=${vapid.publicKey}`;
}

/**
 * Send one notification. Returns { ok, status, gone } — gone means the
 * subscription has expired (404/410) and should be deleted.
 */
export async function sendWebPush(subscription, message, vapid, options = {}) {
  const body = await encryptPayload(encoder.encode(JSON.stringify(message)), subscription.p256dh, subscription.auth);
  const headers = {
    Authorization: await vapidAuthorization(subscription.endpoint, vapid),
    "Content-Encoding": "aes128gcm",
    "Content-Type": "application/octet-stream",
    TTL: String(options.ttl ?? 3600),
    Urgency: options.urgency || "high",
  };
  if (options.topic) headers.Topic = String(options.topic).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);
  const res = await fetch(subscription.endpoint, { method: "POST", headers, body });
  return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410 };
}

export async function generateVapidKeys() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const publicKey = bytesToB64url(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return { publicKey, privateKey: jwk.d };
}

// Only real browser push services may be targeted, so the API can't be used
// to make the server POST to arbitrary URLs.
export function isAllowedPushEndpoint(endpoint) {
  let url;
  try {
    url = new URL(String(endpoint || ""));
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return (
    host === "fcm.googleapis.com" ||
    host === "android.googleapis.com" ||
    host.endsWith(".push.services.mozilla.com") ||
    host === "updates.push.services.mozilla.com" ||
    host.endsWith(".notify.windows.com") ||
    host === "web.push.apple.com" ||
    host.endsWith(".push.apple.com")
  );
}
