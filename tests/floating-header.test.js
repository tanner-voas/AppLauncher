import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../workspace.css',import.meta.url),'utf8');
test('UI-01: headers use the intended scroll container',()=>{
 assert.match(css,/html\{[^}]*overflow-x:clip/);
 assert.match(css,/body\{[^}]*overflow-x:clip/);
 assert.match(css,/\.launcher-header\{position:sticky;top:0/);
 assert.match(css,/\.launcher-info-heading\{position:sticky/);
});
