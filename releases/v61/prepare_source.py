"""Build v61 from verified v60 source and this readable source overlay."""
from pathlib import Path
import hashlib, importlib.util, json, shutil, tempfile, zipfile
HERE=Path(__file__).resolve().parent
def main():
    root=HERE.parents[1]
    manifest=json.loads((HERE/'manifest.json').read_text())
    for path, expected in manifest['overlay_sha256'].items():
        if hashlib.sha256((HERE/'overlay'/path).read_bytes()).hexdigest()!=expected:
            raise ValueError('Changed source file: '+path)
    output=root/'signboard-studio-source-v61.zip'
    if output.exists(): raise FileExistsError(str(output)+' already exists; move it before rerunning')
    with tempfile.TemporaryDirectory() as tmp:
        tmp=Path(tmp)
        for version in ('v59','v60'):
            shutil.copytree(HERE.parent/version,tmp/'releases'/version)
        base=json.loads((HERE.parent/'v59'/'manifest.json').read_text())['base_archive']
        (tmp/base).parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(root/base,tmp/base)
        spec=importlib.util.spec_from_file_location('release60',tmp/'releases'/'v60'/'prepare_source.py')
        previous=importlib.util.module_from_spec(spec);spec.loader.exec_module(previous);previous.main()
        with zipfile.ZipFile(tmp/'signboard-studio-source-v60.zip') as src:
            names=src.namelist()
            prefixes=[n[:-len('package.json')] for n in names if n.endswith('package.json') and n[:-len('package.json')]+'lib/image-draft.ts' in names]
            if len(prefixes)!=1: raise ValueError('Cannot identify source root')
            replacements={prefixes[0]+p:HERE/'overlay'/p for p in manifest['overlay_sha256']}
            with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as dest:
                for item in src.infolist():
                    if item.filename not in replacements: dest.writestr(item,src.read(item.filename))
                for name,path in replacements.items():dest.write(path,name)
    print(output)
    print('SHA256: '+hashlib.sha256(output.read_bytes()).hexdigest())
if __name__=='__main__':main()
