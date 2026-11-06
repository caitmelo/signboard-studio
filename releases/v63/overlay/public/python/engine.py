"""Portable PDF renderer. Runs unchanged in CPython and browser Pyodide.
Templates are authored by the bundled web editor; all PDF job rendering is Python.
"""
import base64, copy, io, json, math, re, unicodedata, zlib
from datetime import datetime
from urllib.parse import urlsplit
from pypdf import PdfReader, PdfWriter, Transformation
import pypdf.filters as pdf_filters
# Match the importer's bounded 48 MP, 4-channel print image budget.
# Keep decompression limits enabled; the default 75 MB rejects valid CMYK photos.
for _limit in ("MAX_DECLARED_STREAM_LENGTH", "ZLIB_MAX_OUTPUT_LENGTH"):
    if hasattr(pdf_filters, _limit): setattr(pdf_filters, _limit, 200_000_000)
from pypdf.generic import (ArrayObject, DictionaryObject, NameObject, NumberObject,
    FloatObject, TextStringObject, DecodedStreamObject, RectangleObject)

MM = 72 / 25.4
SIGNBOARDS = {'edgewrap', 'linea', 'bannerwrap', 'pointer', 'other_signboard'}
EDGE_SIZES = [(1000,1500,65),(916,1220,65),(750,1500,65),(450,1832,65),(1220,1832,65),(1050,2100,65),(1220,2440,65),(1832,2440,95),(1832,3660,95),(1832,4880,95),(1832,6096,95),(2440,2440,95),(2440,3658,95),(2440,4880,95),(2440,6096,95)]

class JobError(ValueError):
    def __init__(self, errors, status='needs_adjustment'):
        self.errors = list(dict.fromkeys(errors)); self.status = status
        super().__init__('; '.join(self.errors))

def n(v):
    if not math.isfinite(float(v)): raise ValueError('Invalid layout number')
    return f'{float(v):.7f}'.rstrip('0').rstrip('.') or '0'

def nums(v): return ' '.join(n(x) for x in v)
def bleed(s): return dict.fromkeys(('left','right','top','bottom'),0) if s.get('product')=='letter' else (s.get('bleedInsets') or dict.fromkeys(('left','right','top','bottom'),s['bleed']))
def geometry(s):
    b=bleed(s); marks=s.get('product','edgewrap') in SIGNBOARDS
    slug={k:max(0,5-b[k]) if marks and k!='top' else 0 for k in b}
    bw=s['faceWidth']+b['left']+b['right']; bh=s['faceHeight']+b['top']+b['bottom']
    return dict(b=b,slug=slug,marks=marks,width=bw+slug['left']+slug['right'],height=bh+slug['bottom'],bleedWidth=bw,bleedHeight=bh,trimX=slug['left']+b['left'],trimY=slug['bottom']+b['bottom'],offsetX=slug['left']+(0 if s['sourceIncludesBleed'] else b['left']),offsetY=slug['bottom']+(0 if s['sourceIncludesBleed'] else b['bottom']))
def source_frame(s):
    b=bleed(s); return (s['faceWidth']+(b['left']+b['right'] if s['sourceIncludesBleed'] else 0),s['faceHeight']+(b['top']+b['bottom'] if s['sourceIncludesBleed'] else 0))
def print_issues(t):
    s=t['spec']; b=bleed(s); p=s.get('product','edgewrap'); issues=list(t.get('printIssues',[]))
    if t.get('review',{}).get('status')=='proof': issues.append('This template is saved for proofs. Approve a corrected version before print export.')
    if s.get('productConfirmed') is False: issues.append('Confirm the print product.')
    expected={'letter':0,'linea':65,'bannerwrap':116,'pointer':2,'brochure':2,'mailcard':2,'business_card':2,'poster':2,'vinyl_banner':2}.get(p)
    if p=='edgewrap':
        dims=sorted([s['faceWidth'],s['faceHeight']])
        expected=next((v for a,z,v in EDGE_SIZES if abs(a-dims[0])<1 and abs(z-dims[1])<1),None)
    if expected is not None and any(abs(v-expected)>.01 for v in b.values()): issues.append(f'{p} requires {expected} mm bleed on all sides at final size.')
    if expected is None and not s.get('bleedConfirmed'): issues.append('Confirm the printer bleed measurements.')
    if s.get('product')!='letter' and not s.get('sourceIncludesBleed'): issues.append('Source artwork has no confirmed bleed. Empty margins are not print-ready.')
    if s.get('sizeWarning') and not s.get('sizeConfirmed'): issues.append(s['sizeWarning'])
    return issues

def text_width(f,text,t):
    if text==f['text'] and len(f.get('positions',[]))==len(text): return f['width']
    font=t['fonts'].get(f['fontName']);
    if not font: return math.inf
    return sum(font['glyphs'].get(str(ord(c)),{}).get('advance',font['unitsPerEm'])*f['size']/font['unitsPerEm']*f['horizontalScale']+f['charSpace']+(f['wordSpace'] if c==' ' else 0) for c in text)
def frame(g,t,fs):
    left=min(f['x'] for f in fs); right=max(f['x']+f['width'] for f in fs)
    if g['kind']=='sale':
        f=fs[0]; obstacles=[r['x'] for r in t['fields'] if r['id'] not in g['fieldIds'] and abs(r['y']-f['y'])<max(r['size'],f['size'])*.5 and r['x']>left]
        obstacles += [s['x'] for s in t.get('media',[]) if s['x']>left and s['y']<f['y']+f['size'] and s['y']+s['height']>f['y']]
        right=max(right,min([t['sourceWidth']*.96]+obstacles)-f['size']*.4)
    elif g['kind'] in ('heading','address','details','text'):
        right+=.1
    return left,right

def font_style(name):
    return {'bold':bool(re.search(r'bold|semibold|demi|black|(?:sanl-bol|no9l-med)',name,re.I)), 'italic':bool(re.search(r'italic|oblique|ita$|(?:pro-.*it$)',name,re.I))}
def font_family(name):
    name=re.sub(r'^[A-Z]{6}\+','',name)
    name=re.sub(r'(?:[-, ]?(?:regular|semibold|extrabold|extralight|medium|bold|black|thin|light|italic|oblique|regita|bolita|medita|reg|bol|med|ita|it))+$','',name,flags=re.I)
    return re.sub(r'[^a-z0-9]','',name.lower())
def style_font(name,bold,italic,fonts):
    if name in fonts and font_style(name)=={'bold':bold,'italic':italic}: return name
    candidates=[n for n in fonts if font_family(n)==font_family(name) and font_style(n)=={'bold':bold,'italic':italic}]
    if not candidates: raise ValueError(f'The matching font style for {name} is unavailable.')
    return next((n for n in candidates if not re.search(r'semi|black|extra|light|thin|medium',n,re.I)),candidates[0])
def expand_rich(v):
    text=v.get('text'); styles=v.get('styles',[])
    if not isinstance(text,str) or not text.strip() or len(text)>3000: raise ValueError('Enter 1–3,000 characters.')
    length=len(text.encode('utf-16-le'))//2
    if not isinstance(styles,list) or len(styles)>1000: raise ValueError('Invalid text formatting ranges.')
    for s in styles:
        if not isinstance(s,dict) or not isinstance(s.get('start'),int) or not isinstance(s.get('end'),int) or not 0<=s['start']<s['end']<=length or not isinstance(s.get('bold'),bool) or not isinstance(s.get('italic'),bool): raise ValueError('Invalid text formatting range.')
    out=[]
    for m in re.finditer(r'\{\{([a-zA-Z0-9_]+)\}\}|[\s\S]',text):
        pos=len(text[:m.start()].encode('utf-16-le'))//2
        style=next((s for s in reversed(styles) if s['start']<=pos<s['end']),{})
        part=v.get('inline',{}).get(m[1],'') if m[1] else m[0]
        if m[1] and (not isinstance(part,str) or not part or len(part)>300): raise ValueError(f'Enter the {m[1]} field (up to 300 characters).')
        if m[1] and re.match(r'address(?:_|$)',m[1]): style=dict(style,bold=True)
        out.extend(dict(c=c,**{k:style[k] for k in ('bold','italic') if k in style}) for c in part)
    if len(out)>4000: raise ValueError('The text is too long.')
    return out
