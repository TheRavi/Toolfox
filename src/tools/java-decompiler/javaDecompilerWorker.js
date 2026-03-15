const CLASS_ACCESS_FLAGS = [
  [0x0001, 'public'],
  [0x0010, 'final'],
  [0x0200, 'interface'],
  [0x0400, 'abstract'],
  [0x1000, 'synthetic'],
  [0x2000, '@interface'],
  [0x4000, 'enum'],
];

const FIELD_ACCESS_FLAGS = [
  [0x0001, 'public'],
  [0x0002, 'private'],
  [0x0004, 'protected'],
  [0x0008, 'static'],
  [0x0010, 'final'],
  [0x0040, 'volatile'],
  [0x0080, 'transient'],
  [0x1000, 'synthetic'],
  [0x4000, 'enum'],
];

const METHOD_ACCESS_FLAGS = [
  [0x0001, 'public'],
  [0x0002, 'private'],
  [0x0004, 'protected'],
  [0x0008, 'static'],
  [0x0010, 'final'],
  [0x0020, 'synchronized'],
  [0x0100, 'native'],
  [0x0400, 'abstract'],
  [0x0800, 'strictfp'],
  [0x1000, 'synthetic'],
];

function createReader(buffer) {
  const view = new DataView(buffer);
  let offset = 0;

  function ensureAvailable(bytes) {
    if (offset + bytes > view.byteLength) {
      throw new Error('Class file appears truncated or invalid.');
    }
  }

  return {
    u1() {
      ensureAvailable(1);
      const value = view.getUint8(offset);
      offset += 1;
      return value;
    },
    u2() {
      ensureAvailable(2);
      const value = view.getUint16(offset, false);
      offset += 2;
      return value;
    },
    u4() {
      ensureAvailable(4);
      const value = view.getUint32(offset, false);
      offset += 4;
      return value;
    },
    bytes(length) {
      ensureAvailable(length);
      const bytes = new Uint8Array(buffer, offset, length);
      offset += length;
      return bytes;
    },
  };
}

function collectFlags(flagValue, definitions) {
  return definitions
    .filter(([mask]) => (flagValue & mask) === mask)
    .map(([, label]) => label)
    .filter((label) => label !== 'synthetic');
}

function parseTypeDescriptor(descriptor, startIndex = 0) {
  const marker = descriptor[startIndex];

  if (!marker) {
    throw new Error('Invalid descriptor.');
  }

  if (marker === '[') {
    const nested = parseTypeDescriptor(descriptor, startIndex + 1);
    return {
      type: `${nested.type}[]`,
      nextIndex: nested.nextIndex,
    };
  }

  if (marker === 'L') {
    const endIndex = descriptor.indexOf(';', startIndex);

    if (endIndex === -1) {
      throw new Error('Invalid object descriptor.');
    }

    const value = descriptor
      .slice(startIndex + 1, endIndex)
      .replaceAll('/', '.')
      .replaceAll('$', '.');

    return {
      type: value,
      nextIndex: endIndex + 1,
    };
  }

  const primitiveMap = {
    B: 'byte',
    C: 'char',
    D: 'double',
    F: 'float',
    I: 'int',
    J: 'long',
    S: 'short',
    Z: 'boolean',
    V: 'void',
  };

  if (!primitiveMap[marker]) {
    throw new Error(`Unsupported descriptor marker: ${marker}`);
  }

  return {
    type: primitiveMap[marker],
    nextIndex: startIndex + 1,
  };
}

function parseMethodDescriptor(descriptor) {
  if (!descriptor.startsWith('(')) {
    throw new Error('Invalid method descriptor.');
  }

  let index = 1;
  const parameters = [];

  while (descriptor[index] !== ')') {
    const parsed = parseTypeDescriptor(descriptor, index);
    parameters.push(parsed.type);
    index = parsed.nextIndex;

    if (index >= descriptor.length) {
      throw new Error('Invalid method descriptor parameter list.');
    }
  }

  const returnType = parseTypeDescriptor(descriptor, index + 1);

  return {
    parameters,
    returnType: returnType.type,
  };
}

