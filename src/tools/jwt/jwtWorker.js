function encodeBase64UrlFromBytes(bytes) {
  let binary = '';

  bytes.forEach((byte) => {
    binary += String.fromCodePoint(byte);
  });

  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function decodeBase64UrlToBytes(input) {
  const normalized = input.replaceAll('-', '+').replaceAll('_', '/');
  const paddingLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(paddingLength);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.codePointAt(i) ?? 0;
  }

  return bytes;
}

function encodeJsonPart(value) {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  return encodeBase64UrlFromBytes(bytes);
}

function decodeJsonPart(part, label) {
  try {
    const bytes = decodeBase64UrlToBytes(part);
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json);
  } catch {
    throw new Error(`Invalid ${label} segment.`);
  }
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  let diff = 0;

  for (let i = 0; i < a.length; i += 1) {
    diff |= (a.codePointAt(i) ?? 0) ^ (b.codePointAt(i) ?? 0);
  }

  return diff === 0;
}

async function signHs256(input, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    {
      name: 'HMAC',
      hash: 'SHA-256',
    },
    false,
    ['sign'],
  );

  const signatureBytes = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(input),
  );

  return encodeBase64UrlFromBytes(new Uint8Array(signatureBytes));
}

async function encodeToken(payloadText, headerText, algorithm, secret) {
  let payload;
  let customHeader;

  try {
    payload = JSON.parse(payloadText || '{}');
  } catch {
    throw new Error('Payload must be valid JSON.');
  }

  try {
    customHeader = headerText.trim() ? JSON.parse(headerText) : {};
  } catch {
    throw new Error('Header must be valid JSON.');
  }

  const header = {
    typ: 'JWT',
    alg: algorithm === 'HS256' ? 'HS256' : 'none',
    ...customHeader,
  };

  const encodedHeader = encodeJsonPart(header);
  const encodedPayload = encodeJsonPart(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  if (header.alg === 'none') {
    return {
      token: `${signingInput}.`,
      header,
      payload,
    };
  }

  if (!secret) {
    throw new Error('Secret is required for HS256 signing.');
  }

  const signature = await signHs256(signingInput, secret);

  return {
    token: `${signingInput}.${signature}`,
    header,
    payload,
  };
}

function decodeToken(token) {
  const parts = token.split('.');

  if (parts.length < 2) {
    throw new Error('JWT must contain at least header and payload segments.');
  }

  const [headerPart, payloadPart, signaturePart = ''] = parts;
  const header = decodeJsonPart(headerPart, 'header');
  const payload = decodeJsonPart(payloadPart, 'payload');

  return {
    header,
    payload,
    signature: signaturePart,
    hasSignature: signaturePart.length > 0,
  };
}

async function verifyToken(token, secret) {
  const parts = token.split('.');

  if (parts.length !== 3) {
    throw new Error('JWT verification requires three token segments.');
  }

  const [headerPart, payloadPart, signaturePart] = parts;
  const header = decodeJsonPart(headerPart, 'header');
  const payload = decodeJsonPart(payloadPart, 'payload');
  const signingInput = `${headerPart}.${payloadPart}`;

  if (header?.alg === 'none') {
    const valid = !signaturePart;
    return {
      valid,
      header,
      payload,
      note: valid
        ? 'Unsecured token (alg: none) — no signature to verify.'
        : 'Unsecured token (alg: none) should have an empty signature segment.',
      signature: signaturePart || '',
    };
  }

  if (header?.alg !== 'HS256') {
    throw new Error(`Unsupported algorithm for verification: ${header?.alg || 'unknown'}.`);
  }

  if (!secret) {
    throw new Error('Secret is required for HS256 verification.');
  }

  const expectedSignature = await signHs256(signingInput, secret);
  const valid = timingSafeEqual(signaturePart || '', expectedSignature);

  return {
    valid,
    header,
    payload,
    expectedSignature,
    signature: signaturePart || '',
  };
}

globalThis.onmessage = async (event) => {
  const { type, payload } = event.data ?? {};

  try {
    if (type === 'decode') {
      const token = payload?.token?.trim() || '';

      if (!token) {
        throw new Error('Enter a JWT token to decode.');
      }

      const result = decodeToken(token);
      globalThis.postMessage({ success: true, result });
      return;
    }

    if (type === 'encode') {
      const result = await encodeToken(
        payload?.payloadText || '',
        payload?.headerText || '',
        payload?.algorithm || 'none',
        payload?.secret || '',
      );

      globalThis.postMessage({ success: true, result });
      return;
    }

    if (type === 'verify') {
      const token = payload?.token?.trim() || '';

      if (!token) {
        throw new Error('Enter a JWT token to verify.');
      }

      const result = await verifyToken(token, payload?.secret || '');
      globalThis.postMessage({ success: true, result });
      return;
    }

    throw new Error(`Unknown operation: ${type}`);
  } catch (error) {
    globalThis.postMessage({
      success: false,
      error: {
        message: error?.message || 'JWT operation failed.',
      },
    });
  }
};