def layout_at_size(fs,v,t,right,paragraph):
    chars=expand_rich(v); rows=[]
    for f in fs:
        row=next((r for r in rows if abs(r[0]['y']-f['y'])<min(r[0]['size'],f['size'])*.3),None)
        if row is None: rows.append([f])
        else: row.append(f)
    rows.sort(key=lambda r:-r[0]['y'])
    for row in rows: row.sort(key=lambda f:f['x'])
    result=[]; values={}; index=0; x=rows[0][0]['x']; last=None
    def measure(ch):
        source=rows[index][0]; base={'bold':False,'italic':False} if paragraph else font_style(source['fontName'])
        name=style_font(source['fontName'],ch.get('bold',base['bold']),ch.get('italic',base['italic']),t['fonts']); font=t['fonts'][name]; glyph=font['glyphs'].get(str(ord(ch['c'])))
        if glyph is None: raise ValueError(f'{name} is missing {ch["c"]}.')
        width=glyph['advance']*source['size']/font['unitsPerEm']*source['horizontalScale']+source['charSpace']+(source['wordSpace'] if ch['c']==' ' else 0)
        return source,name,width
    def next_row():
        nonlocal index,x,last
        index+=1
        if index>=len(rows): raise ValueError(f'Text exceeds the {len(rows)}-line box.')
        x=rows[index][0]['x']; last=None
    words=[]
    for ch in chars:
        if ch['c']=='\r': continue
        if ch['c'].isspace():
            if ch['c']=='\n': words.append([ch])
            elif words and words[-1][0]['c']!=' ': words.append([dict(ch,c=' ')])
        elif words and words[-1][0]['c'] not in (' ','\n'): words[-1].append(ch)
        else: words.append([ch])
    for word in words:
        if word[0]['c']=='\n': next_row(); continue
        if word[0]['c']==' ' and x==rows[index][0]['x']: continue
        width=sum(measure(c)[2] for c in word)
        if x+width>right+.01:
            if word[0]['c']==' ': continue
            if x>rows[index][0]['x']: next_row(); width=sum(measure(c)[2] for c in word)
            if x+width>right+.01: raise ValueError('A word is too wide for this text box.')
        for ch in word:
            source,name,w=measure(ch)
            if last is None or last['fontName']!=name:
                last=dict(source,id=fs[0]['id']+'__rich_'+str(len(result)),fontName=name,x=x,text='',width=0,align='left',label=fs[0]['label']);last.pop('positions',None);last['clip']=[min(f['x'] for f in fs)-source['size']*.2,source['y']-source['size']*.35,right+source['size']*.1,source['y']+source['size']];result.append(last);values[last['id']]=''
            values[last['id']]+=ch['c']; last['width']+=w; x+=w
        row=rows[index]
        if ''.join(ch['c'] for ch in word) in ('•','●','▪') and len(row)>1 and row[0]['text'].strip() in ('•','●','▪'): x=row[1]['x']; last=None
    for row in rows:
        source=row[0]
        if source.get('align') not in ('center','right'): continue
        parts=[f for f in result if abs(f['y']-source['y'])<.01]
        if not parts: continue
        left=min(f['x'] for f in parts); width=max(f['x']+f['width'] for f in parts)-left
        original_right=max(f['x']+f['width'] for f in row)
        shift=((source['x']+original_right-width)/2 if source['align']=='center' else original_right-width)-left
        for f in parts: f['x']+=shift
    return result,values

def layout_rich(fs,v,t,right,paragraph):
    failure=None
    for ratio in (1,.95,.9,.85,.8,.75,.7):
        try: return layout_at_size([dict(f,size=f['size']*ratio,charSpace=f['charSpace']*ratio,wordSpace=f['wordSpace']*ratio) for f in fs],v,t,right,paragraph)
        except ValueError as e:
            if not re.search(r'line box|too wide',str(e)): raise
            failure=e
    raise failure

