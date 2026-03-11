function getLineAndColumnFromIndex(text, index) {
  const safeIndex = Math.max(0, Math.min(index, text.length));
  const sliced = text.slice(0, safeIndex);
  const lines = sliced.split('\n');
  const line = lines.length;
  const column = lines[lines.length - 1].length + 1;

  return { line, column };
}

function parseErrorToLocation(errorMessage, text) {
  const lineColumnMatch = errorMessage.match(/line\s+(\d+)\s+column\s+(\d+)/i);

  if (lineColumnMatch) {
    return {
      line: Number(lineColumnMatch[1]),
      column: Number(lineColumnMatch[2]),
    };
  }

  const positionMatch = errorMessage.match(/position\s+(\d+)/i);

  if (positionMatch) {
    return getLineAndColumnFromIndex(text, Number(positionMatch[1]));
  }

  return { line: 1, column: 1 };
}

function parseJson(text) {
  try {
    return { value: JSON.parse(text) };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON input.';
    const { line, column } = parseErrorToLocation(message, text);

    return {
      error: {
        message,
        line,
        column,
      },
    };
  }
}

self.onmessage = (event) => {
  const { type, payload } = event.data ?? {};
  const text = payload?.text ?? '';
  const indent = payload?.indent === 4 ? 4 : 2;

  if (!text.trim()) {
    self.postMessage({
      success: false,
      error: {
        message: 'Input is empty. Paste JSON to continue.',
        line: 1,
        column: 1,
      },
    });
    return;
  }

  const parsed = parseJson(text);

  if (parsed.error) {
    self.postMessage({
      success: false,
      error: parsed.error,
    });
    return;
  }

  if (type === 'validate') {
    self.postMessage({
      success: true,
      result: 'Valid JSON',
    });
    return;
  }

  if (type === 'minify') {
    self.postMessage({
      success: true,
      result: JSON.stringify(parsed.value),
    });
    return;
  }

  self.postMessage({
    success: true,
    result: JSON.stringify(parsed.value, null, indent),
  });
};
