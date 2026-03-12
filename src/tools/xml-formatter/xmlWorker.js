import { XMLBuilder, XMLParser, XMLValidator } from 'fast-xml-parser';

function splitXmlDeclaration(input) {
  const trimmed = input.trimStart();
  const declarationMatch = trimmed.match(/^<\?xml[^?]*\?>/i);

  if (!declarationMatch) {
    return { declaration: '', body: input };
  }

  const declaration = declarationMatch[0];
  const declarationIndex = input.indexOf(declaration);
  const body = `${input.slice(0, declarationIndex)}${input.slice(declarationIndex + declaration.length)}`.trim();

  return { declaration, body };
}

function validateXml(xmlText) {
  const result = XMLValidator.validate(xmlText);

  if (result === true) {
    return;
  }

  const details = result?.err || {};
  const message = details.msg || 'Invalid XML input.';
  const line = details.line ? ` (line ${details.line})` : '';
  throw new Error(`${message}${line}`);
}

function createParser() {
  return new XMLParser({
    ignoreAttributes: false,
    preserveOrder: true,
    processEntities: true,
    trimValues: false,
  });
}

function createBuilder({ format, indentSize }) {
  const indentBy = ' '.repeat(indentSize === 4 ? 4 : 2);

  return new XMLBuilder({
    ignoreAttributes: false,
    preserveOrder: true,
    processEntities: true,
    format,
    indentBy,
    suppressEmptyNode: false,
  });
}

function stripWhitespaceTextNodes(nodes) {
  if (!Array.isArray(nodes)) {
    return nodes;
  }

  return nodes
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return entry;
      }

      const next = {};

      Object.entries(entry).forEach(([key, value]) => {
        if (key === '#text' && typeof value === 'string' && value.trim() === '') {
          return;
        }

        if (Array.isArray(value)) {
          next[key] = stripWhitespaceTextNodes(value);
          return;
        }

        next[key] = value;
      });

      return Object.keys(next).length ? next : null;
    })
    .filter(Boolean);
}

function formatXml(text, indentSize) {
  const { declaration, body } = splitXmlDeclaration(text);
  validateXml(body || text);
  const parser = createParser();
  const parsed = stripWhitespaceTextNodes(parser.parse(body || text));
  const builder = createBuilder({ format: true, indentSize });
  const output = builder.build(parsed).trim();
  return declaration ? `${declaration}\n${output}` : output;
}

function minifyXml(text) {
  const { declaration, body } = splitXmlDeclaration(text);
  validateXml(body || text);
  const parser = createParser();
  const parsed = stripWhitespaceTextNodes(parser.parse(body || text));
  const builder = createBuilder({ format: false, indentSize: 2 });
  const output = builder.build(parsed).replaceAll(/>\s+</g, '><').trim();
  return declaration ? `${declaration}${output}` : output;
}

globalThis.onmessage = (event) => {
  const { type, payload } = event.data ?? {};

  try {
    const text = payload?.text || '';

    if (!text.trim()) {
      throw new Error('Enter XML input first.');
    }

    if (type === 'format') {
      globalThis.postMessage({ success: true, result: formatXml(text, payload?.indent) });
      return;
    }

    if (type === 'minify') {
      globalThis.postMessage({ success: true, result: minifyXml(text) });
      return;
    }

    if (type === 'validate') {
      validateXml(text);
      globalThis.postMessage({ success: true, result: 'valid' });
      return;
    }

    throw new Error(`Unknown operation: ${type}`);
  } catch (error) {
    globalThis.postMessage({
      success: false,
      error: {
        message: error?.message || 'XML operation failed.',
      },
    });
  }
};