def resolve_content(t,values,content):
    t=copy.deepcopy(t); values=dict(values); hidden=set(); fields={f['id']:f for f in t['fields']}; groups=t.get('groups',[]); generated=[]
    unknown=set(content)-{g['key'] for g in groups}
    if unknown: raise JobError(['Unknown content groups: '+', '.join(sorted(unknown))])
    def setval(f,text,right=None,left=None):
        if not isinstance(text,str): raise ValueError('Expected text')
        if text.strip()==f['text'].strip(): text=f['text']
        if not text.strip(): hidden.add(f['id']); return
        if text!=f['text'] and right is not None:
            width=text_width(f,text,t); f['x']=left if left is not None else right-width
            if width>right-f['x']+.01: raise ValueError('Text does not fit at its original size.')
            f['width']=width;f['align']='left';f.pop('positions',None)
        values[f['id']]=text
    for g in groups:
        if g['key'] not in content: continue
        fs=[fields[k] for k in g['fieldIds'] if k in fields]
        if not fs: continue
        v=content[g['key']]; kind=g['kind']; bindings=g.get('bindings',{}); bound=lambda k:fields.get(bindings.get(k)); left,right=frame(g,t,fs)
        try:
            if isinstance(v,dict) and v.get('hidden') is True:
                hidden.update(f['id'] for f in fs)
                left=min(f['x'] for f in fs); bottom=min(f['y'] for f in fs); top=max(f['y']+f['size'] for f in fs); size=max(f['size'] for f in fs)
                for slot in t.get('media',[]):
                    if slot['role']=='image' and slot['height']<size*16 and slot['width']<size*16 and slot['x']+slot['width']<=left+size and left-slot['x']-slot['width']<size*4 and slot['y']<top and slot['y']+slot['height']>bottom: slot['hidden']=True
                continue
            if kind=='agents' and not (isinstance(v,dict) and v.get('fieldFormatting')): raise ValueError('Supply agents through the agents list.')
            if kind in ('heading','address','details','text'):
                rich={'rich':True,'text':v,'styles':[]} if isinstance(v,str) else v if isinstance(v,dict) and v.get('rich') else None
                if rich is None: raise ValueError('Enter paragraph text.')
                # A formatting editor opening/returning the original value must
                # not discard source kerning or per-glyph positions.
                expected=[];has_list=any(f['text'].strip() in ('•','●','▪') for f in fs)
                for i,f in enumerate(fs):
                    if i:
                        prev=fs[i-1];same_row=abs(prev['y']-f['y'])<min(prev['size'],f['size'])*.3
                        sep=' ' if same_row or (kind=='details' and not has_list) else '\n'
                        expected.append(dict(c=sep,bold=False,italic=False))
                    style=font_style(f['fontName'])
                    expected.extend(dict(c=c,**style) for c in values.get(f['id'],f['text']).strip())
                expanded=expand_rich(rich)
                if len(expanded)==len(expected) and all(a['c']==b['c'] and (a['c'].isspace() or (a.get('bold',False)==b['bold'] and a.get('italic',False)==b['italic'])) for a,b in zip(expanded,expected)): continue
                original=(' ' if kind=='details' else '\n').join(values.get(f['id'],f['text']) for f in fs)
                if isinstance(v,str) and original==v: continue
                if kind=='details':
                    addresses=[f for f in fs if font_style(f['fontName'])['bold'] and re.search(r'^\d[\w/ -]*.*\b(?:street|st|road|rd|avenue|ave|drive|dr|lane|ln|court|ct|place|pl|crescent|cres|way|parade|pde)\b',f['text'].strip(),re.I)]
                    for i,_ in enumerate(addresses):
                        key='address' if i==0 else 'address_'+str(i+1)
                        if '{{'+key+'}}' not in rich['text']: raise ValueError('Keep {{'+key+'}} in this paragraph and edit the Address field below.')
                first=fs[0];second=next((f for f in fs if f['y']<first['y']-first['size']*.3),None)
                if kind=='address' and second and first['size']>second['size']*1.5 and '\n' not in rich['text']: rich=dict(rich,text=re.sub(r'^(\d+[\w/-]*)\s+',r'\1\n',rich['text']))
                laid,laid_values=layout_rich(fs,rich,t,right,kind=='details');hidden.update(f['id'] for f in fs);generated.extend(laid);values.update(laid_values)
            else:
                if not isinstance(v,dict): raise ValueError('Supply a content object.')
                if kind=='sale':
                    if v.get('type')=='original': continue
                    if v.get('type')=='auction':
                        dt=datetime.strptime(v.get('date','')+' '+v.get('time',''),'%Y-%m-%d %H:%M'); d=dt.day
                        suffix='th' if 11<=d%100<=13 else {1:'st',2:'nd',3:'rd'}.get(d%10,'th')
                        text=f"Auction: {d}{suffix} {dt.strftime('%b')} at {dt.hour%12 or 12}:{dt.minute:02d} {'am' if dt.hour<12 else 'pm'}"
                    elif v.get('type')=='for_sale': text=fs[0]['text'] if re.match(r'for\s+sale',fs[0]['text'],re.I) else 'For Sale:'
                    else: raise ValueError('Choose For Sale or Auction.')
                    f=fs[0]; width=text_width(f,text,t); ratio=min(1,(right-f['x'])/max(width,.01))
                    if ratio<.55: raise ValueError('Auction details need a wider sale area.')
                    f['size']*=ratio; f['charSpace']*=ratio; f['wordSpace']*=ratio; f['align']='left'
                    if f.get('clip'): f['clip']=[f['clip'][0],f['clip'][1],max(f['clip'][2],right),f['clip'][3]]
                    setval(f,text); hidden.update(f['id'] for f in fs[1:])
                elif kind=='viewing':
                    if v.get('mode') not in ('appointment','custom'): raise ValueError('Choose By appointment or custom.')
                    f=bound('text'); label=bound('label')
                    if not f: raise ValueError('Assign the viewing field.')
                    text='By Appointment' if v['mode']=='appointment' else v.get('text','')
                    if not isinstance(text,str) or not text.strip(): raise ValueError('Enter viewing details.')
                    available=f['x']+f['width']-(label['x']+label['width']+f['size']*.5 if label else f['x'])
                    if text_width(f,text,t)>available+.01: raise ValueError('Viewing details do not fit beside the label.')
                    setval(f,text,f['x']+f['width'])
                elif kind=='agency':
                    if not isinstance(v.get('visible'),bool): raise ValueError('Choose Show or None.')
                    if not v['visible']: hidden.update(f['id'] for f in fs); continue
                    for key in ('phone','contact'):
                        f=bound(key)
                        if f:
                            text=v.get(key,f['text'])
                            if not isinstance(text,str): raise ValueError('Expected text')
                            width=text_width(f,text,t); available=right-f['x']; ratio=min(1,available/max(width,.01))
                            if .55<=ratio<1:
                                f['size']*=ratio; f['charSpace']*=ratio; f['wordSpace']*=ratio
                                f.pop('positions',None)
                            setval(f,text)
                elif kind=='features':
                    for key in ('beds','baths','cars'):
                        f=bound(key)
                        if f:
                            if not isinstance(v.get(key),str) or not re.fullmatch(r'\d{1,2}',v[key]): raise ValueError('Use a whole number from 0 to 99.')
                            setval(f,re.match(r'^\s*',f['text'])[0]+v[key]+re.search(r'\s*$',f['text'])[0])
            if isinstance(v,dict) and v.get('fieldFormatting'):
                for id,styles in v['fieldFormatting'].items():
                    f=next((f for f in fs if f['id']==id),None)
                    if f is None: raise ValueError('Unknown formatted field.')
                    if id in hidden: continue
                    text=values.get(id,f['text'])
                    if not text.strip():
                        if f['role'].endswith('_email') or kind=='agency': hidden.add(id);continue
                        raise ValueError('This field is required.')
                    obstacles=[r['x']-f['size']*.3 for r in t['fields'] if r['id']!=id and r['x']>f['x']+f['width']+.2 and abs(r['y']-f['y'])<max(r['size'],f['size'])*.6]
                    edge=right if kind=='viewing' else max(f['x']+f['width'],min([f.get('clip',[0,0,f['x']+f['width']+f['size']])[2],t['sourceWidth']*.96]+obstacles))
                    expanded=dict(f,clip=[min(f['x']-f['size']*.2,f.get('clip',[f['x']])[0]),min(f['y']-f['size']*.35,f.get('clip',[0,f['y']])[1]),edge+f['size']*.1,max(f['y']+f['size'],f.get('clip',[0,0,0,f['y']])[3])])
                    if f.get('clip') and (f.get('align')=='right' or (not f.get('align') and f['x']-f['clip'][0]>f['size']*.5 and abs(f['x']+f['width']-f['clip'][2])<.2)):
                        expanded['x']=f['clip'][0];expanded['width']=f['x']+f['width']-expanded['x'];expanded['align']='right'
                    laid,laid_values=layout_rich([expanded],{'rich':True,'text':values.get(id,f['text']),'styles':styles},t,edge,False);hidden.add(id);generated.extend(laid);values.update(laid_values)
        except (ValueError,TypeError,KeyError) as e: raise JobError([f"{g['label']}: {e}"]) from e
    t['fields']=[f for f in t['fields'] if f['id'] not in hidden]+generated
    return t,values

def export_scale(t):
    return .25 if t['spec'].get('product','edgewrap') in ('edgewrap','linea','bannerwrap','pointer','other_signboard') else 1

def job_defaults(t,job):
    defaults=t.get('defaults')
    if not defaults: return job
    if not isinstance(job.get('text',{}),dict) or not isinstance(job.get('content',{}),dict): raise JobError(['Text and content must be objects.'])
    accepted={f['id'] for f in t['fields']}|{f['role'] for f in t['fields'] if f['role'].startswith('agent')}
    fallback={k:v for k,v in defaults.get('text',{}).items() if k in accepted}
    for f in t['fields']:
        if f['role'] in job.get('text',{}): fallback.pop(f['id'],None)
    media={}
    for key,v in defaults.get('media',{}).items():
        media[key]=dict(v['image'],fit=v.get('fit','cover'),focalX=v.get('focalX',.5),focalY=v.get('focalY',.5)) if v['kind']=='image' else ({'url':v['url']} if v['kind']=='qr' else {'sourceSlot':v['slotId'],**{k:v[k] for k in ('fit','focalX','focalY') if k in v}})
    return dict(job,media={**media,**job.get('media',{})},text={**fallback,**job.get('text',{})},content={**defaults.get('content',{}),**job.get('content',{})},oneAgent=job.get('oneAgent',defaults.get('oneAgent',False)))

