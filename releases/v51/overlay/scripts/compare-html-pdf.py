"""Render exported HTML independently and compare with the original PDF."""
from pathlib import Path
import json
import fitz
import numpy as np
from PIL import Image,ImageOps,ImageDraw
from weasyprint import HTML
root=Path('work/html-qa');results=[]
for source in sorted(root.glob('*.html')):
    original=fitz.open(source.with_suffix('.pdf'))
    output=source.with_name(source.stem+'-from-html.pdf')
    HTML(filename=str(source)).write_pdf(str(output))
    recreated=fitz.open(output)
    assert len(original)==len(recreated),(source.name,len(original),len(recreated))
    for i,(a,b) in enumerate(zip(original,recreated)):
        assert abs(a.rect.width-b.rect.width)<.01 and abs(a.rect.height-b.rect.height)<.01
        pa=a.get_pixmap(matrix=fitz.Matrix(1.5,1.5),alpha=False)
        pb=b.get_pixmap(matrix=fitz.Matrix(1.5,1.5),alpha=False)
        ia=Image.frombytes('RGB',(pa.width,pa.height),pa.samples)
        ib=Image.frombytes('RGB',(pb.width,pb.height),pb.samples)
        assert ia.size==ib.size
        d=np.abs(np.asarray(ia).astype(float)-np.asarray(ib).astype(float))
        mae=float(d.mean());frac=float((d.max(axis=2)>32).mean())
        results.append({'file':source.name,'page':i+1,'width_pt':a.rect.width,'height_pt':a.rect.height,'mean_channel_error_0_255':round(mae,4),'fraction_pixels_difference_over_32':round(frac,5)})
        assert mae<2 and frac<.01,(source.name,i,mae,frac)
        panels=[]
        for im,label in [(ia,'Original PDF'),(ib,'Exported HTML rendered to PDF')]:
            im.thumbnail((700,950));panel=Image.new('RGB',(720,im.height+45),'#eeeeee');panel.paste(im,(10,35));ImageDraw.Draw(panel).text((12,10),label,fill='black');panels.append(panel)
        board=Image.new('RGB',(1440,max(x.height for x in panels)),'white');board.paste(panels[0],(0,0));board.paste(panels[1],(720,0));board.save(root/f'{source.stem}-{i+1}-comparison.png')
(root/'comparison-results.json').write_text(json.dumps(results,indent=2))
print(json.dumps(results,indent=2))
