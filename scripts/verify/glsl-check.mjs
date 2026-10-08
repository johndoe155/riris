/**
 * Parses the hand-written GLSL in a component with three's shader chunks
 * expanded, so a typo is caught without a GPU.
 *
 *   npm i --no-save @shaderfrog/glsl-parser && npm run verify:shaders
 */
// Parse the hand-written GLSL in a component, with three's chunks expanded,
// so a typo in a shader is caught without a browser.
import { parser } from '@shaderfrog/glsl-parser';
import * as THREE from 'three';
import fs from 'node:fs';

// Default to the shared card material: that is where the hand-written GLSL
// lives, so a bare `npm run verify:shaders` actually checks something.
const file = process.argv[2] ?? new URL('../../src/components/canvas/HoloMaterial.tsx', import.meta.url);
const src = fs.readFileSync(file, 'utf8');

/** pull every /* glsl *\/ `...` template out of the file */
function glslBlocks(text) {
  const out = [];
  const re = /\/\*\s*glsl\s*\*\/\s*`([\s\S]*?)`/g;
  let m;
  while ((m = re.exec(text))) out.push({ kind: 'raw', code: m[1] });
  // also: `const vertex = /* glsl */ ...` covered above; grab shader props
  const re2 = /`([\s\S]*?)`/g;
  return out;
}

function expandChunks(code) {
  return code.replace(/<([a-zA-Z0-9_]+)>/g, (all, name) => {
    const chunk = THREE.ShaderChunk[name];
    if (chunk === undefined) return all; // e.g. <common> inside a #include-less block
    return expandChunks(chunk);
  });
}

const blocks = glslBlocks(src);
let checked = 0;
let failed = 0;
for (const { code } of blocks) {
  if (!/void\s+main\s*\(/.test(code)) continue;
  const expanded = expandChunks(code);
  checked++;
  try {
    parser.parse(expanded, { quiet: true });
  } catch (err) {
    failed++;
    const snippet = String(err.message).split('\n').slice(0, 6).join('\n');
    console.log(`FAIL in ${file}:\n${snippet}`);
  }
}
console.log(`${failed ? 'FAILED' : 'OK'} — ${checked} shader(s) parsed in ${file}`);
process.exit(failed ? 1 : 0);
