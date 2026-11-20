#!/usr/bin/env python3
"""Build the AppLauncher PWA from the exact pinned app-submodule commits.

Cloudflare Pages: build command `python3 build.py`, output directory `dist`.
Cloudflare Workers: build command `python3 build.py`, deploy `npx wrangler@4 deploy`.
No app version is pulled implicitly from a branch. GitHub Actions advances the
pinned submodule SHA when its own repository publishes a new commit.
"""
from __future__ import annotations
import hashlib
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parent
TARGET=ROOT/'dist'
RESERVED={'index.html','launcher.js','apps-registry.js','launcher-meta.js','pwa-update.js',
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
                        source.relative_to(ROOT).as_posix()],cwd=ROOT,check=True)
    if not (source/'package.py').exists():
        raise RuntimeError(f'Missing submodule {source}; run git submodule update --init --recursive')

def build():
    apps=json.loads((ROOT/'apps.json').read_text(encoding='utf-8'))['apps']
    if not apps:raise ValueError('No apps registered')
    if TARGET.exists():shutil.rmtree(TARGET)
    TARGET.mkdir(parents=True)
    for f in HOST_FILES:shutil.copy2(ROOT/f,TARGET/f)
    shutil.copytree(ROOT/'icons',TARGET/'icons')
    registry=[]
    for a in apps:
        source=ROOT/safe_rel(a['source']);prepare_submodule(source)
        subprocess.run([sys.executable,'package.py'],cwd=source,check=True)
        assets=source/safe_rel(a.get('distribution','dist/ciyan'))
        target=TARGET/safe_rel(a['destination'])
        if not assets.is_dir():raise RuntimeError(f'No app build found: {assets}')
        for file in sorted(assets.rglob('*')):
            if not file.is_file():continue
            name=file.relative_to(assets)
            if a.get('legacy_root') and name.parts[0]=='icons':
                continue  # The installed PWA's existing icon and identity are host-owned.
            if name.as_posix() in RESERVED:
                if a['destination']!='.':raise ValueError(f'App contains reserved file {name}')
                continue  # legacy Ciyan v0.8.16 contains copies of the shell
            output=target/name
            if output.exists():raise RuntimeError(f'Asset collision: {output.relative_to(TARGET)}')
            output.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(file,output)
        package=json.loads((source/'package.json').read_text(encoding='utf-8'))
        registry.append({k:a[k] for k in ('id','name','glyph','module','stylesheet')} |
                        {'version':package['version']})
    # Generate host and app version labels from their respective package.json files.
    host_version=json.loads((ROOT/'package.json').read_text(encoding='utf-8'))['version']
    (TARGET/'launcher-meta.js').write_text(
        'export const LAUNCHER_VERSION='+json.dumps(host_version)+';\n',encoding='utf-8')
    # Generate registry from one canonical apps.json. Never load other apps at home.
    (TARGET/'apps-registry.js').write_text('export const APPS=Object.freeze('+json.dumps(registry,ensure_ascii=False,separators=(',',':'))+');\n',encoding='utf-8')
    shell=[p for p in sorted(TARGET.rglob('*')) if p.is_file() and p.suffix.lower() in
           {'.html','.css','.js','.webmanifest','.png','.svg','.woff','.woff2','.ttf','.otf'}]
    if not shell:raise RuntimeError('No shell files produced')
    h=hashlib.sha256()
    for item in shell:
        h.update(item.relative_to(TARGET).as_posix().encode()+b'\0')
        h.update(hashlib.sha256(item.read_bytes()).digest())
    name=f'app-launcher-shell-v0.1.2-{h.hexdigest()[:16]}'
    paths=['./'+item.relative_to(TARGET).as_posix() for item in shell]
    template=(ROOT/'sw.template.js').read_text(encoding='utf-8')
    worker=template.replace('__SHELL_CACHE_NAME__',name).replace('__PRECACHE_ASSETS__',json.dumps(paths,ensure_ascii=False,separators=(',',':')))
    (TARGET/'sw.js').write_text(worker,encoding='utf-8')
    print(f'AppLauncher v{host_version}: {len(apps)} apps, {len(paths)} precached assets, cache={name}')
    print(f'Cloudflare static bundle: {TARGET}')

if __name__=='__main__':build()
