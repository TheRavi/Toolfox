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

    const result = Array.from({ length: safeCount }, () => crypto.randomUUID());

    self.postMessage({
      success: true,
      result,
    });
  } catch (error) {
    self.postMessage({
      success: false,
      error: { message: error?.message || 'UUID generation failed.' },
    });
  }
};
