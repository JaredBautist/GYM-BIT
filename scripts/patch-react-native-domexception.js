const fs = require('fs');
const path = require('path');

const file = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native',
  'src',
  'private',
  'setup',
  'setUpDOM.js',
);

const anchor = "  initialized = true;\n";
const startMarker = '  // GymBit DOMException polyfill start';
const endMarker = '  // GymBit DOMException polyfill end';
const legacyPatch = `  polyfillGlobal(\n    'DOMException',\n    () => require('../webapis/errors/DOMException').default,\n  );\n\n`;
const patch = `${startMarker}\n  polyfillGlobal('DOMException', () => {\n    const codes = {\n      INDEX_SIZE_ERR: 1,\n      DOMSTRING_SIZE_ERR: 2,\n      HIERARCHY_REQUEST_ERR: 3,\n      WRONG_DOCUMENT_ERR: 4,\n      INVALID_CHARACTER_ERR: 5,\n      NO_DATA_ALLOWED_ERR: 6,\n      NO_MODIFICATION_ALLOWED_ERR: 7,\n      NOT_FOUND_ERR: 8,\n      NOT_SUPPORTED_ERR: 9,\n      INUSE_ATTRIBUTE_ERR: 10,\n      INVALID_STATE_ERR: 11,\n      SYNTAX_ERR: 12,\n      INVALID_MODIFICATION_ERR: 13,\n      NAMESPACE_ERR: 14,\n      INVALID_ACCESS_ERR: 15,\n      VALIDATION_ERR: 16,\n      TYPE_MISMATCH_ERR: 17,\n      SECURITY_ERR: 18,\n      NETWORK_ERR: 19,\n      ABORT_ERR: 20,\n      URL_MISMATCH_ERR: 21,\n      QUOTA_EXCEEDED_ERR: 22,\n      TIMEOUT_ERR: 23,\n      INVALID_NODE_TYPE_ERR: 24,\n      DATA_CLONE_ERR: 25,\n    };\n\n    class GymBitDOMException extends Error {\n      constructor(message = '', name = 'Error') {\n        super(message);\n        this.name = String(name);\n        this.code = codes[this.name] || 0;\n      }\n    }\n\n    for (const code in codes) {\n      Object.defineProperty(GymBitDOMException, code, { enumerable: true, value: codes[code] });\n      Object.defineProperty(GymBitDOMException.prototype, code, { enumerable: true, value: codes[code] });\n    }\n\n    return GymBitDOMException;\n  });\n${endMarker}\n\n`;

if (!fs.existsSync(file)) {
  console.warn('[patch-react-native-domexception] React Native setup file not found, skipping.');
  process.exit(0);
}

let source = fs.readFileSync(file, 'utf8');
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker);
if (start !== -1 && end !== -1) {
  const afterEnd = source.indexOf('\n', end);
  source = source.slice(0, start) + patch + source.slice(afterEnd + 1);
} else if (source.includes(legacyPatch)) {
  source = source.replace(legacyPatch, patch);
} else if (source.includes(anchor)) {
  source = source.replace(anchor, anchor + '\n' + patch);
} else {
  console.warn('[patch-react-native-domexception] Patch anchor not found, skipping.');
  process.exit(0);
}

fs.writeFileSync(file, source);
console.log('[patch-react-native-domexception] DOMException patch applied.');

const expoTextDecoderFile = path.join(
  __dirname,
  '..',
  'node_modules',
  'expo',
  'src',
  'winter',
  'TextDecoder.ts',
);

if (!fs.existsSync(expoTextDecoderFile)) {
  console.warn('[patch-react-native-domexception] Expo TextDecoder file not found, skipping.');
  process.exit(0);
}

let textDecoderSource = fs.readFileSync(expoTextDecoderFile, 'utf8');
const textDecoderBefore = '  constructor(private options: { fatal: boolean }) {}';
const textDecoderAfter = `  private options: { fatal: boolean };

  constructor(options: { fatal: boolean }) {
    this.options = options;
  }`;

if (textDecoderSource.includes(textDecoderBefore)) {
  textDecoderSource = textDecoderSource.replace(textDecoderBefore, textDecoderAfter);
  fs.writeFileSync(expoTextDecoderFile, textDecoderSource);
  console.log('[patch-react-native-domexception] Expo TextDecoder patch applied.');
} else if (textDecoderSource.includes('  constructor(options: { fatal: boolean }) {')) {
  console.log('[patch-react-native-domexception] Expo TextDecoder patch already applied.');
} else {
  console.warn('[patch-react-native-domexception] Expo TextDecoder patch anchor not found, skipping.');
}

function patchFile(relativePath, replacements, label) {
  const target = path.join(__dirname, '..', ...relativePath.split('/'));
  if (!fs.existsSync(target)) {
    console.warn(`[patch-react-native-domexception] ${label} file not found, skipping.`);
    return;
  }

  let content = fs.readFileSync(target, 'utf8');
  let changed = false;

  for (const [before, after] of replacements) {
    if (content.includes(before)) {
      content = content.replace(before, after);
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(target, content);
    console.log(`[patch-react-native-domexception] ${label} patch applied.`);
  } else {
    console.log(`[patch-react-native-domexception] ${label} patch already applied or not needed.`);
  }
}

patchFile(
  'node_modules/expo/src/async-require/fetchAsync.native.ts',
  [
    [
      `  constructor(
    message: string,
    public url: string,
    public isTimeout: boolean,
    options?: ErrorOptions
  ) {
    super(message, options);
  }`,
      `  public url: string;
  public isTimeout: boolean;

  constructor(
    message: string,
    url: string,
    isTimeout: boolean,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.url = url;
    this.isTimeout = isTimeout;
  }`,
    ],
  ],
  'Expo fetchAsync',
);

patchFile(
  'node_modules/expo/src/winter/fetch/FetchResponse.ts',
  [
    [
      `  constructor(private readonly abortCleanupFunction: AbortSubscriptionCleanupFunction) {
    super();
    this.addListener('readyForJSFinalization', this.finalize);
  }`,
      `  private readonly abortCleanupFunction: AbortSubscriptionCleanupFunction;

  constructor(abortCleanupFunction: AbortSubscriptionCleanupFunction) {
    super();
    this.abortCleanupFunction = abortCleanupFunction;
    this.addListener('readyForJSFinalization', this.finalize);
  }`,
    ],
  ],
  'Expo FetchResponse',
);

patchFile(
  'node_modules/expo-auth-session/src/TokenRequest.ts',
  [
    [
      '  constructor(protected request: T) {}',
      `  protected request: T;

  constructor(request: T) {
    this.request = request;
  }`,
    ],
  ],
  'Expo AuthSession TokenRequest',
);
