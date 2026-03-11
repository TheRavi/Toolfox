const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const BASE32_INDEX = Object.fromEntries(
  CROCKFORD_BASE32.split('').map((character, index) => [character, index]),
);

let lastTimestamp = -1;
let lastRandomPart = '';

function encodeTime(timestampMs) {
  let value = timestampMs;
  let encoded = '';

  for (let i = 0; i < 10; i += 1) {
    encoded = CROCKFORD_BASE32[value % 32] + encoded;
    value = Math.floor(value / 32);
  }

  return encoded;
}

function encodeRandom() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  let buffer = 0;
  let bits = 0;
  let encoded = '';

  for (let i = 0; i < bytes.length && encoded.length < 16; i += 1) {
    buffer = (buffer << 8) | bytes[i];
    bits += 8;

    while (bits >= 5 && encoded.length < 16) {
      const index = (buffer >> (bits - 5)) & 31;
      encoded += CROCKFORD_BASE32[index];
      bits -= 5;
    }
  }

  if (encoded.length < 16) {
    encoded = `${encoded}${'0'.repeat(16 - encoded.length)}`;
  }

  return encoded;
}

function incrementRandomPart(value) {
  const chars = value.split('');

  for (let index = chars.length - 1; index >= 0; index -= 1) {
    const current = BASE32_INDEX[chars[index]];

    if (current < 31) {
      chars[index] = CROCKFORD_BASE32[current + 1];
      return chars.join('');
    }

    chars[index] = CROCKFORD_BASE32[0];
  }

  return null;
}

function createUlid() {
  const timestamp = Date.now();

  if (timestamp !== lastTimestamp) {
    lastTimestamp = timestamp;
    lastRandomPart = encodeRandom();
    return `${encodeTime(timestamp)}${lastRandomPart}`;
  }

  const incrementedRandomPart = incrementRandomPart(lastRandomPart);

  if (!incrementedRandomPart) {
    lastTimestamp += 1;
    lastRandomPart = encodeRandom();
    return `${encodeTime(lastTimestamp)}${lastRandomPart}`;
  }

  lastRandomPart = incrementedRandomPart;
  return `${encodeTime(timestamp)}${lastRandomPart}`;
}

self.onmessage = (event) => {
  const { type, payload } = event.data ?? {};

  if (type !== 'generate') {
    self.postMessage({
      success: false,
      error: { message: `Unknown operation: ${type}` },
    });
    return;
  }

  try {
    const requestedCount = Number(payload?.count);
    const safeCount = Number.isFinite(requestedCount)
      ? Math.min(100, Math.max(1, requestedCount))
      : 1;

    const result = Array.from({ length: safeCount }, () => createUlid());

    self.postMessage({
      success: true,
      result,
    });
  } catch (error) {
    self.postMessage({
      success: false,
      error: { message: error?.message || 'ULID generation failed.' },
    });
  }
};
