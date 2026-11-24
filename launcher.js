import {runUpdateButton} from './pwa-update.js';
import {offlineRequest} from './launcher-offline.js';
const profileButton='<button type="button" class="pwa-profile-button" data-pwa-profile-button aria-label="Manage profile" title="Manage profile"><svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4.5 21c0-5 3.2-8 7.5-8s7.5 3 7.5 8"/></svg></button>';
import {APPS} from './apps-registry.js';
import {LAUNCHER_VERSION,DEPENDENCY_TREE} from './launcher-meta.js';

// AppLauncher v0.1.6: first-party app tile imagery, with glyph fallback.
// Only the selected app's module is imported; going Home unloads its entire runtime.
// Add future entries here, with their own modules and storage namespaces.
export function launcherUrl(current){return new URL('./',current).href;}
export function appLaunchUrl(current,id){
  if(!APPS.some(app=>app.id===id&&app.status!=='failed'))throw new Error('Application unavailable');
  const next=new URL(launcherUrl(current));next.searchParams.set('app',id);return next.href;
}
export function activeAppId(current){
  const url=new URL(current);const id=url.searchParams.get('app');
  return APPS.some(app=>app.id===id)?id:null;
}

function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));}
// Each dependency is rendered at its own location in the build tree, even
// when another branch has the same name or a different version of that package.
export function versionTreeMarkup(tree){
  const version=tree.version==null?'Version unavailable':`v${escapeHtml(tree.version)}`;
  const children=tree.dependencies||[];
  return `<li><div class="launcher-version-node"><span>${escapeHtml(tree.name)}</span><strong>${version}</strong>${tree.commit?`<code title="${escapeHtml(tree.commit)}">${escapeHtml(tree.commit.slice(0,12))}</code>`:''}</div>${children.length?`<ul>${children.map(versionTreeMarkup).join('')}</ul>`:''}</li>`;
}
function versionDialog(){
  return `<dialog class="launcher-info-dialog" data-version-dialog aria-labelledby="launcher-info-title"><div class="launcher-info-heading"><h2 id="launcher-info-title">Package versions</h2><button type="button" class="icon-btn" data-close-versions aria-label="Close package versions" autofocus>×</button></div><p class="launcher-info-note">Versions and commits packaged in this release. Works offline. Server-side deployments may differ.</p><ul class="launcher-version-tree">${versionTreeMarkup(DEPENDENCY_TREE)}</ul></dialog>`;
}
export function homeScreen(current){
  const failures=APPS.filter(app=>app.status==='failed');
  const tiles=APPS.map(app=>{
    const failed=app.status==='failed';
    const name=escapeHtml(app.name),glyph=escapeHtml(app.glyph),id=escapeHtml(app.id);
    // Preserve the glyph underneath the image as a network/offline fallback.
    // Failed apps retain the existing disabled, gray glyph treatment.
    const artwork=!failed&&app.icon
      ?`<img src="${escapeHtml(app.icon)}" alt="" decoding="async" draggable="false">`:'';
    const common=`<span class="launcher-tile-icon${artwork?' launcher-tile-icon-art':''}" aria-hidden="true">${glyph}${artwork}</span><span class="launcher-tile-name">${name}</span>`;
    if(failed)return `<button type="button" class="launcher-tile launcher-tile-failed" disabled aria-label="${name} unavailable: build failed" title="${escapeHtml(app.reason||'App build failed')}">${common}<span class="launcher-tile-failure">BUILD FAILED</span></button>`;
    return `<a class="launcher-tile" data-launch-app="${id}" href="${appLaunchUrl(current,app.id)}" aria-label="Open ${name}">${common}<span class="launcher-tile-version">v${escapeHtml(app.version)}</span><small class="launcher-offline-state" data-offline-app="${id}"></small></a>`;
  }).join('');
  return `<div class="launcher-screen"><header class="launcher-header"><div class="launcher-heading"><img class="launcher-brand-icon" src="./icons/icon-192.png" alt=""><h1 class="launcher-workspace-title">Workspace <small class="launcher-version">v${LAUNCHER_VERSION}</small></h1></div>
    <div class="launcher-actions">${profileButton}<button type="button" class="launcher-info icon-btn" data-show-versions aria-label="Package versions" title="Package versions"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/></svg></button><button type="button" class="launcher-refresh icon-btn" data-update-launcher aria-label="Check for updates and reload" title="Check for updates and reload">
      <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14-5L3 9V3m0 6h6M4 13a8 8 0 0 0 14 5l3-3v6m0-6h-6"/></svg>
    </button></div></header>
    <nav class="launcher-grid" aria-label="Applications">${tiles}</nav>
    ${failures.length?`<p class="launcher-build-warning" role="status">${failures.length} app${failures.length===1?'':'s'} could not be built. Unavailable apps are shown in gray; other apps are unaffected.</p>`:''}
    <p class="launcher-error" aria-live="polite"></p>${versionDialog()}</div>`;
}

