#!/usr/bin/env python3
"""Validate a strict, reproducible production distribution and its provenance."""
import hashlib
import json
import pathlib
import subprocess
import sys

ROOT=pathlib.Path(__file__).resolve().parent.parent
DIST=ROOT/'dist'

def git(*args,cwd=ROOT):
    return subprocess.check_output(['git',*args],cwd=cwd,text=True).strip()

def check(path=None):
    manifest=json.loads((path or DIST/'release-manifest.json').read_text(encoding='utf-8'))
    apps=json.loads((ROOT/'apps.json').read_text(encoding='utf-8'))['apps']
    meta=json.loads((ROOT/'package.json').read_text(encoding='utf-8'))
    assert manifest['strict'] is True, 'Preview builds cannot be released'
    assert manifest['launcherVersion']==meta['version'], 'Launcher version mismatch'
    assert manifest['launcherCommit']==git('rev-parse','HEAD'), 'Launcher checkout changed during validation'
    assert manifest['sharedProfilesCommit']==git('rev-parse','HEAD',cwd=ROOT/'shared/google-drive')
    assert {a['id'] for a in manifest['apps']}=={a['id'] for a in apps}, 'Missing application release'
    for app in apps:
        item=next(a for a in manifest['apps'] if a['id']==app['id'])
        source=ROOT/app['source']
        assert item['commit']==git('rev-parse','HEAD',cwd=source), 'Source commit changed: '+app['id']
        assert item['version']==json.loads((source/'package.json').read_text())['version'], 'App version changed: '+app['id']
        for name in ('module','stylesheet'):
            if app.get(name):
                metadata=manifest['entrypoints'][app['id']][name]
                assert metadata['path']==app[name].removeprefix('./')
                entry=DIST/metadata['path']
                assert entry.is_file(), 'Missing release entrypoint: '+str(entry)
                assert hashlib.sha256(entry.read_bytes()).hexdigest()==metadata['sha256'], 'Bad release asset digest: '+str(entry)
    # Check both public representations against the actual pinned Git tree.
    sys.path.insert(0,str(ROOT))
    from build import dependency_tree
    tree=dependency_tree(ROOT,apps,[],strict=True)
    assert manifest['dependencyTree']==tree, 'Dependency version tree mismatch'
    meta_js=(DIST/'launcher-meta.js').read_text(encoding='utf-8')
    prefix='export const DEPENDENCY_TREE='
    line=next(line for line in meta_js.splitlines() if line.startswith(prefix))
    assert json.loads(line[len(prefix):-1])==tree, 'Offline version tree mismatch'
    registry=(DIST/'apps-registry.js').read_text()
    for app in apps:
        assert '"id":"'+app['id']+'"' in registry, 'Absent app in registry: '+app['id']
    assert '"status":"failed"' not in registry, 'Failed app in production registry'
    assert (DIST/'sw.js').is_file() and manifest['shellCache'] in (DIST/'sw.js').read_text()
    inventory=json.loads((DIST/'offline-inventory.json').read_text())
    assert len(inventory)==manifest['offline']['totalAssets']
    assert sum(a['size'] for a in inventory)==manifest['offline']['totalBytes']
    assert len({a['path'] for a in inventory})==len(inventory)
    required=[a for a in inventory if 'shell' in a['groups']]
    assert len(required)==manifest['offline']['requiredAssets']
    assert sum(a['size'] for a in required)==manifest['offline']['requiredBytes']
    for item in inventory:
        path=(DIST/item['path']).resolve()
        assert path.is_relative_to(DIST.resolve()) and path.is_file(), 'Missing offline asset: '+item['path']
        data=path.read_bytes()
        assert len(data)==item['size'] and hashlib.sha256(data).hexdigest()==item['sha256'], 'Invalid offline asset: '+item['path']
    print(f'PASS: strict production release, {len(apps)} app entrypoints, pinned commit provenance and offline fingerprints')

if __name__=='__main__':
    check(pathlib.Path(sys.argv[1]).resolve() if len(sys.argv)>1 else None)
