function normalizeLine(line, ignoreTrimWhitespace) {
  return ignoreTrimWhitespace ? line.trimEnd() : line;
}

function buildLcsTable(original, modified) {
  const rows = original.length;
  const cols = modified.length;
  const table = Array.from({ length: rows + 1 }, () => new Array(cols + 1).fill(0));

  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      if (original[i] === modified[j]) {
        table[i][j] = table[i + 1][j + 1] + 1;
      } else {
        table[i][j] = Math.max(table[i + 1][j], table[i][j + 1]);
      }
    }
  }

  return table;
}

function summarizeDiff(originalText, modifiedText, ignoreTrimWhitespace) {
  const original = originalText.split('\n').map((line) => normalizeLine(line, ignoreTrimWhitespace));
  const modified = modifiedText.split('\n').map((line) => normalizeLine(line, ignoreTrimWhitespace));

  const table = buildLcsTable(original, modified);

  let i = 0;
  let j = 0;
  let added = 0;
  let removed = 0;
  let hunks = 0;
  let inHunk = false;

  while (i < original.length && j < modified.length) {
    if (original[i] === modified[j]) {
      inHunk = false;
      i += 1;
      j += 1;
      continue;
    }

    if (!inHunk) {
      hunks += 1;
      inHunk = true;
    }

    if (table[i + 1][j] >= table[i][j + 1]) {
      removed += 1;
      i += 1;
    } else {
      added += 1;
      j += 1;
    }
  }

  if (i < original.length || j < modified.length) {
    hunks += 1;
    removed += original.length - i;
    added += modified.length - j;
  }

  return { hunks, added, removed };
}

globalThis.onmessage = (event) => {
  const { type, payload } = event.data ?? {};

  if (type !== 'summarize') {
    globalThis.postMessage({
      success: false,
      requestId: payload?.requestId,
      error: { message: `Unknown operation: ${type}` },
    });
    return;
  }

  try {
    const originalText = payload?.originalText ?? '';
    const modifiedText = payload?.modifiedText ?? '';
    const ignoreTrimWhitespace = Boolean(payload?.ignoreTrimWhitespace);

    const summary = summarizeDiff(originalText, modifiedText, ignoreTrimWhitespace);

    globalThis.postMessage({
      success: true,
      requestId: payload?.requestId,
      result: summary,
    });
  } catch (error) {
    globalThis.postMessage({
      success: false,
      requestId: payload?.requestId,
      error: {
        message: error?.message || 'Text diff summary failed.',
      },
    });
  }
};