def correct_safe_text(t):
    s=t['spec']
    if s.get('product') not in ('brochure','mailcard','business_card'): return t
    scale=source_frame(s)[0]*MM/t['sourceWidth']; b=bleed(s)
    left=b['left']*MM/scale if s['sourceIncludesBleed'] else 0
    bottom=b['bottom']*MM/scale if s['sourceIncludesBleed'] else 0
    margin=5*MM/scale+.05
    safe=[left+margin,bottom+margin,left+s['faceWidth']*MM/scale-margin,bottom+s['faceHeight']*MM/scale-margin]
    def ink(f):
        font=t['fonts'].get(f['fontName'])
        if not font: return f.get('bounds',[f['x'],f['y']-f['size']*.2,f['x']+f['width'],f['y']+f['size']*.8])
        boxes=[]; advance=0; scale=f['size']/font['unitsPerEm']
        for i,c in enumerate(f['text']):
            g=font['glyphs'].get(str(ord(c)))
            if not g: continue
            offset=f['positions'][i] if len(f.get('positions',[]))==len(f['text']) else advance
            if g.get('bounds'):
                q=g['bounds']; boxes.append([f['x']+offset+q[0]*scale*f['horizontalScale'],f['y']+q[1]*scale,f['x']+offset+q[2]*scale*f['horizontalScale'],f['y']+q[3]*scale])
            advance+=g['advance']*scale*f['horizontalScale']+f['charSpace']+(f['wordSpace'] if c==' ' else 0)
        return [min(q[0] for q in boxes),min(q[1] for q in boxes),max(q[2] for q in boxes),max(q[3] for q in boxes)] if boxes else [f['x'],f['y'],f['x']+f['width'],f['y']]
    groups=[g['fieldIds'] for g in t.get('groups',[])]; used={i for g in groups for i in g}
    groups += [[f['id']] for f in t['fields'] if f['id'] not in used]; moves={}
    for ids in groups:
        fields=[f for f in t['fields'] if f['id'] in ids]
        if not fields: continue
        boxes=[ink(f) for f in fields]; q=[min(v[0] for v in boxes),min(v[1] for v in boxes),max(v[2] for v in boxes),max(v[3] for v in boxes)]
        if q[2]-q[0]>safe[2]-safe[0] or q[3]-q[1]>safe[3]-safe[1]: continue
        dx=max(safe[0]-q[0],min(0,safe[2]-q[2])); dy=max(safe[1]-q[1],min(0,safe[3]-q[3]))
        if abs(dx)<.0001 and abs(dy)<.0001: continue
        for f in fields: moves[f['id']]=(dx,dy)
    if not moves: return t
    fields=[]
    for f in t['fields']:
        if f['id'] in moves:
            dx,dy=moves[f['id']]; f=dict(f,x=f['x']+dx,y=f['y']+dy)
            for k in ('bounds','clip'):
                if f.get(k): f[k]=[v+(dy if i%2 else dx) for i,v in enumerate(f[k])]
        fields.append(f)
    return dict(t,fields=fields,safeTextCorrected=True)

