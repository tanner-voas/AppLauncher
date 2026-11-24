import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {DEPENDENCY_TREE,LAUNCHER_VERSION} from '../dist/launcher-meta.js';
import {homeScreen,versionTreeMarkup} from '../dist/launcher.js';

const readPackage=relative=>JSON.parse(fs.readFileSync(new URL('../'+relative+'/package.json',import.meta.url),'utf8'));
test('version tree matches exact packaged versions and remains in mandatory offline shell',()=>{
  const manifest=JSON.parse(fs.readFileSync(new URL('../dist/release-manifest.json',import.meta.url),'utf8'));
  const inventory=JSON.parse(fs.readFileSync(new URL('../dist/offline-inventory.json',import.meta.url),'utf8'));
  assert.deepEqual(DEPENDENCY_TREE,manifest.dependencyTree);
  assert.equal(DEPENDENCY_TREE.name,'AppLauncher');
  assert.equal(DEPENDENCY_TREE.version,LAUNCHER_VERSION);
  assert.equal(DEPENDENCY_TREE.commit,manifest.launcherCommit);
  const [core,shared,ciyan,worldgen,ascendant]=DEPENDENCY_TREE.dependencies;
  assert.equal(core.name,'PWA-Core');
  assert.equal(core.version,readPackage('shared/pwa-core').version);
  assert.match(core.commit,/^[a-f0-9]{40}$/);
  assert.equal(fs.readFileSync(new URL('../dist/pwa-update.js',import.meta.url),'utf8'),fs.readFileSync(new URL('../shared/pwa-core/src/pwa-update.js',import.meta.url),'utf8'));
  assert.equal(fs.readFileSync(new URL('../dist/launcher-offline.js',import.meta.url),'utf8'),fs.readFileSync(new URL('../shared/pwa-core/src/offline-request.js',import.meta.url),'utf8'));
  assert.equal(shared.name,'PWA-GoogleDrive');
  assert.equal(shared.version,readPackage('shared/google-drive').version);
  assert.equal(shared.commit,manifest.sharedProfilesCommit);
  assert.equal(ciyan.name,'Ciyan');
  assert.equal(ciyan.version,readPackage('apps/ciyan').version);
  assert.equal(ciyan.dependencies[0].name,'PWA-GoogleDrive');
  assert.equal(ciyan.dependencies[0].version,readPackage('apps/ciyan/shared/google-drive').version);
  assert.equal(worldgen.version,readPackage('apps/worldgen').version);
  assert.equal(ascendant.version,readPackage('apps/ascendant').version);
  assert.ok(inventory.some(x=>x.path==='./launcher-meta.js'&&x.groups.includes('shell')));
  const html=homeScreen('https://example.org/');
  assert.match(html,/data-show-versions/);
  assert.match(html,/<dialog[^>]+data-version-dialog/);
  assert.match(html,/data-close-versions/);
  assert.match(html,/aria-labelledby="launcher-info-title"/);
});

test('nested pinned packages retain different versions and rendering escapes metadata',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'version-tree-'));
  const git=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  function repo(dir,name,version){
    fs.mkdirSync(dir,{recursive:true});git(dir,'init','-q');git(dir,'config','user.name','Fixture');git(dir,'config','user.email','fixture@example.org');
    fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({name,version}));git(dir,'add','package.json');git(dir,'commit','-qm','package');
  }
  function pin(parent,rel){const sha=git(path.join(parent,rel),'rev-parse','HEAD');git(parent,'update-index','--add','--cacheinfo',`160000,${sha},${rel}`);git(parent,'commit','-qm','pin '+rel);return sha;}
  try{
    repo(temp,'app-launcher','1.0.0');
    repo(path.join(temp,'shared/google-drive'),'pwa-google-drive','2.0.0');pin(temp,'shared/google-drive');
    const child=path.join(temp,'apps/ciyan');repo(child,'ciyan','3.0.0');
    repo(path.join(child,'shared/google-drive'),'pwa-google-drive','1.5.0');pin(child,'shared/google-drive');pin(temp,'apps/ciyan');
    const root=new URL('../',import.meta.url).pathname;
    const code='import sys,json; from pathlib import Path; sys.path.insert(0,sys.argv[1]); from build import dependency_tree; print(json.dumps(dependency_tree(Path(sys.argv[2]), [{"id":"ciyan","source":"apps/ciyan","name":"Ciyan"}], [], strict=True)))';
    const tree=JSON.parse(execFileSync('python3',['-c',code,root,temp],{encoding:'utf8'}));
    assert.equal(tree.dependencies[0].version,'2.0.0');
    assert.equal(tree.dependencies[1].dependencies[0].version,'1.5.0');
    assert.notEqual(tree.dependencies[0].commit,tree.dependencies[1].dependencies[0].commit);
    const html=versionTreeMarkup(tree);
    assert.equal((html.match(/PWA-GoogleDrive/g)||[]).length,2);
    assert.match(html,/v2\.0\.0/);assert.match(html,/v1\.5\.0/);
    assert.doesNotMatch(versionTreeMarkup({name:'<script>',version:'<img>',dependencies:[]}),/<script>|<img>/);
    fs.writeFileSync(path.join(child,'shared/google-drive/package.json'),'{}');
    assert.throws(()=>execFileSync('python3',['-c',code,root,temp],{stdio:'pipe'}),/tracked changes/);
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