function parseConstantPoolEntry(reader, index, constantPool) {
  const tag = reader.u1();

  if (tag === 1) {
    const length = reader.u2();
    constantPool[index] = {
      tag,
      value: new TextDecoder().decode(reader.bytes(length)),
    };
    return 1;
  }

  if (tag === 3 || tag === 4) {
    reader.u4();
    constantPool[index] = { tag };
    return 1;
  }

  if (tag === 5 || tag === 6) {
    reader.u4();
    reader.u4();
    constantPool[index] = { tag };
    return 2;
  }

  if (tag === 7 || tag === 8 || tag === 16 || tag === 19 || tag === 20) {
    constantPool[index] = {
      tag,
      index: reader.u2(),
    };
    return 1;
  }

  if (tag === 9 || tag === 10 || tag === 11 || tag === 12 || tag === 18 || tag === 17) {
    constantPool[index] = {
      tag,
      first: reader.u2(),
      second: reader.u2(),
    };
    return 1;
  }

  if (tag === 15) {
    constantPool[index] = {
      tag,
      first: reader.u1(),
      second: reader.u2(),
    };
    return 1;
  }

  throw new Error(`Unsupported constant pool tag: ${tag}`);
}

function parseConstantPool(reader) {
  const constantPoolCount = reader.u2();
  const constantPool = new Array(constantPoolCount);

  for (let index = 1; index < constantPoolCount; index += 1) {
    const slotsUsed = parseConstantPoolEntry(reader, index, constantPool);

    if (slotsUsed === 2) {
      index += 1;
    }
  }

  return constantPool;
}

function createConstantPoolResolvers(constantPool) {
  function getUtf8(index) {
    const item = constantPool[index];
    return item?.tag === 1 ? item.value : '';
  }

  function getClassName(index) {
    const classEntry = constantPool[index];

    if (classEntry?.tag !== 7) {
      return '';
    }

    return getUtf8(classEntry.index).replaceAll('/', '.');
  }

  function getNameAndType(index) {
    const entry = constantPool[index];

    if (entry?.tag !== 12) {
      return {
        name: '',
        descriptor: '',
      };
    }

    return {
      name: getUtf8(entry.first),
      descriptor: getUtf8(entry.second),
    };
  }

  function resolveFieldRef(index) {
    const entry = constantPool[index];

    if (entry?.tag !== 9) {
      return {
        owner: '',
        name: '',
        descriptor: '',
      };
    }

    const owner = getClassName(entry.first);
    const nameAndType = getNameAndType(entry.second);

    return {
      owner,
      name: nameAndType.name,
      descriptor: nameAndType.descriptor,
    };
  }

  function resolveMethodRef(index) {
    const entry = constantPool[index];

    if (entry?.tag !== 10 && entry?.tag !== 11) {
      return {
        owner: '',
        name: '',
        descriptor: '',
      };
    }

    const owner = getClassName(entry.first);
    const nameAndType = getNameAndType(entry.second);

    return {
      owner,
      name: nameAndType.name,
      descriptor: nameAndType.descriptor,
    };
  }

  function resolveLdc(index) {
    const entry = constantPool[index];

    if (!entry) {
      return `cp#${index}`;
    }

    if (entry.tag === 8) {
      return JSON.stringify(getUtf8(entry.index));
    }

    if (entry.tag === 3 || entry.tag === 4 || entry.tag === 5 || entry.tag === 6) {
      return String(entry.value ?? 0);
    }

    if (entry.tag === 7) {
      return `${getClassName(index)}.class`;
    }

    return `cp#${index}`;
  }

  return {
    getUtf8,
    getClassName,
    resolveFieldRef,
    resolveMethodRef,
    resolveLdc,
  };
}

function skipAttributes(reader) {
  const count = reader.u2();

  for (let index = 0; index < count; index += 1) {
    reader.u2();
    const length = reader.u4();
    reader.bytes(length);
  }
}

