import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
const reference = process.argv[2];
const actualPath = process.argv[3];
if (!reference || !actualPath) throw new Error('Usage: node scripts/compare-reference.mjs <reference.png> <actual.png> [output-directory]');
const output = path.resolve(process.argv[4] ?? '../artifacts/auth-comparison');
await fs.mkdir(output, { recursive: true });
const width=1586,height=992;
const original=await sharp(reference).resize(width,height,{fit:'fill'}).removeAlpha().raw().toBuffer();
const actual=await sharp(actualPath).resize(width,height,{fit:'fill'}).removeAlpha().raw().toBuffer();
const overlay=Buffer.alloc(original.length),diff=Buffer.alloc(original.length);
for(let i=0;i<original.length;i++){overlay[i]=Math.round((original[i]+actual[i])/2);diff[i]=255-Math.min(255,Math.abs(original[i]-actual[i])*3)}
await sharp(overlay,{raw:{width,height,channels:3}}).png().toFile(path.join(output, 'reference-overlay.png'));
await sharp(diff,{raw:{width,height,channels:3}}).png().toFile(path.join(output, 'reference-diff.png'));
console.log('Saved 50% overlay and amplified pixel difference. These are visual QA artifacts, not a claimed similarity score.');
