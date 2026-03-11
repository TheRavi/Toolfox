import YAML from 'js-yaml';

self.onmessage = (event) => {
  const { type, payload } = event.data;

  try {
    let result;

    if (type === 'json-to-yaml') {
      const parsed = JSON.parse(payload.text);
      result = YAML.dump(parsed, {
        indent: payload.indent,
        lineWidth: -1,
      });
    } else if (type === 'yaml-to-json') {
      const parsed = YAML.load(payload.text);
      const indent = payload.indent === 4 ? 4 : 2;
      result = JSON.stringify(parsed, null, indent);
    } else {
      throw new Error(`Unknown operation: ${type}`);
    }

    self.postMessage({
      success: true,
      result,
    });
  } catch (error) {
    self.postMessage({
      success: false,
      error: {
        message: error.message,
        line: 1,
        column: 1,
      },
    });
  }
};