// Launch inside this document. iOS Home Screen PWAs can hand a normal <a>
// navigation to Safari even when its destination is in the manifest scope.
// No Cíyán code runs on the Home Screen until this explicit selection.

// This is the *only* interface an app uses to interact with its host.
// Keep it small so application repositories remain independently developed.
export function installHostApi(){
  globalThis.__APP_LAUNCHER__=Object.freeze({
    runUpdateButton,
    returnToLauncher:()=>{
      history.replaceState(null,'',launcherUrl(location.href));
      location.reload(); // Unload the entire current app runtime.
    }
  });
}

const loadedStyles=new Map();
export function loadAppStyle(app){
  if(!app.stylesheet)return Promise.resolve();
  if(loadedStyles.has(app.stylesheet))return loadedStyles.get(app.stylesheet);
  const promise=new Promise((resolve,reject)=>{
    const link=document.createElement('link');
    link.rel='stylesheet';link.href=app.stylesheet;
    link.onload=resolve;
    link.onerror=()=>{loadedStyles.delete(app.stylesheet);link.remove();reject(new Error(`Failed to load ${app.name} styles`));};
    document.head.append(link);
  });
  loadedStyles.set(app.stylesheet,promise);
  return promise;
}

let launching=false;
export async function launchApp(id){
  const selected=APPS.find(app=>app.id===id);
  if(!selected||launching)return;
  if(selected.status==='failed')throw new Error(`${selected.name} is unavailable: its build failed`);
  launching=true;
  const previous=location.href;
  try{
    // The launcher must relinquish document-level profile handlers before an
    // embedded app installs its own manager. A home-screen manager must never
    // listen to a Ciyan profile button.
    profileUI?.destroy?.();
    profileUI=null;
    history.replaceState(null,'',appLaunchUrl(previous,id));
    document.title=`${selected.name} v${selected.version}`;
    document.body.classList.remove('launcher-mode');
    const splashArt=selected.icon
      ?`<img src="${escapeHtml(selected.icon)}" alt="" draggable="false">`
      :escapeHtml(selected.glyph);
    document.querySelector('#app').innerHTML=`<div class="loading-state"><div class="brand-mark${selected.icon?' brand-mark-art':''}">${splashArt}</div><div class="loading-spinner"></div><p>Opening ${escapeHtml(selected.name)}…</p></div>`;
    await prepareAppOffline(selected);
    await loadAppStyle(selected);
    installHostApi();
    // The app module is loaded only after selecting its tile.
    await import(selected.module);
  }catch(error){
    history.replaceState(null,'',launcherUrl(previous));
    document.body.classList.add('launcher-mode');
    document.title='Workspace';
    renderHome();
    throw error;
  }finally{
    launching=false;
  }
}

async function prepareAppOffline(app){
  if(!navigator.serviceWorker)return;
  try{
    const groups=await offlineRequest('status');
    const pack=groups.find(g=>g.group==='app:'+app.id);
    if(pack&&!pack.complete){
      await offlineRequest('download',pack.group,(done,total)=>{
        const status=document.querySelector('.loading-state p');
        if(status)status.textContent=`Preparing ${app.name} for offline use (${done}/${total})…`;
      });
    }
  }catch(error){
    if(navigator.onLine===false)throw Error(`${app.name} is not fully downloaded. Connect and open it once.`);
    console.warn('Offline preparation unavailable:',error);
  }
}
function registerWorker(){
  if('serviceWorker' in navigator && location.protocol.startsWith('http')){
    const worker=navigator.serviceWorker;
    worker.addEventListener('controllerchange',()=>{
      if(!activeAppId(location.href))location.reload();
    },{once:true});
    worker.register('./sw.js',{updateViaCache:'none'}).catch(()=>{});
  }
}