def evaluate(t,job):
    job=job_defaults(t,job)
    if t.get('pages'):
        results=[evaluate(p,page_job(t,p,job)) for p in t['pages']]
        return t,[f for _,fields,_,_ in results for f in fields],1,[f'Page {i+1}: {issue}' for i,(_,_,_,issues) in enumerate(results) for issue in issues]
    t=correct_safe_text(t)
    t=dict(t,fields=[dict(f) for f in t['fields']])
    for f in t['fields']:
        card=re.match(r'^(agent[12])_(name|phone|email)$',f['role'])
        if '@' in f['text']:
            center=f['x']+f['width']/2
            peer=next((r for r in t['fields'] if re.match(r'agent[12]_(name|phone)',r['role']) and 0<r['y']-f['y']<f['size']*4 and abs(r['x']+r['width']/2-center)<max(1,f['size']*.12) and abs(r['x']-f['x'])>.4),None)
            if peer: f['align']='center'
        if not card: continue
        name=next((r for r in t['fields'] if r['role']==card[1]+'_name'),None)
        phone=next((r for r in t['fields'] if r['role']==card[1]+'_phone'),None)
        if name and phone and abs(name['y']-phone['y'])<min(name['size'],phone['size'])*.3:
            if card[2]=='phone':
                f['align']='left'; f['flowAfter']=name['id'];f['flowAfterRole']=name['role']
                positions=name.get('positions',[]);count=len(name['text'].rstrip())
                f['flowGap']=f['x']-name['x']-(positions[count] if count<len(positions) else name['width'])
            elif card[2]=='name' or abs(f['x']-name['x'])<f['size']*.5: f['align']='left'

    values={}; supplied=job.get('text',{}); accepted={f['id'] for f in t['fields']}|{f['role'] for f in t['fields'] if f['role'].startswith('agent')}
    if not isinstance(supplied,dict): raise JobError(['Text must be an object.'])
    if set(supplied)-accepted: raise JobError(['Unknown text key: '+', '.join(sorted(set(supplied)-accepted))])
    for f in t['fields']:
        if f['id'] in supplied: values[f['id']]=supplied[f['id']]
        elif f['role'].startswith('agent') and f['role'] in supplied: values[f['id']]=supplied[f['role']]
    one=job.get('oneAgent',False)
    if 'agents' in job:
        agents=job['agents']
        if not isinstance(agents,list) or not 1<=len(agents)<=2: raise JobError(['Supply one or two agents.'])
        one=len(agents)==1
        for i,a in enumerate(agents,1):
            if not isinstance(a,dict) or any(not isinstance(a.get(k),str) or not a[k].strip() for k in ('name','phone')): raise JobError(['Each agent requires name and phone.'])
            if not any(f['role'].startswith(f'agent{i}_') for f in t['fields']): raise JobError(['This template does not have that agent slot.'])
            for f in t['fields']:
                for k in ('name','phone'):
                    if f['role']==f'agent{i}_{k}': values[f['id']]=a[k]
    if any(not isinstance(v,str) for v in values.values()): raise JobError(['Text values must be strings.'])
    content=job.get('content',{})
    if not isinstance(content,dict): raise JobError(['Content must be an object.'])
    t,values=resolve_content(t,values,content); s=t['spec']; b=bleed(s); sw,sh=source_frame(s)
    if not all(isinstance(v,(int,float)) and math.isfinite(v) and (0<=v<=300 if s.get('product')=='letter' else 0<v<=300) for v in b.values()): raise JobError(['Positive bleed up to 300 mm is required.'])
    if not all(50<=s[k]<=15000 for k in ('faceWidth','faceHeight')): raise JobError(['Invalid face dimensions.'])
    if abs((sw/sh)/(t['sourceWidth']/t['sourceHeight'])-1)>(.005 if s.get('product')=='letter' else .003): raise JobError(['Source and final dimensions have different proportions.'])
    scale=sw*MM/t['sourceWidth']; left=b['left']*MM/scale if s['sourceIncludesBleed'] else 0; bottom=b['bottom']*MM/scale if s['sourceIncludesBleed'] else 0
    right=left+s['faceWidth']*MM/scale; top=bottom+s['faceHeight']*MM/scale
    safe=5 if s.get('product') in ('brochure','mailcard','business_card') else 0; margin=safe*MM/scale
    errors=[]; issues=print_issues(t); rendered=[]
    for f in t['fields']:
        if one and f['role'].startswith('agent2_'): continue
        value=unicodedata.normalize('NFC',values.get(f['id'],f['text'])); font=t['fonts'].get(f['fontName'])
        if not value.strip() and f['role'].endswith('_email'): continue
        if not value.strip() or len(value)>300: errors.append(f"{f['label']}: enter 1–300 characters."); continue
        if not font: errors.append(f"Missing font: {f['fontName']}"); continue
        missing=sorted(set(c for c in value if str(ord(c)) not in font['glyphs']))
        if missing: errors.append(f"{f['label']}: missing font characters {' '.join(missing)}"); continue
        fs=f['size']/font['unitsPerEm']; width=0; offsets=[]
        for c in value:
            offsets.append(width); width+=font['glyphs'][str(ord(c))]['advance']*fs*f['horizontalScale']+f['charSpace']+(f['wordSpace'] if c==' ' else 0)
        if value==f['text'] and len(f.get('positions',[]))==len(value): offsets=f['positions']; width=f['width']
        clip=f.get('clip')
        if clip and value!=f['text'] and (f['role'].startswith('agent') or re.search(r'@|\.(?:com|au|net)\b',f['text'],re.I)):
            obstacles=[r['x'] for r in t['fields'] if r['id']!=f['id'] and r['x']>f['x'] and abs(r['y']-f['y'])<max(r['size'],f['size'])]
            obstacles += [r['x'] for r in t.get('fixedText',[]) if r['x']>f['x'] and abs(r['y']-f['y'])<max(r['size'],f['size'])]
            obstacles += [r['x'] for r in t.get('media',[]) if r['x']>f['x'] and r['y']<f['y']+f['size'] and r['y']+r['height']>f['y']]
            edge=min([right]+obstacles)-f['size']*.3
            f=dict(f,clip=[clip[0],clip[1],max(clip[2],min(edge,f['x']+width+f['size']*.1)),clip[3]])
        right_aligned=f.get('align')=='right' or (not f.get('align') and clip and f['x']-clip[0]>f['size']*.5 and abs(f['x']+f['width']-clip[2])<.2)
        if right_aligned: f=dict(f,x=f['x']+f['width']-width)
        elif f.get('align')=='center': f=dict(f,x=f['x']+(f['width']-width)/2)
        if f.get('flowAfter'):
            previous=[r for r in t['fields'] if r['id']==f['flowAfter'] or (f.get('flowAfterRole') and r['role']==f['flowAfterRole'] and abs(r['y']-f['y'])<r['size']*.3)]
            if previous:
                edge=max(r['x']+text_width(r,values.get(r['id'],r['text']).rstrip(),t) for r in previous)
                f=dict(f,x=edge+f.get('flowGap',0))
                if f.get('clip'): f['clip']=[min(f['clip'][0],f['x']-f['size']*.2),*f['clip'][1:]]
        boxes=[(f['x']+off+g['bounds'][0]*fs*f['horizontalScale'],f['y']+g['bounds'][1]*fs,f['x']+off+g['bounds'][2]*fs*f['horizontalScale'],f['y']+g['bounds'][3]*fs) for c,off in zip(value,offsets) if (g:=font['glyphs'][str(ord(c))]).get('bounds')]
        box=(min((r[0] for r in boxes),default=f['x']),min((r[1] for r in boxes),default=f['y']),max((r[2] for r in boxes),default=f['x']),max((r[3] for r in boxes),default=f['y']))
        if min(f['x'],box[0])<left-.01 or max(f['x']+width,box[2])>right+.01 or box[1]<bottom-.01 or box[3]>top+.01: errors.append(f"{f['label']} extends outside the visible face.")
        if safe and (box[0]<left+margin-.01 or box[2]>right-margin+.01 or box[1]<bottom+margin-.01 or box[3]>top-margin+.01): issues.append(f"{value if f['label']==f['text'] or '__rich_' in f['id'] else f['label']} enters the {safe} mm safe text margin.")
        clip=f.get('clip')
        if clip and (box[0]<clip[0]-.2 or box[1]<clip[1]-.2 or box[2]>clip[2]+.2 or box[3]>clip[3]+.2): errors.append(f"{f['label']} extends outside its original frame.")
        rendered.append(dict(f, value=value,offsets=offsets,font=font,box=box))
    def overlap(a,b): return a[0]<b[2] and a[2]>b[0] and a[1]<b[3] and a[3]>b[1]
    for i,f in enumerate(rendered):
        for other in rendered[i+1:]:
            if overlap(f['box'],other['box']):
                original=f['value']==f['text'] and other['value']==other['text']
                (issues if original else errors).append(f"{f['label']} and {other['label']} overlap"+(" in the original PDF. Correct before print export." if original else "."))
        for fixed in t.get('fixedText',[]):
            if overlap(f['box'],fixed.get('bounds') or (fixed['x'],fixed['y']-fixed['size']*.2,fixed['x']+fixed['width'],fixed['y']+fixed['size']*.75)): errors.append(f"{f['label']} overlaps fixed text ({fixed['text']}).")
    for fixed in t.get('fixedText',[]):
        box=fixed.get('bounds') or (fixed['x'],fixed['y']-fixed['size']*.2,fixed['x']+fixed['width'],fixed['y']+fixed['size']*.75)
        if safe and (box[0]<left+margin-.01 or box[2]>right-margin+.01 or box[1]<bottom+margin-.01 or box[3]>top-margin+.01): issues.append(f"Fixed text ({fixed['text']}) enters the safe text margin.")
    if errors: raise JobError(errors)
    return t,rendered,scale,issues

def stream(data,**entries):
    obj=DecodedStreamObject(); obj.set_data(data.encode('ascii') if isinstance(data,str) else data)
    for k,v in entries.items(): obj[NameObject('/'+k)]=v
    return obj

def forms_in(page):
    result={}; seen=set()
    def walk(resources):
        for ref in resources.get('/XObject',{}).get_object().values() if '/XObject' in resources else []:
            obj=ref.get_object()
            if id(obj) in seen: continue
            seen.add(id(obj))
            if '/SignboardSlot' in obj:
                resources=obj.get('/Resources',{}).get_object(); original=resources.get('/XObject',{}).get_object().get('/Original') if '/XObject' in resources else None
                result[str(obj['/SignboardSlot'])]=(obj,ref,original)
            if '/Resources' in obj: walk(obj['/Resources'])
    walk(page['/Resources']); return result

def replace_form(obj,raw,resources):
    for key in ('/Filter','/DecodeParms'): obj.pop(key,None)
    obj._data=zlib.compress(raw.encode('ascii')); obj[NameObject('/Filter')]=NameObject('/FlateDecode'); obj.decoded_self=None; obj[NameObject('/Resources')]=resources

def image_form(writer,data,image_profile=None):
    reader=PdfReader(io.BytesIO(data)); p=reader.pages[0]
    if len(reader.pages)!=1: raise JobError(['Image assets must have one page.'])
    resources=p['/Resources'].clone(writer)
    if image_profile:
        spaces=resources.get('/ColorSpace',DictionaryObject()).get_object()
        spaces[NameObject('/DefaultCMYK')]=ArrayObject([NameObject('/ICCBased'),writer._add_object(stream(image_profile,N=NumberObject(4),Alternate=NameObject('/DeviceCMYK')).flate_encode())])
        resources[NameObject('/ColorSpace')]=spaces
    obj=stream(p.get_contents().get_data(),Type=NameObject('/XObject'),Subtype=NameObject('/Form'),BBox=RectangleObject(p.mediabox),Resources=resources)
    return writer._add_object(obj)

