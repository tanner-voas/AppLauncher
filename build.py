#!/usr/bin/env python3
"""Strict AppLauncher release build from pinned submodules.

The default is fail-closed for production. Use --allow-partial deliberately
for local previews with disabled tiles; never use it for deployment.
"""
from __future__ import annotations
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parent
TARGET=ROOT/'dist'
RESERVED={'shared-profiles','worker.js','index.html','launcher.js','apps-registry.js','launcher-meta.js','pwa-update.js',
          'viewport-lock.js','sw.js','manifest.webmanifest','_headers','workspace.css','launcher-offline.js','offline-inventory.json','release-manifest.json'}
HOST_FILES=['index.html','launcher.js','workspace.css','pwa-update.js',
            'viewport-lock.js','manifest.webmanifest','_headers','launcher-offline.js']

def safe_rel(value):
    p=Path(value)
    if p.is_absolute() or '..' in p.parts or (not p.parts and value!='.'):
        raise ValueError(f'Unsafe application path: {value!r}')
    return p

def prepare_submodule(source):
    if (source/'package.py').exists():return
    if (ROOT/'.git').exists():
        subprocess.run(['git','submodule','update','--init','--recursive','--',
                        source.relative_to(ROOT).as_posix()],cwd=ROOT,check=True,timeout=150)
    if not (source/'package.py').exists():
        raise RuntimeError('Application submodule not present')

def safe_failure(exc):
    if isinstance(exc,subprocess.CalledProcessError):return f'Build step exited with status {exc.returncode}'
    if isinstance(exc,subprocess.TimeoutExpired):return 'Build step timed out'
    if isinstance(exc,FileNotFoundError):return 'Required app file is missing'
    # Do not leak absolute paths or exception traces through the public registry.
    if isinstance(exc,(RuntimeError,ValueError)):
        return re.sub(r'[/\\][\w./\\-]+','[path]',str(exc))[:140]
    return f'{type(exc).__name__} while packaging app'

def package_app(app):
    source=ROOT/safe_rel(app['source'])
    prepare_submodule(source)
    # Ciyan pins the same shared library as its own nested submodule. Ensure
    # Cloudflare builds have initialized it even when they only cloned depth 1.
    if app['id']=='ciyan' and (source/'.git').exists():
        subprocess.run(['git','submodule','update','--init','--recursive'],cwd=source,
                       check=True,timeout=150)
    subprocess.run([sys.executable,'package.py'],cwd=source,check=True,timeout=300)
    assets=source/safe_rel(app.get('distribution',f'dist/{app["id"]}'))
    if not assets.is_dir():raise RuntimeError('Missing app distribution')
    package=json.loads((source/'package.json').read_text(encoding='utf-8'))
    version=str(package['version'])
    destination=safe_rel(app['destination'])
    if destination==Path('.') and not app.get('legacy_root'):
        raise ValueError('Only legacy apps may write to the launcher root')
    # Stage everything before touching dist: a failed app cannot leave half
    # of its assets behind or overwrite an earlier app's successful build.
    with tempfile.TemporaryDirectory(prefix='app-launcher-stage-') as stage_dir:
        stage=Path(stage_dir)/'assets'
        shutil.copytree(assets,stage)
        # An app may have a standalone PWA icon that its launcher-module
        # distribution does not include. Stage that existing asset explicitly.
        if app.get('tile_icon'):
            icon=safe_rel(app['tile_icon'])
            if icon.suffix.lower() != '.png':
                raise ValueError('Launcher tile icon must be a PNG')
            original=source/icon
            if not original.is_file():
                raise FileNotFoundError('Launcher tile icon is absent')
            target=stage/icon
            target.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(original,target)
        copies=[]
        for file in sorted(stage.rglob('*')):
            if not file.is_file():continue
            name=file.relative_to(stage)
            if app.get('legacy_root') and (name.parts[0]=='icons' or name.as_posix() in RESERVED):
                continue
            if destination==Path('.') and name.parts[0] in RESERVED:
                raise ValueError('App attempts to replace launcher-owned files')
            output=TARGET/destination/name
            if output.exists():raise RuntimeError('App asset collision')
            copies.append((file,output))
        # Validate declared entrypoint CSS/JS actually exist in the distribution.
        for field in ('module','stylesheet'):
            value=app.get(field)
            if not value:continue
            entry=value.removeprefix('./')
            expected=(TARGET/entry).resolve()
            allowed={output.resolve() for _,output in copies}
            if expected not in allowed:
                raise RuntimeError(f'App entrypoint is absent: {field}')
        created=[]
        try:
            for file,output in copies:
                output.parent.mkdir(parents=True,exist_ok=True)
                shutil.copy2(file,output)
                created.append(output)
        except Exception:
            for output in created:output.unlink(missing_ok=True)
            raise
    return version

