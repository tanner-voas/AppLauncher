import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('packaged launcher enforces a same-origin script policy and retains required app resource classes',()=>{
 const source=read('_headers'),packaged=read('dist/_headers');assert.equal(packaged,source);
 assert.match(packaged,/script-src 'self';/);assert.match(packaged,/object-src 'none'/);assert.match(packaged,/base-uri 'none'/);assert.match(packaged,/frame-ancestors 'none'/);
 assert.match(packaged,/worker-src 'self' blob:/);assert.match(packaged,/font-src 'self' data: blob:/);assert.match(packaged,/connect-src 'self' https:\/\/cdn\.jsdelivr\.net https:\/\/\*\.tts\.speech\.microsoft\.com/);
 const html=read('dist/index.html');for(const match of html.matchAll(/<script\b([^>]*)>/gi))assert.match(match[1],/\bsrc=/i);assert.doesNotMatch(html,/\bon(?:click|load|error)\s*=/i);
});