def apply_media(writer,page,t,choices,assets,scale,one_agent=False,image_profile=None):
    forms=forms_in(page); slots=t.get('media',[]); known={s['id']:s for s in slots}; keys={s['key']:s for s in slots}; issues=[]
    for key in choices:
        s=known.get(key) or keys.get(key)
        if not s or s['role']=='fixed': raise JobError([f'Unknown editable media key: {key}'])
    for s in slots:
        if s['role']=='fixed': continue
        if s.get('hidden') or (one_agent and s.get('agent')==2):
            if s['id'] in forms: replace_form(forms[s['id']][0],'',DictionaryObject())
            continue
        v=choices.get(s['id'],choices.get(s['key'],{})); v=dict(v)
        if 'url' in v: kind='qr'
        elif 'assetId' in v or 'pdfBase64' in v: kind='image'
        else: kind='original'
        source=known.get(v.get('sourceSlot',s['id'])) or keys.get(v.get('sourceSlot',''))
        untouched=kind=='original' and source is s and not any(k in v for k in ('fit','focalX','focalY'))
        if s.get('flattenedShading') and not untouched: issues.append(f"{s['label']}: shading is baked into fragments; replacement requires source artwork review.")
        for k in ('focalX','focalY'):
            if k in v and (not isinstance(v[k],(int,float)) or not math.isfinite(v[k]) or not 0<=v[k]<=1): raise JobError(['Crop positions must be from 0 to 1.'])
        if s['role']=='qr' and kind!='qr' and not untouched: raise JobError(['Supply a URL for QR fields.'])
        if kind!='qr':
            asset=assets.get(v.get('assetId')) if kind=='image' else None
            if 'pdfBase64' in v: asset=v
            if kind=='image' and not asset: raise JobError(['Image asset was not found.'])
            if kind=='original' and (not source or source['role']=='fixed'): raise JobError(['Original image slot was not found.'])
            pw=asset['width'] if kind=='image' else source['pixelWidth']; ph=asset['height'] if kind=='image' else source['pixelHeight']
            if not all(isinstance(d,(int,float)) and math.isfinite(d) and d>0 for d in (pw,ph)): raise JobError(['Invalid image dimensions.'])
            w=s['width']*scale/72; h=s['height']*scale/72
            dpi=(max if v.get('fit')=='contain' else min)(pw/w,ph/h)
            if s['role']!='qr' and dpi<40 and w*25.4>200 and h*25.4>200: issues.append(f"{s['label']} is about {round(dpi)} dpi at final size.")
        if untouched: continue
        if s['id'] not in forms: raise JobError([f"{s['label']} is missing from the prepared template."])
        obj,ref,_=forms[s['id']]; x0,y0,x1,y1=s['viewport']; w=x1-x0; h=y1-y0; raw=f'q {nums([x0,y0,w,h])} re W n\n'; resources=DictionaryObject()
        if kind=='qr':
            if s['role']!='qr': raise JobError(['This is an image slot, not a QR field.'])
            url=v['url']; parsed=urlsplit(url)
            if parsed.scheme not in ('http','https') or not parsed.netloc or len(url)>2048: raise JobError(['Enter a valid HTTP or HTTPS link.'])
            import qrcode
            style=s['qrStyle']; colours=[style['foreground'],style['background']]
            if any(len(c)!=4 or any(not math.isfinite(x) or not 0<=x<=1 for x in c) for c in colours): raise JobError(['Invalid QR colours.'])
            lum=[]
            for c in colours:
                rgb=[(1-c[i])*(1-c[3]) for i in range(3)]; lum.append(sum((v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4)*weight for v,weight in zip(rgb,[.2126,.7152,.0722])))
            if (max(lum)+.05)/(min(lum)+.05)<4.5: raise JobError(['QR colours need more contrast.'])
            qr=qrcode.QRCode(error_correction=getattr(qrcode.constants,'ERROR_CORRECT_'+style['correction']),border=0); qr.add_data(url); qr.make(fit=True); matrix=qr.get_matrix(); count=len(matrix); quiet=style['quietZone']; total=count+2*quiet
            if quiet<4: issues.append(f"{s['label']}: the QR quiet zone is below four modules; printer review is required.")
            if min(s['width'],s['height'])*scale/MM/total<.3: issues.append('QR modules are below 0.3 mm at final size; shorten the link.')
            a=abs(s['matrix'][0]); d=abs(s['matrix'][3]); physical=min(a*w,d*h); uw=physical/a; uh=physical/d; left=x0+(w-uw)/2; bottom=y0+(h-uh)/2
            raw+=f"{nums(style['background'])} k {nums([x0,y0,w,h])} re f\n{nums(style['foreground'])} k\n"
            for row in range(count):
                for col in range(count):
                    if not matrix[row][col]: continue
                    x=left+(col+quiet)*uw/total; y=bottom+(count-row-1+quiet)*uh/total; mw=uw/total; mh=uh/total
                    eye=(row<7 and col<7) or (row<7 and col>=count-7) or (row>=count-7 and col<7)
                    if style['shape']=='rounded' and not eye:
                        r=min(mw,mh)*.24; c=r*.55228475
                        raw+=f'{nums([x+r,y])} m {nums([x+mw-r,y])} l {nums([x+mw-r+c,y,x+mw,y+r-c,x+mw,y+r])} c {nums([x+mw,y+mh-r])} l {nums([x+mw,y+mh-r+c,x+mw-r+c,y+mh,x+mw-r,y+mh])} c {nums([x+r,y+mh])} l {nums([x+r-c,y+mh,x,y+mh-r+c,x,y+mh-r])} c {nums([x,y+r])} l {nums([x,y+r-c,x+r-c,y,x+r,y])} c h\n'
                    else: raw+=nums([x,y,mw,mh])+' re\n'
            raw+='f\n'
        else:
            if kind=='image': replacement=image_form(writer,base64.b64decode(asset['pdfBase64']),image_profile); divisor=[pw,ph]
            else:
                if source['id'] not in forms or forms[source['id']][2] is None: raise JobError(['Source image is missing.'])
                replacement=forms[source['id']][2]; divisor=[1,1]
            a=abs(s['matrix'][0]); d=abs(s['matrix'][3]); factor=(min if v.get('fit')=='contain' else max)(a*w/pw,d*h/ph); dw=pw*factor/a; dh=ph*factor/d
            tx=x0+(w-dw)*v.get('focalX',.5); ty=y0+(h-dh)*(1-v.get('focalY',.5))
            raw+=f'{nums([dw/divisor[0],0,0,dh/divisor[1],tx,ty])} cm /Replacement Do\n'
            resources=DictionaryObject({NameObject('/XObject'):DictionaryObject({NameObject('/Replacement'):replacement})})
        original=forms[s['id']][2]
        frame_mask=original.get_object().get('/SMask') if original is not None else None
        if kind!='qr' and frame_mask is not None:
            mask_form=writer._add_object(stream(b'/FrameMask Do',Type=NameObject('/XObject'),Subtype=NameObject('/Form'),BBox=RectangleObject([0,0,1,1]),Group=DictionaryObject({NameObject('/S'):NameObject('/Transparency'),NameObject('/CS'):NameObject('/DeviceGray')}),Resources=DictionaryObject({NameObject('/XObject'):DictionaryObject({NameObject('/FrameMask'):frame_mask})})))
            resources[NameObject('/ExtGState')]=DictionaryObject({NameObject('/FrameAlpha'):DictionaryObject({NameObject('/Type'):NameObject('/ExtGState'),NameObject('/SMask'):DictionaryObject({NameObject('/S'):NameObject('/Luminosity'),NameObject('/G'):mask_form})})})
            raw='q /FrameAlpha gs\n'+raw+'Q\n'
        replace_form(obj,raw+'Q',resources)
        for frag in s.get('fragments',[]):
            target=forms.get(frag['id'])
            if not target: raise JobError(['Photo fragment is missing.'])
            m=frag['matrix']; p=s['matrix']; transform=[p[0]/m[0],0,0,p[3]/m[3],(p[4]-m[4])/m[0],(p[5]-m[5])/m[3]]
            replace_form(target[0],f'q {nums(transform)} cm /Group Do Q',DictionaryObject({NameObject('/XObject'):DictionaryObject({NameObject('/Group'):ref})}))
    return issues