def git_output(*args, cwd=ROOT):
    return subprocess.check_output(['git',*args],cwd=cwd,text=True,stderr=subprocess.DEVNULL).strip()

def check_pins(apps):
    """Validate the exact Git submodule commits, not whatever happens to be checked out."""
    if not (ROOT/'.git').exists():
        raise RuntimeError('Strict release requires a Git checkout with pinned submodules')
    for path in [*(a['source'] for a in apps),'shared/google-drive','shared/pwa-core']:
        staged=git_output('ls-files','--stage','--',path).splitlines()
        if len(staged)!=1 or not staged[0].startswith('160000 '):
            raise RuntimeError(f'Missing pinned Git submodule: {path}')
        expected=staged[0].split()[1]
        checkout=git_output('rev-parse','HEAD',cwd=ROOT/path)
        if expected!=checkout:
            raise RuntimeError(f'Submodule checkout differs from pinned commit: {path}')
        if git_output('status','--porcelain','--untracked-files=no',cwd=ROOT/path):
            raise RuntimeError(f'Submodule has uncommitted tracked changes: {path}')
    ciyan_shared=git_output('rev-parse','HEAD:shared/google-drive',cwd=ROOT/'apps/ciyan')
    launcher_shared=git_output('rev-parse','HEAD',cwd=ROOT/'shared/google-drive')
    if ciyan_shared!=launcher_shared:
        raise RuntimeError('Launcher and Ciyan have incompatible shared profile library commits')


def dependency_tree(root, apps, registry, *, strict):
    """Describe each checkout independently; never collapse equal package names.

    In strict mode recurse through actual Git links, verifying each checkout.
    A preview without Git can describe available packages but not claim pins.
    """
    names={'app-launcher':'AppLauncher','pwa-google-drive':'PWA-GoogleDrive','pwa-core':'PWA-Core'}
    labels={app['source']:('Ciyan' if app['id']=='ciyan' else app['name']) for app in apps}
    labels['shared/google-drive']='PWA-GoogleDrive'
    labels['shared/pwa-core']='PWA-Core'
    ready={app['id'] for app in registry if app['status']=='ready'}
    def node(directory, label=None, expected=None, root_node=False):
        package_path=directory/'package.json'
        package=json.loads(package_path.read_text(encoding='utf-8')) if package_path.is_file() else {}
        name=label or names.get(package.get('name'),package.get('name') or directory.name)
        commit=None
        links=[]
        if strict:
            commit=git_output('rev-parse','HEAD',cwd=directory)
            if expected is not None and commit!=expected:
                raise RuntimeError(f'Dependency checkout differs from its pin: {directory.relative_to(root)}')
            if not root_node and git_output('status','--porcelain','--untracked-files=no',cwd=directory):
                raise RuntimeError(f'Dependency checkout has tracked changes: {directory.relative_to(root)}')
            raw=subprocess.check_output(['git','ls-tree','-r','-z','HEAD'],cwd=directory)
            for entry in raw.decode('utf-8').split('\0'):
                if not entry:continue
                info,path=entry.split('\t',1)
                mode,kind,sha=info.split()
                if mode=='160000' and kind=='commit':links.append((path,sha))
        elif root_node:
            # Source-only previews may lack nested checkouts and package metadata.
            links=[('shared/pwa-core',None),('shared/google-drive',None)]+[(a['source'],None) for a in apps if a['id'] in ready]
        if root_node:
            order=['shared/pwa-core','shared/google-drive',*(a['source'] for a in apps)]
            links.sort(key=lambda item: (order.index(item[0]) if item[0] in order else len(order),item[0]))
        children=[node(directory/safe_rel(path),labels.get(path) if root_node else None,sha) for path,sha in links]
        return {'name':name,'version':package.get('version'),'commit':commit,'dependencies':children}
    return node(root,'AppLauncher',root_node=True)

