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
          'viewport-lock.js','sw.js','manifest.webmanifest','_headers','workspace.css'}
HOST_FILES=['index.html','launcher.js','workspace.css','pwa-update.js',
            'viewport-lock.js','manifest.webmanifest','_headers']

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
    for path in [*(a['source'] for a in apps),'shared/google-drive']:
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
    TARGET.mkdir(parents=True)
    for f in HOST_FILES:shutil.copy2(ROOT/f,TARGET/f)
    shutil.copytree(ROOT/'icons',TARGET/'icons')
    source=ROOT/'shared'/'google-drive'/'src'
    if not source.is_dir():raise RuntimeError('Missing PWA-GoogleDrive submodule')
    shutil.copytree(source,TARGET/'shared-profiles')
    registry=[]
    provenance=[]
    for app in apps:
        entry={k:app[k] for k in ('id','name','glyph','module','stylesheet')}
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
    (TARGET/'launcher-meta.js').write_text(
        'export const LAUNCHER_VERSION='+json.dumps(host_version)+';\n',encoding='utf-8')
    (TARGET/'apps-registry.js').write_text(
        'export const APPS=Object.freeze('+json.dumps(registry,ensure_ascii=False,separators=(',',':'))+');\n',encoding='utf-8')
    shell=[p for p in sorted(TARGET.rglob('*')) if p.is_file() and p.suffix.lower() in
           {'.html','.css','.js','.webmanifest','.png','.svg','.woff','.woff2','.ttf','.otf'}]
    if not shell:raise RuntimeError('No launcher shell files produced')
    h=hashlib.sha256()
    for item in shell:
        h.update(item.relative_to(TARGET).as_posix().encode()+b'\0')
        h.update(hashlib.sha256(item.read_bytes()).digest())
    name=f'app-launcher-shell-v{host_version}-{h.hexdigest()[:16]}'
    paths=['./'+item.relative_to(TARGET).as_posix() for item in shell]
    template=(ROOT/'sw.template.js').read_text(encoding='utf-8')
    worker=template.replace('__SHELL_CACHE_NAME__',name).replace('__PRECACHE_ASSETS__',json.dumps(paths,ensure_ascii=False,separators=(',',':')))
    (TARGET/'sw.js').write_text(worker,encoding='utf-8')
    manifest={
        'schema':1,'launcherVersion':host_version,
        'launcherCommit':git_output('rev-parse','HEAD') if not allow_partial else None,
        'sharedProfilesCommit':git_output('rev-parse','HEAD',cwd=ROOT/'shared/google-drive') if not allow_partial else None,
        'strict':not allow_partial,'apps':provenance,
        'shellCache':name,
        'entrypoints':{entry['id']:{field:{'path':entry[field].removeprefix('./'),'sha256':hashlib.sha256((TARGET/entry[field].removeprefix('./')).read_bytes()).hexdigest()}
             for field in ('module','stylesheet') if entry.get(field)} for entry in registry if entry['status']=='ready'}
    }
    (TARGET/'release-manifest.json').write_text(json.dumps(manifest,sort_keys=True,indent=2)+'\n',encoding='utf-8')
    print(f'AppLauncher v{host_version}: {len(apps)-failed} ready, {failed} failed, {len(paths)} precached assets, cache={name}')
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
