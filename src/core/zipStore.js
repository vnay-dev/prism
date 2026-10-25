/**
 * Minimal ZIP writer (STORE / no compression). Enough for bundling a few
 * downloaded page assets without pulling in a zip library.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  for (let i = 0; i < data.length; i += 1) {
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function writeU16(view, offset, value) {
  view.setUint16(offset, value >>> 0, true);
}

function writeU32(view, offset, value) {
  view.setUint32(offset, value >>> 0, true);
}

function encodeName(name) {
  const safe = String(name || "file")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\0/g, "");
  return new TextEncoder().encode(safe || "file");
}

/**
 * @param {{ name: string, data: Uint8Array }[]} entries
 * @returns {Uint8Array}
 */
export function buildZipStore(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const prepared = list.map((entry) => {
    const nameBytes = encodeName(entry?.name);
    const data =
      entry?.data instanceof Uint8Array
        ? entry.data
        : new Uint8Array(entry?.data || []);
    return {
      nameBytes,
      data,
      crc: crc32(data),
      size: data.length
    };
  });

  let localSize = 0;
  let centralSize = 0;
  for (const item of prepared) {
    localSize += 30 + item.nameBytes.length + item.size;
    centralSize += 46 + item.nameBytes.length;
  }
  const total = localSize + centralSize + 22;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);

  let offset = 0;
  const localOffsets = [];

  for (const item of prepared) {
    localOffsets.push(offset);
    writeU32(view, offset, 0x04034b50);
    writeU16(view, offset + 4, 20); // version needed
    writeU16(view, offset + 6, 0x0800); // UTF-8 flag
    writeU16(view, offset + 8, 0); // STORE
    writeU16(view, offset + 10, 0); // time
    writeU16(view, offset + 12, 0); // date
    writeU32(view, offset + 14, item.crc);
    writeU32(view, offset + 18, item.size);
    writeU32(view, offset + 22, item.size);
    writeU16(view, offset + 26, item.nameBytes.length);
    writeU16(view, offset + 28, 0); // extra
    out.set(item.nameBytes, offset + 30);
    out.set(item.data, offset + 30 + item.nameBytes.length);
    offset += 30 + item.nameBytes.length + item.size;
  }

  const centralOffset = offset;
  for (let i = 0; i < prepared.length; i += 1) {
    const item = prepared[i];
    writeU32(view, offset, 0x02014b50);
    writeU16(view, offset + 4, 20); // version made by
    writeU16(view, offset + 6, 20); // version needed
    writeU16(view, offset + 8, 0x0800);
    writeU16(view, offset + 10, 0);
    writeU16(view, offset + 12, 0);
    writeU16(view, offset + 14, 0);
    writeU32(view, offset + 16, item.crc);
    writeU32(view, offset + 20, item.size);
    writeU32(view, offset + 24, item.size);
    writeU16(view, offset + 28, item.nameBytes.length);
    writeU16(view, offset + 30, 0);
    writeU16(view, offset + 32, 0);
    writeU16(view, offset + 34, 0);
    writeU16(view, offset + 36, 0);
    writeU32(view, offset + 38, 0);
    writeU32(view, offset + 42, localOffsets[i]);
    out.set(item.nameBytes, offset + 46);
    offset += 46 + item.nameBytes.length;
  }

  writeU32(view, offset, 0x06054b50);
  writeU16(view, offset + 4, 0);
  writeU16(view, offset + 6, 0);
  writeU16(view, offset + 8, prepared.length);
  writeU16(view, offset + 10, prepared.length);
  writeU32(view, offset + 12, offset - centralOffset);
  writeU32(view, offset + 16, centralOffset);
  writeU16(view, offset + 20, 0);

  return out;
}
