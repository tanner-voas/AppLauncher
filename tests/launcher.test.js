import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {APPS} from '../dist/apps-registry.js';
import {LAUNCHER_VERSION} from '../dist/launcher-meta.js';
import {homeScreen,appLaunchUrl,activeAppId,launcherUrl,installHostApi} from '../dist/launcher.js';

const read=(f)=>fs.readFileSync(new URL('../dist/'+f,import.meta.url),'utf8');
test('v0.1.5 displays host and all four application versions without changing workspace structure',()=>{
  assert.equal(APPS.length,4);
  assert.deepEqual(APPS.map(a=>a.id),['ciyan','worldgen','ascendant','gitmanager']);
  assert.ok(APPS.every(app=>app.status==='ready'));
  assert.equal(APPS[0].id,'ciyan');
  assert.match(APPS[0].version,/^\d+\.\d+\.\d+$/);
  assert.equal(APPS[0].module,'./app.js');
  const html=homeScreen('https://ciyan.example/');
  assert.match(html,/launcher-workspace-title">Workspace /);
  assert.match(html,/class="launcher-actions">.*data-show-versions.*data-update-launcher/s);
  assert.match(read('workspace.css'),/grid-template-columns:minmax\(0,1fr\) auto/);
  assert.equal(LAUNCHER_VERSION,JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8')).version);
  assert.match(html,new RegExp('class=\"launcher-version\">v'+LAUNCHER_VERSION.replaceAll('.','\\.')+'<'));
  assert.match(html,new RegExp('class=\"launcher-tile-version\">v'+APPS[0].version.replaceAll('.','\\.')+'<'));
  assert.match(read('launcher-meta.js'),/LAUNCHER_VERSION/);
  assert.match(html,/data-update-launcher/);
  assert.match(html,/data-launch-app="ciyan"/);
  assert.match(html,/data-launch-app="worldgen"/);
  assert.match(html,/WorldGen/);
  assert.match(html,/data-launch-app="ascendant"/);
  assert.match(html,/class="icon-btn launcher-service" data-launch-app="gitmanager"/);
  assert.doesNotMatch(html,/class="launcher-tile" data-launch-app="gitmanager"/);
  assert.equal(APPS[3].serviceButton,true);
  assert.ok(fs.existsSync(new URL('../dist/apps/gitmanager/app.js',import.meta.url)));
  assert.equal(APPS[2].icon,'./apps/ascendant/icons/icon-192.png');
  assert.ok(fs.existsSync(new URL('../dist/apps/ascendant/engine.js',import.meta.url)));
  assert.ok(fs.existsSync(new URL('../dist/apps/ascendant/maps.js',import.meta.url)));
  assert.equal(appLaunchUrl('https://ciyan.example/','ascendant'),'https://ciyan.example/?app=ascendant');
  assert.equal(APPS[0].icon,undefined); // Cíyán keeps its existing character tile.
  assert.equal(APPS[1].icon,'./apps/worldgen/icons/icon-192.png');
  assert.match(html,/<img src="\.\/apps\/worldgen\/icons\/icon-192\.png" alt=""/);
  assert.match(html,/launcher-tile-icon-art/);
  assert.ok(fs.readFileSync(new URL('../dist/apps/worldgen/icons/icon-192.png',import.meta.url)).equals(
    fs.readFileSync(new URL('../apps/worldgen/icons/icon-192.png',import.meta.url))));
  assert.doesNotMatch(html,/Installed apps|Your apps, in one place|launcher-monogram/);
  assert.match(read('index.html'),/src="\.\/launcher\.js"/);
  assert.doesNotMatch(read('index.html'),/src="\.\/app\.js"/);
});

test('app URLs and app asset URLs retain legacy origin and root paths',()=>{
  const base='https://ciyan.example/';
  assert.equal(appLaunchUrl(base,'ciyan'),base+'?app=ciyan');
  assert.equal(launcherUrl(base+'?app=ciyan'),base);
  assert.equal(activeAppId(base+'?app=ciyan'),'ciyan');
  assert.equal(activeAppId(base),null);
  assert.throws(()=>appLaunchUrl(base,'unknown'),/unavailable/);
  assert.equal(appLaunchUrl(base,'worldgen'),base+'?app=worldgen');
  assert.ok(fs.existsSync(new URL('../dist/apps/worldgen/app.js',import.meta.url)));
  assert.ok(fs.existsSync(new URL('../dist/apps/worldgen/compute-worker.js',import.meta.url)));
  assert.ok(fs.existsSync(new URL('../dist/app.js',import.meta.url)));
  if(APPS[0].version!=='0.8.16')assert.ok(fs.existsSync(new URL('../dist/app-host-bridge.js',import.meta.url)));
  assert.ok(fs.existsSync(new URL('../dist/chapters/index.js',import.meta.url)));
});

test('PWA identity, viewport lock and app storage survive migration',()=>{
  const manifest=JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.id,'./');
  assert.equal(manifest.name,'AppLauncher — My Workspace');
  assert.equal(manifest.short_name,'Launcher');
  assert.equal(manifest.start_url,'./');
  assert.doesNotMatch(read('index.html'),/maximum-scale|user-scalable=no/);
  assert.doesNotMatch(read('viewport-lock.js'),/preventDefault|addEventListener/);
  assert.match(read('app.js'),/await loadState\(\)/);
  assert.match(read('app.js'),/await reader.flush\(\)/);
  if(APPS[0].version!=='0.8.16'){
    assert.match(read('app.js'),/await returnToLauncher\(\)/);
    assert.ok(fs.existsSync(new URL('../dist/app-host-bridge.js',import.meta.url)));
  }
});

test('service worker generates a unique content hash and caches the launcher and app',()=>{
  const script=read('sw.js');
  assert.ok(script.includes('app-launcher-shell-v'+LAUNCHER_VERSION+'-'));
  assert.match(script,/app-launcher-shell-v[0-9.]+-[a-f0-9]{16}/);
  assert.match(script,/"\.\/index\.html"/);
  if(APPS[0].version!=='0.8.16')assert.match(script,/"\.\/app-host-bridge\.js"/);
  assert.match(script,/"\.\/master-data\.js"/);
  assert.match(script,/"\.\/apps-registry\.js"/);
  assert.match(script,/"\.\/apps\/worldgen\/compute-worker\.js"/);
  assert.match(script,/"\.\/apps\/worldgen\/icons\/icon-192\.png"/);
  assert.match(script,/"\.\/apps\/ascendant\/engine\.js"/);
  assert.match(script,/"\.\/apps\/ascendant\/icons\/icon-192\.png"/);
  assert.match(script,/navigationResponse\(result\)/);
  assert.match(script,/new Response\(response\.body/);
  assert.match(script,/const CACHE_PREFIXES=\["app-launcher-shell-","ciyan-shell-"\]/);
  assert.match(script,/CACHE_PREFIXES\.some\(prefix=>k\.startsWith\(prefix\)\)/);
  assert.doesNotMatch(script,/ciyan-reader-content|ciyan-user-fonts/);
});

test('packaged Ciyan host bridge exits through a safe history replacement and PWA reload',async()=>{
  const oldLocation=globalThis.location,oldHistory=globalThis.history,oldHost=globalThis.__APP_LAUNCHER__;
  try {
    let changes=[],reloads=0;
    globalThis.location={href:'https://ciyan.example/?app=ciyan',reload(){reloads++}};
    globalThis.history={replaceState(_a,_b,to){changes.push(to);}};
    installHostApi();
    assert.equal(typeof globalThis.__APP_LAUNCHER__.runUpdateButton,'function');
    if(APPS[0].version==='0.8.16')globalThis.__APP_LAUNCHER__.returnToLauncher();
    else{
      const bridge=await import('../dist/app-host-bridge.js');
      assert.equal(bridge.hasLauncherHost(),true);
      await bridge.returnToLauncher();
    }
    assert.deepEqual(changes,['https://ciyan.example/']);
    assert.equal(reloads,1);
  }finally {
    globalThis.location=oldLocation;globalThis.history=oldHistory;globalThis.__APP_LAUNCHER__=oldHost;
  }
});

test('generated service worker preserves Safari navigation response semantics',async()=>{
  const handlers={},lookups=[];
  const original={status:200,statusText:'OK',headers:{get(){return null}},body:'<html>ok</html>',redirected:true};
  const ctx={
    URL, Request:class {constructor(url,options){this.url=url;this.cache=options?.cache;}},
    Response:class {constructor(body,options){this.body=body;this.status=options.status;this.headers=options.headers;this.redirected=false;}},
    caches:{open:async()=>({match:async key=>{if(String(key).endsWith('__offline_release_metadata__'))return undefined;lookups.push(String(key));return original;}})},
    fetch:async()=>{throw new Error('should use cached shell')},
    self:{location:{origin:'https://ciyan.example'},registration:{scope:'https://ciyan.example/'},addEventListener:(name,handler)=>handlers[name]=handler}
  };
  vm.runInNewContext(read('sw.js'),ctx);
  for (const url of ['https://ciyan.example/','https://ciyan.example/?app=ciyan','https://ciyan.example/?app=worldgen']) {
    let task;
    handlers.fetch({request:{url,method:'GET',mode:'navigate'},respondWith:promise=>task=promise});
    const result=await task;
    assert.equal(result.status,200);assert.equal(result.redirected,false);
  }
  assert.deepEqual(lookups,['https://ciyan.example/index.html','https://ciyan.example/index.html','https://ciyan.example/index.html']);
});
