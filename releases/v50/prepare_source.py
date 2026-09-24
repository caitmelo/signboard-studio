"""Assemble v50 from the checked-in v49 base and exact v50 source overlay."""
from pathlib import Path
import hashlib, json, shutil, tempfile, zipfile

HERE = Path(__file__).resolve().parent

def assemble(base, output, overlay):
    with zipfile.ZipFile(base) as src:
        names = src.namelist()
        candidates = [n[:-len('package.json')] for n in names if n.endswith('package.json')
                      and n[:-len('package.json')]+'lib/image-draft.ts' in names]
        if len(candidates) != 1:
            raise ValueError('Could not identify the Studio source root in the base ZIP')
        prefix = candidates[0]
        replacements = {prefix+p.relative_to(overlay).as_posix(): p
                        for p in overlay.rglob('*') if p.is_file()}
        with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as dest:
            for item in src.infolist():
                if item.filename not in replacements:
                    dest.writestr(item, src.read(item.filename))
            for name, path in replacements.items():
                dest.write(path, name)

def main():
    manifest = json.loads((HERE/'manifest.json').read_text())
    base = HERE.parents[1]/manifest['base_archive']
    if hashlib.sha256(base.read_bytes()).hexdigest() != manifest['base_sha256']:
        raise ValueError('Base source ZIP checksum does not match the v49 release')
    for path, expected in manifest['overlay_sha256'].items():
        if hashlib.sha256((HERE/'overlay'/path).read_bytes()).hexdigest() != expected:
            raise ValueError('Changed overlay file: '+path)
    output = HERE.parents[1]/'signboard-studio-source-v50.zip'
    if output.exists():
        raise FileExistsError(str(output)+' already exists; move it before rerunning')
    with tempfile.TemporaryDirectory() as temporary:
        staged = Path(temporary)/output.name
        assemble(base, staged, HERE/'overlay')
        shutil.copyfile(staged, output)
    print(str(output))
    print('SHA256: '+hashlib.sha256(output.read_bytes()).hexdigest())

if __name__ == '__main__':
    main()
