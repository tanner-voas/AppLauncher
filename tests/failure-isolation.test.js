import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const copy=(source,target)=>fs.cpSync(path.join(ROOT,source),path.join(target,source),{recursive:true});
function fakeApp(dir,name,fails=false){
 const app=path.join(dir,'apps',name);fs.mkdirSync(app,{recursive:true});
 fs.writeFileSync(path.join(app,'package.json'),JSON.stringify({version:'1.2.3'}));
 fs.writeFileSync(path.join(app,'package.py'),fails?'raise RuntimeError("intentional build failure")\n':`from pathlib import Path\np=Path('dist/${name}')\np.mkdir(parents=True,exist_ok=True)\n(p/'app.js').write_text('export const ok=true')\n(p/'styles.css').write_text('body{}')\n`);
}
test('a failed app and absent submodule do not block a healthy app or service worker',async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'wg-launcher-test-'));
 try{
  for(const p of ['build.py','index.html','launcher.js','workspace.css','pwa-update.js','viewport-lock.js','sw.template.js','manifest.webmanifest','_headers','package.json','icons','shared/google-drive/src'])copy(p,temp);
  const app=name=>({id:name,name, glyph:name[0],source:`apps/${name}`,destination:`apps/${name}`,distribution:`dist/${name}`,module:`./apps/${name}/app.js`,stylesheet:`./apps/${name}/styles.css`});
  fs.writeFileSync(path.join(temp,'apps.json'),JSON.stringify({apps:[app('good'),app('broken'),app('missing')]}));
  fakeApp(temp,'good');fakeApp(temp,'broken',true);
  const output=execFileSync('python3',['build.py','--allow-partial'],{cwd:temp,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  // Production mode must fail closed, even though preview mode tolerates failures.
  const strict=await import('node:child_process').then(m=>m.spawnSync('python3',['build.py'],{cwd:temp,encoding:'utf8'}));
  assert.notEqual(strict.status,0);
  assert.match(strict.stderr,/Strict release|pinned Git/);

  assert.match(output,/1 ready, 2 failed/);
  const registry=fs.readFileSync(path.join(temp,'dist/apps-registry.js'),'utf8');
  assert.match(registry,/"id":"good".*"status":"ready"/);
  assert.match(registry,/"id":"broken".*"status":"failed"/);
  assert.match(registry,/"id":"missing".*"status":"failed"/);
  assert.equal(fs.existsSync(path.join(temp,'dist/apps/good/app.js')),true);
  assert.equal(fs.existsSync(path.join(temp,'dist/apps/broken/app.js')),false);
  const sw=fs.readFileSync(path.join(temp,'dist/sw.js'),'utf8');
  assert.match(sw,/apps\/good\/app.js/);
  assert.doesNotMatch(sw,/apps\/broken\/app.js/);
  assert.doesNotMatch(sw,/apps\/missing\/app.js/);
  const {homeScreen,appLaunchUrl}=await import(pathToFileURL(path.join(temp,'dist','launcher.js')));
  const html=homeScreen('https://example.org/');
  assert.match(html,/data-launch-app="good"/);
  assert.match(html,/BUILD FAILED/);
  assert.match(html,/launcher-tile-failed/);
  assert.doesNotMatch(html,/data-launch-app="broken"/);
  assert.throws(()=>appLaunchUrl('https://example.org/','broken'),/unavailable/);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});

test('tile artwork is copied from the source app and missing artwork fails only that app',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'wg-launcher-art-test-'));
 try{
  for(const p of ['build.py','index.html','launcher.js','workspace.css','pwa-update.js','viewport-lock.js','sw.template.js','manifest.webmanifest','_headers','package.json','icons','shared/google-drive/src'])copy(p,temp);
  const app=name=>({id:name,name,glyph:'◇',source:`apps/${name}`,destination:`apps/${name}`,distribution:`dist/${name}`,module:`./apps/${name}/app.js`,stylesheet:`./apps/${name}/styles.css`,tile_icon:'icons/icon-192.png'});
  fs.writeFileSync(path.join(temp,'apps.json'),JSON.stringify({apps:[app('art'),app('missing-art')]}));
  fakeApp(temp,'art');fakeApp(temp,'missing-art');
  fs.mkdirSync(path.join(temp,'apps','art','icons'),{recursive:true});
  const bytes=fs.readFileSync(path.join(ROOT,'apps/worldgen/icons/icon-192.png'));
  fs.writeFileSync(path.join(temp,'apps','art','icons/icon-192.png'),bytes);
  const output=execFileSync('python3',['build.py','--allow-partial'],{cwd:temp,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  assert.match(output,/1 ready, 1 failed/);
  assert.ok(fs.readFileSync(path.join(temp,'dist/apps/art/icons/icon-192.png')).equals(bytes));
  assert.ok(!fs.existsSync(path.join(temp,'dist/apps/missing-art/icons/icon-192.png')));
  const registry=fs.readFileSync(path.join(temp,'dist/apps-registry.js'),'utf8');
  assert.match(registry,/"id":"art".*"icon":"\.\/apps\/art\/icons\/icon-192\.png"/);
  assert.match(registry,/"id":"missing-art".*"status":"failed"/);
  assert.match(fs.readFileSync(path.join(temp,'dist/sw.js'),'utf8'),/apps\/art\/icons\/icon-192\.png/);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
