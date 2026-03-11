const STORAGE_KEYS = {
  theme: 'devtoolbox.theme',
  indentation: 'devtoolbox.json.indentation',
  lastTool: 'devtoolbox.lastTool',
};

const DEFAULTS = {
  theme: 'dark',
  indentation: 2,
  lastTool: 'json-formatter',
};

function readValue(key, fallback) {
  try {
    const value = localStorage.getItem(key);

    if (value === null) {
      return fallback;
    }

    return value;
  } catch {
    return fallback;
  }
}

function writeValue(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    return;
  }
}

export function getTheme() {
  const theme = readValue(STORAGE_KEYS.theme, DEFAULTS.theme);
  return theme === 'dark' ? 'dark' : DEFAULTS.theme;
}

export function setTheme(theme) {
  writeValue(STORAGE_KEYS.theme, theme);
}

export function getIndentation() {
  const value = Number(readValue(STORAGE_KEYS.indentation, DEFAULTS.indentation));
  return value === 2 || value === 4 ? value : DEFAULTS.indentation;
}

export function setIndentation(indent) {
  writeValue(STORAGE_KEYS.indentation, indent);
}

export function getLastUsedTool() {
  return readValue(STORAGE_KEYS.lastTool, DEFAULTS.lastTool);
}

export function setLastUsedTool(toolId) {
  writeValue(STORAGE_KEYS.lastTool, toolId);
}