def reader_groups(path):
    # The original archives are also prerequisites of each graded edition.
    if path.startswith('chapters/') and path.endswith('.zip'):
        return ['reader:original', 'reader:hsk4', 'reader:hsk5', 'reader:hsk6']
    for prefix, group in [('chapters/graded-v099-hsk4/', 'reader:hsk4'),
                          ('chapters/graded-v095-hsk5/', 'reader:hsk5'),
                          ('chapters/graded-v094/', 'reader:hsk6')]:
        if path.startswith(prefix): return [group]
    return None

def build(*,allow_partial=False):
    # Discard any old deployable artifact before inspecting release inputs.
    if TARGET.exists():shutil.rmtree(TARGET)
    apps=json.loads((ROOT/'apps.json').read_text(encoding='utf-8'))['apps']
    if not apps:raise ValueError('No apps registered')
    ids=[a['id'] for a in apps]
    if len(ids)!=len(set(ids)):raise ValueError('Duplicate app IDs')
    for app in apps:
        if not re.fullmatch(r'[a-z][a-z0-9-]*',app['id']):raise ValueError('Invalid app ID')
        for key in ('source','distribution','destination','module','stylesheet','tile_icon'):
            if key in app:safe_rel(app[key])
    if not allow_partial:
        if not (ROOT/'.git').exists():
            raise RuntimeError('Strict release requires a Git checkout with pinned submodules')
        # Cloudflare may clone only the top-level repository; resolve exact
        # pinned commits before verifying that they match the source checkouts.
        subprocess.run(['git','submodule','update','--init','--recursive'],cwd=ROOT,check=True,timeout=240)
        check_pins(apps)
    # Import only after the pinned submodule has been initialized. A shallow
    # Cloudflare checkout must not need a network import at runtime.
    core=ROOT/'shared/pwa-core'
    if not (core/'build/offline.py').is_file():raise RuntimeError('Missing PWA-Core submodule')
    sys.path.insert(0,str(core/'build'))
    from offline import asset_record,generate_worker
    TARGET.mkdir(parents=True)
    shared_runtime={'pwa-update.js':'pwa-update.js','launcher-offline.js':'offline-request.js'}
    for f in HOST_FILES:
        source=core/'src'/shared_runtime[f] if f in shared_runtime else ROOT/f
        shutil.copy2(source,TARGET/f)
    shutil.copytree(ROOT/'icons',TARGET/'icons')
    source=ROOT/'shared'/'google-drive'/'src'
    if not source.is_dir():raise RuntimeError('Missing PWA-GoogleDrive submodule')
    shutil.copytree(source,TARGET/'shared-profiles')
    registry=[]
    provenance=[]
    for app in apps:
        entry={k:app[k] for k in ('id','name','glyph','module','stylesheet')}
        if app.get('service_button'):entry['serviceButton']=True
        try:
            version=package_app(app)
            commit=git_output('rev-parse','HEAD',cwd=ROOT/safe_rel(app['source'])) if not allow_partial else None
            provenance.append({'id':app['id'],'version':version,'commit':commit})
            entry.update(version=version,status='ready')
            if app.get('tile_icon'):
                entry['icon']='./'+(safe_rel(app['destination'])/safe_rel(app['tile_icon'])).as_posix()
            print(f"  READY {app['id']} v{version}")
        except Exception as exc:
            entry.update(version='—',status='failed',reason=safe_failure(exc))
            print(f"  FAILED {app['id']}: {type(exc).__name__}: {exc}",file=sys.stderr)
        registry.append(entry)
    failed=sum(a['status']=='failed' for a in registry)
    if failed and not allow_partial:
        # Refuse to leave a deployable-looking partial bundle behind.
        shutil.rmtree(TARGET)
        raise RuntimeError(f'Strict release rejected: {failed} required app(s) failed to build')
    host_version=json.loads((ROOT/'package.json').read_text(encoding='utf-8'))['version']
    tree=dependency_tree(ROOT,apps,registry,strict=not allow_partial)
    (TARGET/'launcher-meta.js').write_text(
        'export const LAUNCHER_VERSION='+json.dumps(host_version)+';\n'
        'export const DEPENDENCY_TREE='+json.dumps(tree,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
    (TARGET/'apps-registry.js').write_text(
        'export const APPS=Object.freeze('+json.dumps(registry,ensure_ascii=False,separators=(',',':'))+');\n',encoding='utf-8')
    assets=[]
    tile_icons={a['icon'].removeprefix('./') for a in registry if a.get('icon')}
    shell_names=set(HOST_FILES)|{'launcher-meta.js','apps-registry.js'}
    for file in sorted(TARGET.rglob('*')):
        if not file.is_file() or file.name=='_headers':continue
        path=file.relative_to(TARGET).as_posix()
        if path in shell_names or path in tile_icons or path.startswith(('icons/','shared-profiles/')):
            groups=['shell']
        else:
            groups=reader_groups(path)
            if not groups:
                owner=next((a['id'] for a in apps if a['destination']!='.' and path.startswith(a['destination'].rstrip('/')+'/')), 'ciyan')
                groups=['app:'+owner]
        assets.append(asset_record(TARGET,file,groups))
    name,worker,inventory=generate_worker(assets,cache_prefix='app-launcher-shell-',
        version=host_version,legacy_prefixes=['ciyan-shell-'],excluded_path_prefixes=['/_profiles/','/_translation/','/_git/','/_git-runner/'])
    (TARGET/'sw.js').write_text(worker,encoding='utf-8')
    (TARGET/'offline-inventory.json').write_text(inventory+'\n',encoding='utf-8')
    required=[a for a in assets if 'shell' in a['groups']]
    manifest={
        'schema':1,'launcherVersion':host_version,
        'launcherCommit':git_output('rev-parse','HEAD') if not allow_partial else None,
        'sharedProfilesCommit':git_output('rev-parse','HEAD',cwd=ROOT/'shared/google-drive') if not allow_partial else None,
        'strict':not allow_partial,'apps':provenance,'dependencyTree':tree,
        'shellCache':name,'offline':{'requiredAssets':len(required),'requiredBytes':sum(a['size'] for a in required),'totalAssets':len(assets),'totalBytes':sum(a['size'] for a in assets)},
        'entrypoints':{entry['id']:{field:{'path':entry[field].removeprefix('./'),'sha256':hashlib.sha256((TARGET/entry[field].removeprefix('./')).read_bytes()).hexdigest()}
             for field in ('module','stylesheet') if entry.get(field)} for entry in registry if entry['status']=='ready'}
    }
    (TARGET/'release-manifest.json').write_text(json.dumps(manifest,sort_keys=True,indent=2)+'\n',encoding='utf-8')
    print(f'AppLauncher v{host_version}: {len(apps)-failed} ready, {failed} failed, {len(required)} mandatory / {len(assets)} available offline assets, cache={name}')
    print(f'Cloudflare static bundle: {TARGET}')

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser(description='Strict AppLauncher release builder')
    parser.add_argument('--allow-partial',action='store_true',help='Local preview ONLY: show broken apps as disabled tiles')
    args=parser.parse_args()
    try:
        build(allow_partial=args.allow_partial)
    except BaseException:
        # No incomplete or stale bundle survives a failed build invocation.
        shutil.rmtree(TARGET,ignore_errors=True)
        raise
