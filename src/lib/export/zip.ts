/**
 * A minimal ZIP writer, enough to bundle an export into one download.
 *
 * Entries are stored rather than deflated: the archive is built in the browser
 * from text and already-compressed media, so compression would cost time for
 * little gain and would drag in a library.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS date and time, the only clock the ZIP format knows. */
function dosDateTime(date: Date): { time: number; day: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    day: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

interface Entry {
  name: Uint8Array<ArrayBuffer>;
  data: Uint8Array<ArrayBuffer>;
  crc: number;
  offset: number;
}

export class ZipWriter {
  #entries: Entry[] = [];
  #chunks: Uint8Array<ArrayBuffer>[] = [];
  #offset = 0;
  #names = new Set<string>();
  #stamp = dosDateTime(new Date());
  #encoder = new TextEncoder();

  add(path: string, content: string | Uint8Array<ArrayBuffer>) {
    if (this.#names.has(path)) return;
    this.#names.add(path);

    const name = this.#encoder.encode(path);
    const data = typeof content === "string" ? this.#encoder.encode(content) : content;
    const crc = crc32(data);

    const header = new Uint8Array(30 + name.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true); // version needed
    view.setUint16(6, 0x0800, true); // UTF-8 names
    view.setUint16(8, 0, true); // stored
    view.setUint16(10, this.#stamp.time, true);
    view.setUint16(12, this.#stamp.day, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, name.length, true);
    view.setUint16(28, 0, true);
    header.set(name, 30);

    this.#entries.push({ name, data, crc, offset: this.#offset });
    this.#chunks.push(header, data);
    this.#offset += header.length + data.length;
  }

  get size(): number {
    return this.#entries.length;
  }

  toBlob(): Blob {
    const central: Uint8Array<ArrayBuffer>[] = [];
    let centralSize = 0;

    for (const entry of this.#entries) {
      const record = new Uint8Array(46 + entry.name.length);
      const view = new DataView(record.buffer);
      view.setUint32(0, 0x02014b50, true);
      view.setUint16(4, 20, true); // version made by
      view.setUint16(6, 20, true); // version needed
      view.setUint16(8, 0x0800, true);
      view.setUint16(10, 0, true);
      view.setUint16(12, this.#stamp.time, true);
      view.setUint16(14, this.#stamp.day, true);
      view.setUint32(16, entry.crc, true);
      view.setUint32(20, entry.data.length, true);
      view.setUint32(24, entry.data.length, true);
      view.setUint16(28, entry.name.length, true);
      view.setUint32(42, entry.offset, true);
      record.set(entry.name, 46);
      central.push(record);
      centralSize += record.length;
    }

    const end = new Uint8Array(22);
    const view = new DataView(end.buffer);
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(8, this.#entries.length, true);
    view.setUint16(10, this.#entries.length, true);
    view.setUint32(12, centralSize, true);
    view.setUint32(16, this.#offset, true);

    return new Blob([...this.#chunks, ...central, end], { type: "application/zip" });
  }
}