function readInterfaces(reader, getClassName) {
  const interfaceCount = reader.u2();
  const interfaces = [];

  for (let index = 0; index < interfaceCount; index += 1) {
    interfaces.push(getClassName(reader.u2()));
  }

  return interfaces;
}

function readFields(reader, getUtf8) {
  const fieldCount = reader.u2();
  const fields = [];

  for (let index = 0; index < fieldCount; index += 1) {
    const fieldAccessFlags = reader.u2();
    const fieldName = getUtf8(reader.u2());
    const fieldDescriptor = getUtf8(reader.u2());
    skipAttributes(reader);

    fields.push({
      accessFlags: fieldAccessFlags,
      name: fieldName,
      descriptor: fieldDescriptor,
    });
  }

  return fields;
}

function readMethodCodeAttribute(reader) {
  reader.u2();
  reader.u2();
  const codeLength = reader.u4();
  const codeBytes = new Uint8Array(reader.bytes(codeLength));

  const exceptionTableLength = reader.u2();
  for (let exIndex = 0; exIndex < exceptionTableLength; exIndex += 1) {
    reader.u2();
    reader.u2();
    reader.u2();
    reader.u2();
  }

  skipAttributes(reader);
  return {
    codeLength,
    codeBytes,
  };
}

function readMethodAttributes(reader, getUtf8) {
  const attributeCount = reader.u2();
  let codeLength = null;
  let codeBytes = null;

  for (let attrIndex = 0; attrIndex < attributeCount; attrIndex += 1) {
    const attributeName = getUtf8(reader.u2());
    const attributeLength = reader.u4();

    if (attributeName === 'Code') {
      const codeAttribute = readMethodCodeAttribute(reader);
      codeLength = codeAttribute.codeLength;
      codeBytes = codeAttribute.codeBytes;
      continue;
    }

    reader.bytes(attributeLength);
  }

  return {
    codeLength,
    codeBytes,
  };
}

function readMethods(reader, getUtf8) {
  const methodCount = reader.u2();
  const methods = [];

  for (let index = 0; index < methodCount; index += 1) {
    const methodAccessFlags = reader.u2();
    const methodName = getUtf8(reader.u2());
    const methodDescriptor = getUtf8(reader.u2());
    const methodAttributeData = readMethodAttributes(reader, getUtf8);

    methods.push({
      accessFlags: methodAccessFlags,
      name: methodName,
      descriptor: methodDescriptor,
      codeLength: methodAttributeData.codeLength,
      codeBytes: methodAttributeData.codeBytes,
    });
  }

  return methods;
}

function readClassAttributes(reader, getUtf8) {
  const attributeCount = reader.u2();
  let sourceFile = '';

  for (let index = 0; index < attributeCount; index += 1) {
    const attributeName = getUtf8(reader.u2());
    const attributeLength = reader.u4();

    if (attributeName === 'SourceFile' && attributeLength === 2) {
      sourceFile = getUtf8(reader.u2());
      continue;
    }

    reader.bytes(attributeLength);
  }

  return {
    sourceFile,
  };
}

function parseClassFile(buffer) {
  const reader = createReader(buffer);
  const magic = reader.u4();

  if (magic !== 0xcafebabe) {
    throw new Error('Not a valid Java .class file (missing CAFEBABE header).');
  }

  const minorVersion = reader.u2();
  const majorVersion = reader.u2();
  const constantPool = parseConstantPool(reader);
  const { getUtf8, getClassName } = createConstantPoolResolvers(constantPool);

  const accessFlags = reader.u2();
  const thisClassIndex = reader.u2();
  const superClassIndex = reader.u2();
  const interfaces = readInterfaces(reader, getClassName);
  const fields = readFields(reader, getUtf8);
  const methods = readMethods(reader, getUtf8);
  const classAttributes = readClassAttributes(reader, getUtf8);

  return {
    majorVersion,
    minorVersion,
    accessFlags,
    className: getClassName(thisClassIndex),
    superClassName: getClassName(superClassIndex),
    interfaces,
    fields,
    methods,
    sourceFile: classAttributes.sourceFile,
    constantPool,
  };
}

