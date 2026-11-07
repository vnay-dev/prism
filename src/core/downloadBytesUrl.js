/**
 * Build a chrome.downloads-compatible URL from ZIP/binary bytes.
 * MV3 service workers often lack URL.createObjectURL — use data: URLs instead.
 */

/**
 * @param {unknown} bytes
 * @returns {Uint8Array | null}
 */
export function normalizeToUint8Array(bytes) {
  if (bytes instanceof Uint8Array) return bytes;
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  if (ArrayBuffer.isView(bytes)) {
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  if (typeof bytes === "string" && bytes.length > 0) {
    try {
      const binary = atob(bytes);
      const out = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        out[i] = binary.charCodeAt(i);
      }
      return out;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * @param {Uint8Array} u8
 * @returns {string}
 */
export function uint8ToBase64(u8) {
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < u8.length; i += chunk) {
    binary += String.fromCharCode(...u8.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Always returns a data: URL. MV3 service workers often lack URL.createObjectURL,
 * and chrome.downloads may reject SW-minted blob: URLs even when it exists.
 *
 * @param {unknown} bytes ArrayBuffer, Uint8Array, ArrayBufferView, or base64 string
 * @param {string} mime
 * @returns {{ objectUrl: string, revoke: () => void } | { error: string }}
 */
export function createDownloadUrlFromBytes(bytes, mime) {
  try {
    const u8 = normalizeToUint8Array(bytes);
    if (!u8) return { error: "download-failed" };

    const safeMime =
      typeof mime === "string" && mime.includes("/") ? mime : "application/octet-stream";
    const objectUrl = `data:${safeMime};base64,${uint8ToBase64(u8)}`;
    return { objectUrl, revoke: () => {} };
  } catch {
    return { error: "download-failed" };
  }
}