def page_job(document,page,job):
    result=dict(job)
    for key,allowed in [('text',{f['id'] for f in document['fields']}|{f['role'] for f in document['fields'] if f['role'].startswith('agent')}),('content',{g['key'] for g in document.get('groups',[])}),('media',{s['id'] for s in document.get('media',[])}|{s['key'] for s in document.get('media',[])})]:
        supplied=job.get(key,{})
        if not isinstance(supplied,dict) or set(supplied)-allowed: raise JobError([f'Unknown or invalid {key} keys.'])
        keys=({f['id'] for f in page['fields']}|{f['role'] for f in page['fields'] if f['role'].startswith('agent')}) if key=='text' else {g['key'] for g in page.get('groups',[])} if key=='content' else {s['id'] for s in page.get('media',[])}|{s['key'] for s in page.get('media',[])}
        result[key]={k:v for k,v in supplied.items() if k in keys}
    if 'agents' in result and not any(f['role'].startswith('agent') for f in page['fields']): result.pop('agents')
    return result

def refresh_generated_bleed(writer,page,raw,g,spec):
    resources=page['/Resources'].get_object()
    objects=resources.get('/XObject',DictionaryObject()).get_object()
    if '/StudioBleed0' not in objects: return raw
    x=g['trimX']*MM;y=g['trimY']*MM;w=spec['faceWidth']*MM;h=spec['faceHeight']*MM;e=1
    saved=DictionaryObject(resources);saved[NameObject('/XObject')]=DictionaryObject(objects)
    form=stream(raw,Type=NameObject('/XObject'),Subtype=NameObject('/Form'),BBox=RectangleObject([x,y,x+w,y+h]),Resources=saved)
    objects[NameObject('/StudioCurrentEdge')]=writer._add_object(form.flate_encode())
    resources[NameObject('/XObject')]=objects
    xs=[(0,x,x+e,e),(x,w,x,w),(x+w,g['width']*MM-x-w,x+w-2*e,e)]
    ys=[(0,y,y+e,e),(y,h,y,h),(y+h,g['height']*MM-y-h,y+h-2*e,e)]
    commands=[]
    for i,(dx,dw,sx,sw) in enumerate(xs):
        for j,(dy,dh,sy,sh) in enumerate(ys):
            if (i==1 and j==1) or dw<=0 or dh<=0: continue
            a=dw/sw;d=dh/sh;r=nums([dx,dy,dw,dh])
            commands.append(f'q {r} re W n 0 0 0 0 k {r} re f '+nums([a,0,0,d,dx-a*sx,dy-d*sy])+' cm /StudioCurrentEdge Do Q')
    return raw+b'\n'+('\n'.join(commands)).encode('ascii')

def finish_print(data,t,icc,finalize):
    import sys
    if not finalize or sys.platform=='emscripten': return data
    version='1.7' if t['spec'].get('product','edgewrap') in SIGNBOARDS and t['spec'].get('product')!='pointer' else '1.3'
    import shutil,subprocess,tempfile,pathlib,os
    executable=shutil.which('gs')
    if not executable: raise JobError(['Ghostscript is required for PDF 1.3 print output. Install Ghostscript or download through the web studio.'])
    with tempfile.TemporaryDirectory() as folder:
        folder=pathlib.Path(folder).resolve();src=folder/'input.pdf';out=folder/'output.pdf';profile=folder/'output.icc'
        background=PdfWriter();background.clone_document_from_reader(PdfReader(io.BytesIO(data)));layers=[]
        for page in background.pages:
            refs=page.get('/Contents',ArrayObject());refs=refs if isinstance(refs,ArrayObject) else [refs];keep=[];text=[]
            for ref in refs:
                obj=ref.get_object()
                if obj.get('/StudioVectorText'):text.append(obj.get_data())
                else:keep.append(ref)
            page[NameObject('/Contents')]=ArrayObject(keep);layers.append(text)
        buf=io.BytesIO();background.write(buf);src.write_bytes(buf.getvalue());profile.write_bytes(base64.b64decode(t['outputProfile']) if t.get('outputProfile') else icc)
        args=[executable,'-sDEVICE=pdfwrite','-dCompatibilityLevel='+version,'-dNoOutputFonts','-dSAFER','-dBATCH','-dNOPAUSE','-dAutoRotatePages=/None','-dDownsampleColorImages=false','-dDownsampleGrayImages=false','-dDownsampleMonoImages=false','-dAutoFilterColorImages=false','-dAutoFilterGrayImages=false','-dColorImageFilter=/FlateEncode','-dGrayImageFilter=/FlateEncode','-sColorConversionStrategy=CMYK','-sProcessColorModel=DeviceCMYK','-dPreserveSeparation=false','-dPreserveDeviceN=false','-r300','-sOutputICCProfile='+str(profile),'-sOutputFile='+str(out),str(src)]
        result=subprocess.run(args,capture_output=True,timeout=180,env={**os.environ,"TMPDIR":str(folder)})
        if result.returncode or not out.exists(): raise JobError(['PDF 1.3 print conversion failed.'])
        result=out.read_bytes()
        if not result.startswith(('%PDF-'+version).encode()): raise JobError(['PDF 1.3 print verification failed.'])
        final=PdfWriter();final.clone_document_from_reader(PdfReader(io.BytesIO(result)))
        if len(final.pages)!=len(layers):raise JobError(['Print conversion changed page count.'])
        for page,text in zip(final.pages,layers):
            refs=page.get('/Contents',ArrayObject());refs=refs if isinstance(refs,ArrayObject) else [refs]
            page[NameObject('/Contents')]=ArrayObject(list(refs)+[final._add_object(stream(raw).flate_encode()) for raw in text])
        final.pdf_header=('%PDF-'+version).encode();buf=io.BytesIO();final.write(buf);return buf.getvalue()