function simpleName(fullName) {
  if (!fullName) {
    return '';
  }

  const parts = fullName.split('.');
  return parts[parts.length - 1].split('$').pop() || '';
}

function sanitizeJavaIdentifier(name) {
  const trimmed = `${name || ''}`.trim();

  if (!trimmed) {
    return '';
  }

  const normalized = trimmed.replaceAll(/[^A-Za-z0-9_$]/g, '_');
  const startsWithDigit = /^\d/.test(normalized);

  return startsWithDigit ? `_${normalized}` : normalized;
}

function deriveClassSimpleName(classInfo, fallbackFileName) {
  const fromClassName = sanitizeJavaIdentifier(simpleName(classInfo.className));

  if (fromClassName) {
    return fromClassName;
  }

  const fromSourceFile = sanitizeJavaIdentifier(
    (classInfo.sourceFile || '').replace(/\.java$/i, ''),
  );

  if (fromSourceFile) {
    return fromSourceFile;
  }

  const fallback = sanitizeJavaIdentifier(simpleName(fallbackFileName));
  return fallback || 'DecompiledClass';
}

function getDefaultReturnLiteral(returnType) {
  if (returnType === 'void') {
    return '';
  }

  if (returnType === 'boolean') {
    return 'false';
  }

  if (returnType === 'char') {
    return String.raw`'\0'`;
  }

  if (['byte', 'short', 'int', 'long', 'float', 'double'].includes(returnType)) {
    return '0';
  }

  return 'null';
}

function normalizeOwner(owner) {
  return owner.replaceAll('/', '.');
}

function isStaticMethod(accessFlags) {
  return (accessFlags & 0x0008) !== 0;
}

function localName(index, parameterNames, isStatic) {
  if (!isStatic) {
    if (index === 0) {
      return 'this';
    }

    const parameterIndex = index - 1;
    return parameterNames[parameterIndex] || `var${index}`;
  }

  return parameterNames[index] || `var${index}`;
}

function readSignedByte(codeBytes, pc) {
  const value = codeBytes[pc];
  return value > 127 ? value - 256 : value;
}

function readSignedShort(codeBytes, pc) {
  const value = (codeBytes[pc] << 8) | codeBytes[pc + 1];
  return value > 32767 ? value - 65536 : value;
}

function appendLine(lines, statement) {
  if (statement) {
    lines.push(statement);
  }
}

