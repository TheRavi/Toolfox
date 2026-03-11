const WORDS = [
  'lorem',
  'ipsum',
  'dolor',
  'sit',
  'amet',
  'consectetur',
  'adipiscing',
  'elit',
  'sed',
  'do',
  'eiusmod',
  'tempor',
  'incididunt',
  'ut',
  'labore',
  'et',
  'dolore',
  'magna',
  'aliqua',
  'ut',
  'enim',
  'ad',
  'minim',
  'veniam',
  'quis',
  'nostrud',
  'exercitation',
  'ullamco',
  'laboris',
  'nisi',
  'ut',
  'aliquip',
  'ex',
  'ea',
  'commodo',
  'consequat',
  'duis',
  'aute',
  'irure',
  'dolor',
  'in',
  'reprehenderit',
  'in',
  'voluptate',
  'velit',
  'esse',
  'cillum',
  'dolore',
  'eu',
  'fugiat',
  'nulla',
  'pariatur',
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomWord() {
  return WORDS[randomInt(0, WORDS.length - 1)];
}

function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function createSentence() {
  const count = randomInt(8, 16);
  const words = Array.from({ length: count }, () => randomWord());
  words[0] = capitalize(words[0]);
  return `${words.join(' ')}.`;
}

function createParagraph() {
  const sentenceCount = randomInt(3, 6);
  return Array.from({ length: sentenceCount }, () => createSentence()).join(' ');
}

function buildLoremIpsum(paragraphCount) {
  return Array.from({ length: paragraphCount }, () => createParagraph()).join('\n\n');
}

globalThis.onmessage = (event) => {
  const { type, payload } = event.data ?? {};

  if (type !== 'generate') {
    globalThis.postMessage({
      success: false,
      error: { message: `Unknown operation: ${type}` },
    });
    return;
  }

  try {
    const requestedCount = Number(payload?.paragraphs);
    const safeCount = Number.isFinite(requestedCount)
      ? Math.min(20, Math.max(1, requestedCount))
      : 1;

    const result = buildLoremIpsum(safeCount);

    globalThis.postMessage({
      success: true,
      result,
      paragraphs: safeCount,
    });
  } catch (error) {
    globalThis.postMessage({
      success: false,
      error: { message: error?.message || 'Lorem Ipsum generation failed.' },
    });
  }
};
