"""Assemble v60 from the verified v59 release and the free-font update."""
from pathlib import Path
import base64, hashlib, importlib.util, io, json, shutil, tempfile, zipfile
HERE = Path(__file__).resolve().parent

def main():
    manifest = json.loads((HERE / 'manifest.json').read_text())
    payload = base64.b64decode(''.join((HERE / p).read_text() for p in manifest['payload_parts']), validate=True)
    if hashlib.sha256(payload).hexdigest() != manifest['payload_sha256']:
        raise ValueError('Font update checksum mismatch')
    previous = HERE.parent / 'v59'
    prior = json.loads((previous / 'manifest.json').read_text())
    root = HERE.parents[1]
    base = root / prior['base_archive']
    if hashlib.sha256(base.read_bytes()).hexdigest() != prior['base_sha256']:
        raise ValueError('Base source checksum mismatch')
    for path, expected in prior['overlay_sha256'].items():
        if hashlib.sha256((previous / 'overlay' / path).read_bytes()).hexdigest() != expected:
            raise ValueError('Changed v59 source: ' + path)
    output = root / 'signboard-studio-source-v60.zip'
    if output.exists():
        raise FileExistsError(str(output) + ' already exists; move it before rerunning')
    spec = importlib.util.spec_from_file_location('previous_release', previous / 'prepare_source.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    with tempfile.TemporaryDirectory() as tmp:
        overlay = Path(tmp) / 'overlay'
        shutil.copytree(previous / 'overlay', overlay)
        with zipfile.ZipFile(io.BytesIO(payload)) as update:
            if set(update.namelist()) != set(manifest['files_sha256']):
                raise ValueError('Unexpected update file list')
            for path, expected in manifest['files_sha256'].items():
                if Path(path).is_absolute() or '..' in Path(path).parts:
                    raise ValueError('Invalid update path')
                data = update.read(path)
                if hashlib.sha256(data).hexdigest() != expected:
                    raise ValueError('Changed update file: ' + path)
                target = overlay / path
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
        staged = Path(tmp) / output.name
        module.assemble(base, staged, overlay)
        shutil.copyfile(staged, output)
    print(output)
    print('SHA256: ' + hashlib.sha256(output.read_bytes()).hexdigest())

if __name__ == '__main__':
    main()