function decompileMethodBody(method, parameterNames, className, resolvers) { // NOSONAR
  const codeBytes = method.codeBytes;

  if (!codeBytes?.length) {
    return [];
  }

  const lines = [];
  const stack = [];
  const staticMethod = isStaticMethod(method.accessFlags);
  let pc = 0;

  function push(value) {
    stack.push(value || '/* unknown */');
  }

  function pop() {
    return stack.pop() || '/* unknown */';
  }

  while (pc < codeBytes.length) {
    const opcode = codeBytes[pc];
    pc += 1;

    if (opcode >= 0x1a && opcode <= 0x1d) {
      push(localName(opcode - 0x1a, parameterNames, staticMethod));
      continue;
    }

    if (opcode >= 0x2a && opcode <= 0x2d) {
      push(localName(opcode - 0x2a, parameterNames, staticMethod));
      continue;
    }

    if (opcode >= 0x3b && opcode <= 0x3e) {
      const idx = opcode - 0x3b;
      appendLine(lines, `${localName(idx, parameterNames, staticMethod)} = ${pop()};`);
      continue;
    }

    if (opcode >= 0x4b && opcode <= 0x4e) {
      const idx = opcode - 0x4b;
      appendLine(lines, `${localName(idx, parameterNames, staticMethod)} = ${pop()};`);
      continue;
    }

    if (opcode >= 0x02 && opcode <= 0x08) {
      push(String(opcode - 0x03));
      continue;
    }

    if (opcode === 0x01) {
      push('null');
      continue;
    }

    if (opcode === 0x10) {
      push(String(readSignedByte(codeBytes, pc)));
      pc += 1;
      continue;
    }

    if (opcode === 0x11) {
      push(String(readSignedShort(codeBytes, pc)));
      pc += 2;
      continue;
    }

    if (opcode === 0x12) {
      const index = codeBytes[pc];
      pc += 1;
      push(resolvers.resolveLdc(index));
      continue;
    }

    if (opcode === 0x13 || opcode === 0x14) {
      const index = (codeBytes[pc] << 8) | codeBytes[pc + 1];
      pc += 2;
      push(resolvers.resolveLdc(index));
      continue;
    }

    if (opcode === 0x15 || opcode === 0x19) {
      const index = codeBytes[pc];
      pc += 1;
      push(localName(index, parameterNames, staticMethod));
      continue;
    }

    if (opcode === 0x36 || opcode === 0x3a) {
      const index = codeBytes[pc];
      pc += 1;
      appendLine(lines, `${localName(index, parameterNames, staticMethod)} = ${pop()};`);
      continue;
    }

    if (opcode === 0x59) {
      const value = pop();
      push(value);
      push(value);
      continue;
    }

    if (opcode === 0x60 || opcode === 0x64 || opcode === 0x68 || opcode === 0x6c) {
      const right = pop();
      const left = pop();
      const operatorMap = {
        0x60: '+',
        0x64: '-',
        0x68: '*',
        0x6c: '/',
      };
      const operator = operatorMap[opcode] || '+';
      push(`(${left} ${operator} ${right})`);
      continue;
    }

    if (opcode === 0x84) {
      const index = codeBytes[pc];
      const delta = readSignedByte(codeBytes, pc + 1);
      pc += 2;
      const op = delta >= 0 ? '+' : '-';
      appendLine(lines, `${localName(index, parameterNames, staticMethod)} ${op}= ${Math.abs(delta)};`);
      continue;
    }

    if (opcode === 0xbb) {
      const classIndex = (codeBytes[pc] << 8) | codeBytes[pc + 1];
      pc += 2;
      push(`new ${normalizeOwner(resolvers.getClassName(classIndex))}`);
      continue;
    }

    if (opcode === 0xb2 || opcode === 0xb3 || opcode === 0xb4 || opcode === 0xb5) {
      const fieldIndex = (codeBytes[pc] << 8) | codeBytes[pc + 1];
      pc += 2;
      const field = resolvers.resolveFieldRef(fieldIndex);
      const owner = normalizeOwner(field.owner);
      const fieldExpr = `${owner}.${field.name}`;

      if (opcode === 0xb2) {
        push(fieldExpr);
      } else if (opcode === 0xb3) {
        appendLine(lines, `${fieldExpr} = ${pop()};`);
      } else if (opcode === 0xb4) {
        const target = pop();
        push(`${target}.${field.name}`);
      } else {
        const value = pop();
        const target = pop();
        appendLine(lines, `${target}.${field.name} = ${value};`);
      }

      continue;
    }

    if (opcode === 0xb6 || opcode === 0xb7 || opcode === 0xb8 || opcode === 0xb9) {
      const methodIndex = (codeBytes[pc] << 8) | codeBytes[pc + 1];
      pc += 2;

      if (opcode === 0xb9) {
        pc += 2;
      }

      const ref = resolvers.resolveMethodRef(methodIndex);
      const owner = normalizeOwner(ref.owner);
      const refDescriptor = parseMethodDescriptor(ref.descriptor || '()V');
      const args = [];

      for (let i = refDescriptor.parameters.length - 1; i >= 0; i -= 1) {
        args.unshift(pop());
      }

      const argText = args.join(', ');
      const isStaticCall = opcode === 0xb8;
      const target = isStaticCall ? '' : pop();
      let callExpr = '';

      if (ref.name === '<init>') {
        if (target.startsWith('new ')) {
          callExpr = `${target}(${argText})`;
          push(callExpr);
        } else if (target === 'this' && owner !== className && owner !== 'java.lang.Object') {
          appendLine(lines, `super(${argText});`);
        } else if (target === 'this' && owner === className) {
          appendLine(lines, `this(${argText});`);
        } else if (target === 'this' && owner === 'java.lang.Object') {
          appendLine(lines, `super(${argText});`);
        } else {
          appendLine(lines, `${target}.${simpleName(owner)}(${argText});`);
        }
      } else {
        callExpr = isStaticCall
          ? `${owner}.${ref.name}(${argText})`
          : `${target}.${ref.name}(${argText})`;

        if (refDescriptor.returnType === 'void') {
          appendLine(lines, `${callExpr};`);
        } else {
          push(callExpr);
        }
      }

      continue;
    }

    if (opcode === 0xac || opcode === 0xad || opcode === 0xae || opcode === 0xaf || opcode === 0xb0) {
      appendLine(lines, `return ${pop()};`);
      continue;
    }

    if (opcode === 0xb1) {
      appendLine(lines, 'return;');
      continue;
    }

    if ((opcode >= 0x99 && opcode <= 0xa7) || opcode === 0xc6 || opcode === 0xc7 || opcode === 0xc8) {
      const wideBranch = opcode === 0xc8;
      const offset = wideBranch
        ? ((codeBytes[pc] << 24) | (codeBytes[pc + 1] << 16) | (codeBytes[pc + 2] << 8) | codeBytes[pc + 3])
        : readSignedShort(codeBytes, pc);
      pc += wideBranch ? 4 : 2;
      appendLine(lines, `// control flow branch (offset ${offset})`);
      continue;
    }

    appendLine(lines, `// unsupported opcode 0x${opcode.toString(16).padStart(2, '0')}`);
    break;
  }

  return lines;
}

