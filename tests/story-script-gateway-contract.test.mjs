import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const gateway = await readFile(new URL('../src/story-script-gateway.js', import.meta.url), 'utf8');

assert.match(gateway, /const source = String\(body\?\.script \?\? ''\)\.replace\(\/\\r\\n\?\/g, '\\n'\)/);
assert.doesNotMatch(gateway, /cleanText\(body\?\.script,\s*24000\)/, 'Gateway must not silently truncate GM source before compiler size validation.');
assert.match(gateway, /compileStoryScript\(source\)/);

console.log('Story Script gateway preserves submitted source for compiler size validation.');
