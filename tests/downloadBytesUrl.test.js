import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createDownloadUrlFromBytes,
  normalizeToUint8Array,
  uint8ToBase64
} from "../src/core/downloadBytesUrl.js";

test("normalizeToUint8Array accepts ArrayBuffer, view, and base64", () => {
  const u8 = new Uint8Array([1, 2, 3, 4]);
  assert.deepEqual(normalizeToUint8Array(u8), u8);
  assert.deepEqual(normalizeToUint8Array(u8.buffer.slice(0)), u8);
  assert.deepEqual(normalizeToUint8Array(uint8ToBase64(u8)), u8);
  assert.equal(normalizeToUint8Array({}), null);
  assert.equal(normalizeToUint8Array(null), null);
});

test("createDownloadUrlFromBytes always returns a data URL", () => {
  const u8 = new Uint8Array([80, 75]); // "PK"
  const created = createDownloadUrlFromBytes(u8, "application/zip");
  assert.equal("error" in created, false);
  assert.equal(created.objectUrl, `data:application/zip;base64,${uint8ToBase64(u8)}`);
  created.revoke();
});

test("createDownloadUrlFromBytes accepts base64 payload", () => {
  const u8 = new Uint8Array([9, 8, 7]);
  const created = createDownloadUrlFromBytes(uint8ToBase64(u8), "application/zip");
  assert.equal("error" in created, false);
  assert.equal(created.objectUrl, `data:application/zip;base64,${uint8ToBase64(u8)}`);
});