function renderField(field) {
  const flags = collectFlags(field.accessFlags, FIELD_ACCESS_FLAGS);
  const type = parseTypeDescriptor(field.descriptor).type;
  return `  ${[...flags, type, field.name].filter(Boolean).join(' ')};`;
}

function renderMethod(method, className, resolvers) {
  const flags = collectFlags(method.accessFlags, METHOD_ACCESS_FLAGS);
  const parsed = parseMethodDescriptor(method.descriptor);
  const parameterNames = parsed.parameters.map((_, index) => `arg${index + 1}`);
  const params = parsed.parameters.map((type, index) => `${type} ${parameterNames[index]}`).join(', ');

  if (method.name === '<clinit>') {
    const bodyLines = decompileMethodBody(method, parameterNames, className, resolvers);

    return [
      '  static {',
      ...(bodyLines.length
        ? bodyLines.map((line) => `    ${line}`)
        : [`    // Bytecode length: ${method.codeLength ?? 0} bytes`]),
      '  }',
    ].join('\n');
  }

  if (method.name === '<init>') {
    const bodyLines = decompileMethodBody(method, parameterNames, className, resolvers);

    return [
      `  ${[...flags, className].filter(Boolean).join(' ')}(${params}) {`,
      ...(bodyLines.length
        ? bodyLines.map((line) => `    ${line}`)
        : [`    // Bytecode length: ${method.codeLength ?? 0} bytes`]),
      '  }',
    ].join('\n');
  }

  const signature = [
    ...flags,
    parsed.returnType,
    method.name,
  ].filter(Boolean).join(' ');

  const bodyLines = decompileMethodBody(method, parameterNames, className, resolvers);
  const fallbackBody =
    parsed.returnType === 'void'
      ? [`// Bytecode length: ${method.codeLength ?? 0} bytes`]
      : [`return ${getDefaultReturnLiteral(parsed.returnType)};`];
  const linesToUse = bodyLines.length ? bodyLines : fallbackBody;

  return [
    `  ${signature}(${params}) {`,
    ...linesToUse.map((line) => `    ${line}`),
    '  }',
  ].join('\n');
}

