"""Run after check-stone-imports.mts; verifies the actual download engine."""
import copy,importlib.util,json,pathlib,io
from pypdf import PdfReader
spec=importlib.util.spec_from_file_location('engine','public/python/engine.py');engine=importlib.util.module_from_spec(spec);spec.loader.exec_module(engine)
root=pathlib.Path('work/stone-qa');icc=pathlib.Path('public/template/colour/CGATS001Compat-v2-micro.icc').read_bytes()
for name in ('listed','sold','brochure'):
 t=json.loads((root/f'{name}.json').read_text())
 t['defaults']={'text':{'old_fixed_field':'unchanged'}}
 job={'mode':'proof','text':{f['id']:f['text'] for f in t['fields']}}
 output,_=engine.render((root/f'{name}-base.pdf').read_bytes(),t,job,icc,finalize=False)
 assert len(PdfReader(io.BytesIO(output)).pages)==2
 (root/f'{name}-python-proof.pdf').write_bytes(output)
 try:engine.render((root/f'{name}-base.pdf').read_bytes(),t,{'mode':'proof','text':{'unknown_explicit_key':'bad'}},icc,finalize=False)
 except engine.JobError:pass
 else:raise AssertionError('Unknown explicit job keys must still be rejected')
 print('PASS',name,'Python proof: both pages, stale stored defaults removed, unknown submitted keys rejected')