export async function startLauncher(){
  registerWorker();

  const id=activeAppId(location.href);
  if(id){
    const selected=APPS.find(app=>app.id===id);
    if(selected.status==='failed'){history.replaceState(null,'',launcherUrl(location.href));return renderHome();}
    document.title=`${selected.name} v${selected.version}`;
    await prepareAppOffline(selected);
    await loadAppStyle(selected);
    installHostApi();
    await import(selected.module);
    return;
  }
  renderHome();
}

let profileUI=null,homeListenerInstalled=false;
function renderHome(){
  document.title='Workspace';
  document.body.classList.add('launcher-mode');
  const host=document.querySelector('#app');
  host.innerHTML=homeScreen(location.href);
  if(navigator.serviceWorker)void offlineRequest('status').then(groups=>{
    for(const g of groups.filter(x=>x.group.startsWith('app:'))){
      const node=host.querySelector(`[data-offline-app="${g.group.slice(4)}"]`);
      if(node)node.textContent=g.complete?'Offline ready':'Downloads on first open';
    }
  }).catch(()=>{});
  // Lazy import: launcher URL utilities remain usable in isolated test/build fixtures.
  if(!profileUI)void Promise.all([
    import('./shared-profiles/ui.js'),
    import('./shared-profiles/profiles.js'),
    import('./shared-profiles/registry-recovery.js')
  ]).then(async ([ui,profiles,recovery])=>{
    // The launcher can be replaced by an embedded app while these modules load.
    // Never install the home-screen manager over Ciyan's own profile manager.
    if(profileUI||activeAppId(location.href))return;
    try{profiles.readRegistry();}
    catch(error){
      if(await recovery.showRegistryRecovery(host,error))return;
      throw error;
    }
    if(!profileUI&&!activeAppId(location.href))profileUI=ui.installProfileUI();
  }).catch(error=>console.warn('Profile manager unavailable:',error));
  if(homeListenerInstalled)return;
  homeListenerInstalled=true;
  host.addEventListener('click',event=>{
    const dialog=host.querySelector('[data-version-dialog]');
    if(event.target.closest?.('[data-show-versions]')){
      if(dialog&&!dialog.open)dialog.showModal();
      return;
    }
    if(event.target.closest?.('[data-close-versions]')){
      dialog?.close();return;
    }
    const refresh=event.target.closest?.('[data-update-launcher]');
    if(refresh){
      event.preventDefault();
      const errorNode=host.querySelector('.launcher-error');
      if(errorNode)errorNode.textContent='';
      void runUpdateButton(refresh,{
        onError:message=>{if(errorNode)errorNode.textContent=`Update failed: ${message}`;}
      });
      return;
    }
    const tile=event.target.closest?.('[data-launch-app]');
    if(!tile||event.defaultPrevented||event.button>0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    event.preventDefault();
    void launchApp(tile.dataset.launchApp).catch(error=>{
      const message=document.createElement('p');
      message.className='subtle launcher-error';
      message.textContent=`Unable to open app: ${error?.message||error}`;
      host.querySelector('.launcher-screen')?.append(message);
    });
  });
}

// Testable pure URL helpers; side effects only start on this page's normal load.
if(typeof document!=='undefined'&&document.querySelector('#app')){
  void startLauncher().catch(error=>{
    const root=document.querySelector('#app');
    root.innerHTML=`<div class="loading-state"><h2>App failed to open</h2><p class="launch-error-message"></p><a class="btn btn-secondary" href="${launcherUrl(location.href)}">Return to Workspace</a></div>`;
    root.querySelector('.launch-error-message').textContent=String(error?.message||error);
  });
}
