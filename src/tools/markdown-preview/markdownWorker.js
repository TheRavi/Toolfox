function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function countLines(text) {
  if (!text.length) {
    return 0;
  }

  return text.split('\n').length;
}

globalThis.onmessage = (event) => {
  const { type, payload } = event.data ?? {};
  const requestId = payload?.requestId;

  if (type !== 'analyze') {
    globalThis.postMessage({
      success: false,
      requestId,
      error: {
        message: `Unknown operation: ${type}`,
      },
    });
    return;
  }

  try {
    const text = payload?.text ?? '';

    globalThis.postMessage({
      success: true,
      requestId,
      result: {
        normalizedText: text,
        wordCount: countWords(text),
        characterCount: text.length,
        lineCount: countLines(text),
      },
    });
  } catch (error) {
    globalThis.postMessage({
      success: false,
      requestId,
      error: {
        message: error?.message || 'Markdown analysis failed.',
      },
    });
  }
};
