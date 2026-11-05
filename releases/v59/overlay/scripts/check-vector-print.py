import importlib.util,io,json,pathlib
from pypdf import PdfReader
spec=importlib.util.spec_from_file_location('engine','public/python/engine.py');engine=importlib.util.module_from_spec(spec);spec.loader.exec_module(engine)
root=pathlib.Path('work/stone-qa');icc=pathlib.Path('public/template/colour/CGATS001Compat-v2-micro.icc').read_bytes()
for name in ['listed','sold','brochure']:
 t=json.loads((root/(name+'.json')).read_text());base=(root/(name+'-base.pdf')).read_bytes()
 before,_=engine.render(base,t,{'mode':'proof'},icc,finalize=False);r=PdfReader(io.BytesIO(before));layers=[]
 for page in r.pages:
  raw=[x.get_object().get_data() for x in page['/Contents'] if x.get_object().get('/StudioVectorText')];assert raw;layers.append(raw)
 result,_=engine.render(base,t,{'mode':'proof'},icc,finalize=True);assert result.startswith(b'%PDF-1.3');out=PdfReader(io.BytesIO(result))
 for i,page in enumerate(out.pages):
  contents=page.get_contents().get_data()
  for raw in layers[i]:assert raw in contents,'Outlined text must survive conversion byte-for-byte'
  assert all(abs(float(a)-float(b))<.1 for a,b in zip(page.trimbox,r.pages[i].trimbox)),(list(page.trimbox),list(r.pages[i].trimbox))
 (root/(name+'-vector-print.pdf')).write_bytes(result);(root/(name+'-pre-final.pdf')).write_bytes(before)
 print('PASS',name,'PDF 1.3, vector text preserved exactly, unchanged trim box',flush=True)
