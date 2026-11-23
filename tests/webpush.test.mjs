import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { repoPath } from "./helpers/load.mjs";

const wp = await import(pathToFileURL(repoPath("functions/_lib/webpush.js")).href);

// Independent RFC 8291 decrypt using Node's crypto module (receiver side).
function decrypt(body, uaEcdh, authSecret) {
  const salt = body.subarray(0, 16);
  const idLen = body[20];
  const senderPublic = body.subarray(21, 21 + idLen);
  const ciphertext = body.subarray(21 + idLen);
  const shared = uaEcdh.computeSecret(senderPublic);
  const hkdf = (s, ikm, info, len) => Buffer.from(crypto.hkdfSync("sha256", ikm, s, info, len));
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaEcdh.getPublicKey(), senderPublic]);
  const ikm = hkdf(authSecret, shared, keyInfo, 32);
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);
  const decipher = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
  const plain = Buffer.concat([decipher.update(ciphertext.subarray(0, ciphertext.length - 16)), decipher.final()]);
  assert.equal(plain[plain.length - 1], 2, "last-record delimiter");
  return plain.subarray(0, plain.length - 1).toString("utf8");
}

test("payloads decrypt with the subscriber's keys", async () => {
  const ua = crypto.createECDH("prime256v1");
  ua.generateKeys();
  const auth = crypto.randomBytes(16);
  const text = JSON.stringify({ title: "GOAL! Hull City", body: "Hull City 1-0 Brighton (34')" });
  const encrypted = await wp.encryptPayload(new TextEncoder().encode(text), wp.bytesToB64url(ua.getPublicKey()), wp.bytesToB64url(auth));
  assert.equal(decrypt(Buffer.from(encrypted), ua, auth), text);
});

test("VAPID header is a valid ES256 JWT for the push service origin", async () => {
  const keys = await wp.generateVapidKeys();
  const header = await wp.vapidAuthorization("https://fcm.googleapis.com/fcm/send/x", { ...keys, subject: "mailto:a@example.com" }, 1795440000);
  const [, h, c, sig, k] = header.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/);
  assert.equal(JSON.parse(Buffer.from(c, "base64url")).aud, "https://fcm.googleapis.com");
  assert.equal(k, keys.publicKey);
  const pub = wp.b64urlToBytes(keys.publicKey);
  const key = crypto.createPublicKey({
    key: { kty: "EC", crv: "P-256", x: Buffer.from(pub.slice(1, 33)).toString("base64url"), y: Buffer.from(pub.slice(33)).toString("base64url") },
    format: "jwk",
  });
  assert.ok(crypto.verify("sha256", Buffer.from(`${h}.${c}`), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url")));
});

test("only real push services are accepted", () => {
  assert.ok(wp.isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/x"));
  assert.ok(wp.isAllowedPushEndpoint("https://web.push.apple.com/x"));
  assert.ok(!wp.isAllowedPushEndpoint("https://example.com/x"));
  assert.ok(!wp.isAllowedPushEndpoint("http://fcm.googleapis.com/x"));
});