def render(base,template,job,icc,assets=None,finalize=True):
    job=job_defaults(template,job)
    if job.get('mode','print') not in ('proof','print'): raise JobError(['Mode must be proof or print.'])
    if template.get('pages'):
        if template.get('review',{}).get('status')=='proof' and job.get('mode','print')!='proof': raise JobError(['This template is saved for proofs.'],'proof_only')
        source=PdfReader(io.BytesIO(base)); output=PdfWriter(); issues=[]
        if len(source.pages)!=len(template['pages']): raise JobError(['The page manifest and PDF do not match.'])
        for i,p in enumerate(template['pages']):
            single=PdfWriter();single.add_page(source.pages[i]);buf=io.BytesIO();single.write(buf)
            rendered,notes=render(buf.getvalue(),p,page_job(template,p,job),icc,assets,finalize=False)
            reader=PdfReader(io.BytesIO(rendered));output.add_page(reader.pages[0])
            if '/OutputIntents' in reader.trailer['/Root']: output._root_object[NameObject('/OutputIntents')]=reader.trailer['/Root']['/OutputIntents'].clone(output)
            issues.extend(f'Page {i+1}: {n}' for n in notes)
        output.add_metadata({'/Title':template['name']+' - Print','/Creator':'Signboard Studio Python','/Subject':'All artwork pages. Signboards supplied at 25%; other print at 100%.'})
        output.compress_identical_objects(remove_duplicates=True,remove_unreferenced=True)
        buf=io.BytesIO();output.write(buf);return finish_print(buf.getvalue(),template,icc,finalize),issues
    t,fields,scale,issues=evaluate(template,job)
    reader=PdfReader(io.BytesIO(base)); writer=PdfWriter(); page=writer.add_page(reader.pages[0]); page.pop('/Annots',None); page.pop('/AA',None)
    issues+=apply_media(writer,page,t,job.get('media',{}),assets or {},scale,job.get('oneAgent',False) or ('agents' in job and len(job['agents'])==1),icc)
    issues=list(dict.fromkeys(issues))
    if issues and job.get('mode','print')!='proof': raise JobError(issues,'proof_only')
    g=geometry(t['spec']); w=g['width']*MM; h=g['height']*MM; ox=g['offsetX']*MM; oy=g['offsetY']*MM
    original=page.get_contents().get_data() if page.get_contents() is not None else b''
    raw=f'q {nums([scale,0,0,scale,ox,oy])} cm\n'.encode()+original+b'\nQ\n'
    commands=[f'q {nums([scale,0,0,scale,ox,oy])} cm']
    for f in fields:
        commands.append('q '+nums(f['color'])+' k'); sy=f['size']/f['font']['unitsPerEm']; sx=sy*f['horizontalScale']
        for c,off in zip(f['value'],f['offsets']):
            path=f['font']['glyphs'][str(ord(c))]['path']
            if path: commands.append(f"q {nums([sx,0,0,sy,f['x']+off,f['y']])} cm\n{path}\nf Q")
        commands.append('Q')
    commands.append('Q')
    if g['marks']:
        commands.append('0 1 1 0 k')
        for x in (g['trimX']-5,g['trimX']+t['spec']['faceWidth']): commands.append(nums([x*MM,(g['trimY']-5)*MM,5*MM,5*MM])+' re f')
    overlay='\n'.join(commands).encode('ascii')
    full=raw+overlay
    refreshed=refresh_generated_bleed(writer,page,full,g,t['spec'])
    raw+=refreshed[len(full):]
    unit=max(1,math.ceil(max(w,h)*export_scale(t)/14400)); factor=export_scale(t)/unit
    raw=f'q {nums([factor,0,0,factor,0,0])} cm\n'.encode()+raw+b'\nQ'
    overlay=f'q {nums([factor,0,0,factor,0,0])} cm\n'.encode()+overlay+b'\nQ'
    vector=stream(overlay).flate_encode();vector[NameObject('/StudioVectorText')]=NumberObject(1)
    page[NameObject('/Contents')]=ArrayObject([writer._add_object(stream(raw).flate_encode()),writer._add_object(vector)])
    page.mediabox=RectangleObject([0,0,w*factor,h*factor]); page.cropbox=RectangleObject(page.mediabox)
    page.trimbox=RectangleObject([g['trimX']*MM*factor,g['trimY']*MM*factor,(g['trimX']+t['spec']['faceWidth'])*MM*factor,(g['trimY']+t['spec']['faceHeight'])*MM*factor])
    page.bleedbox=RectangleObject([g['slug']['left']*MM*factor,g['slug']['bottom']*MM*factor,(g['slug']['left']+g['bleedWidth'])*MM*factor,(g['slug']['bottom']+g['bleedHeight'])*MM*factor]); page[NameObject('/UserUnit')]=NumberObject(unit)
    if t.get('outputProfile'): icc=base64.b64decode(t['outputProfile'],validate=True)
    profile=writer._add_object(stream(icc,N=NumberObject(4),Alternate=NameObject('/DeviceCMYK')).flate_encode())
    intent=DictionaryObject({NameObject('/Type'):NameObject('/OutputIntent'),NameObject('/S'):NameObject('/GTS_PDFX'),NameObject('/DestOutputProfile'):profile,NameObject('/OutputConditionIdentifier'):TextStringObject('Embedded CMYK profile' if t.get('outputProfile') else 'CGATS TR 001'),NameObject('/Info'):TextStringObject('Source CMYK output profile preserved' if t.get('outputProfile') else 'U.S. Web Coated (SWOP) v2'),NameObject('/RegistryName'):TextStringObject('http://www.color.org')})
    writer._root_object[NameObject('/OutputIntents')]=ArrayObject([writer._add_object(intent)])
    writer.add_metadata({'/Title':t['name']+' - '+('Proof' if job.get('mode')=='proof' else 'Print')+f' {export_scale(t)*100:g} Percent','/Creator':'Signboard Studio Python','/Subject':f"Supplied at {export_scale(t)*100:g}%; print at {100/export_scale(t):g}%. Final face {t['spec']['faceWidth']} x {t['spec']['faceHeight']} mm. Bleed and registration marks scaled together."})
    writer.compress_identical_objects(remove_duplicates=True,remove_unreferenced=True)
    writer.pdf_header=b'%PDF-1.7'; out=io.BytesIO(); writer.write(out)
    return finish_print(out.getvalue(),t,icc,finalize),issues

def render_json(payload):
    p=json.loads(payload)
    data,issues=render(base64.b64decode(p['base']),p['template'],p['job'],base64.b64decode(p['icc']),p.get('assets',{}))
    return json.dumps({'pdf':base64.b64encode(data).decode(),'issues':issues,'engine':'python','scale':export_scale(p['template'])})

def render_edgewrap_json(payload):
    p=json.loads(payload); a=p['template']; job=p['job']
    if not job.get('valid'): raise JobError(job.get('errors',['Invalid job']))
    writer=PdfWriter(); w=337.5*MM; h=490.5*MM; page=writer.add_blank_page(w,h)
    page[NameObject('/Resources')]=DictionaryObject()
    page[NameObject('/Contents')]=writer._add_object(stream(f'0.796 0.675 0.459 0.337 k 0 0 {n(w)} {n(h)} re f\nq\n'+a['staticCommands']+'\nQ'))
    base=io.BytesIO(); writer.write(base)
    fields=[]
    for i,line in enumerate(job['lines']):
        fields.append(dict(id=str(i),role=f"agent{line['agent']+1}_{line['field']}",label=f"Agent {line['agent']+1} {line['field']}",text=line['text'],x=line['x'],y=line['y'],width=line['width'],size=line['size'],fontName='Poppins-SemiBold',horizontalScale=1,charSpace=0,wordSpace=0,color=line['color']))
    t=dict(schemaVersion=1,name='Stone 6x4 Edgewrap',sourceWidth=w,sourceHeight=h,fields=fields,fonts={'Poppins-SemiBold':dict(unitsPerEm=a['unitsPerEm'],glyphs=a['glyphs'])},spec=dict(faceWidth=1220,faceHeight=1832,bleed=65,product='edgewrap',sourceIncludesBleed=True),printIssues=[])
    data,issues=render(base.getvalue(),t,{'mode':'print'},base64.b64decode(a['iccBase64']))
    return json.dumps({'pdf':base64.b64encode(data).decode(),'issues':issues,'engine':'python','scale':.25})

def edgewrap_job(template,agents):
    if not isinstance(agents,list) or not 1<=len(agents)<=2: raise JobError(['Supply one or two agents.'])
    lines=[]; centres={'name':[285.0591257,661.87685135],'phone':[285.0597955,661.8782304]}
    for i,a in enumerate(agents):
        for key in ('name','phone'):
            value=a.get(key,'')
            if not isinstance(value,str) or not value.strip() or len(value)>(120 if key=='name' else 40): raise JobError(['Enter an agent name and phone.'])
            value=unicodedata.normalize('NFC',value.strip()); size=31.2417 if key=='name' else 40.9614
            if any(str(ord(c)) not in template['glyphs'] for c in value): raise JobError(['The agent details contain unsupported characters.'])
            width=sum(template['glyphs'][str(ord(c))]['advance'] for c in value)*size/template['unitsPerEm']
            x=(337.5*MM/2 if len(agents)==1 else centres[key][i])-width/2
            lines.append(dict(text=value,x=x,y=330.5898 if key=='name' else 283.6514,size=size,width=width,color=[.734,.013,.297,0] if key=='name' else [0,0,0,0],agent=i,field=key))
    return {'valid':True,'lines':lines,'agents':agents,'templateId':template['id']}