function detectClassKind(accessFlags) {
  if (accessFlags & 0x2000) {
    return '@interface';
  }

  if (accessFlags & 0x4000) {
    return 'enum';
  }

  if (accessFlags & 0x0200) {
    return 'interface';
  }

  return 'class';
}

function buildJavaSkeleton(classInfo, fallbackFileName = 'Unknown') {
  const resolvers = createConstantPoolResolvers(classInfo.constantPool || []);
  const className = deriveClassSimpleName(classInfo, fallbackFileName);
  const packageName = classInfo.className.includes('.')
    ? classInfo.className.slice(0, classInfo.className.lastIndexOf('.'))
    : '';

  const classFlags = collectFlags(classInfo.accessFlags, CLASS_ACCESS_FLAGS)
    .filter((flag) => !['interface', '@interface', 'enum'].includes(flag));

  const kind = detectClassKind(classInfo.accessFlags);

  const extendsClause =
    classInfo.superClassName && classInfo.superClassName !== 'java.lang.Object' && kind === 'class'
      ? ` extends ${classInfo.superClassName}`
      : '';

  const implementsKeyword = kind === 'interface' ? 'extends' : 'implements';
  const implementsClause = classInfo.interfaces.length
    ? ` ${implementsKeyword} ${classInfo.interfaces.join(', ')}`
    : '';

  const lines = [];

  if (packageName) {
    lines.push(`package ${packageName};`, '');
  }

  lines.push(
    '/**',
    ' * Decompiled by Toolfox Java Decompiler v1.',
    ' * Output is reconstructed and may differ from original source.',
    ` * Class file version: ${classInfo.majorVersion}.${classInfo.minorVersion}`,
    ' */',
    `${[...classFlags, kind, className].filter(Boolean).join(' ')}${extendsClause}${implementsClause} {`,
  );

  if (!classInfo.fields.length && !classInfo.methods.length) {
    lines.push('  // No fields or methods found.');
  }

  if (classInfo.fields.length) {
    classInfo.fields.forEach((field) => {
      try {
        lines.push(renderField(field));
      } catch {
        lines.push(`  // Unable to decode field descriptor for ${field.name}`);
      }
    });
    lines.push('');
  }

  classInfo.methods.forEach((method, index) => {
    try {
      lines.push(renderMethod(method, className, resolvers));
    } catch {
      lines.push(`  // Unable to decode method signature for ${method.name}`);
    }

    if (index < classInfo.methods.length - 1) {
      lines.push('');
    }
  });

  lines.push('}');

  return lines.join('\n');
}

globalThis.onmessage = (event) => {
  const { type, payload } = event.data ?? {};

  if (type !== 'decompile') {
    globalThis.postMessage({
      success: false,
      error: {
        message: `Unknown worker operation: ${type}`,
      },
    });
    return;
  }

  try {
    const fileName = payload?.fileName || 'Unknown.class';
    const baseName = fileName.replace(/\.class$/i, '') || 'Unknown';
    const buffer = payload?.buffer;

    if (!(buffer instanceof ArrayBuffer)) {
      throw new TypeError('Missing class file data.');
    }

    const classInfo = parseClassFile(buffer);
    const javaSource = buildJavaSkeleton(classInfo, baseName);

    globalThis.postMessage({
      success: true,
      result: {
        javaSource,
        metadata: {
          className: classInfo.className || baseName,
          declarationName: deriveClassSimpleName(classInfo, baseName),
          javaVersion: `${classInfo.majorVersion}.${classInfo.minorVersion}`,
          fields: classInfo.fields.length,
          methods: classInfo.methods.length,
        },
      },
    });
  } catch (error) {
    globalThis.postMessage({
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Failed to decompile class file.',
      },
    });
  }
};
