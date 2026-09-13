from html.parser import HTMLParser
from pathlib import Path
import json
class SEO(HTMLParser):
    def __init__(self):
        super().__init__(); self.result={'title':'','h1':'','canonical':None,'description':None,'robots':None}; self.capture=None; self.ld=False; self.ld_text=''; self.types=[]; self.graphs=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag in ('title','h1'): self.capture=tag
        if tag=='link' and a.get('rel')=='canonical': self.result['canonical']=a.get('href')
        if tag=='meta' and a.get('name') in ('description','robots'): self.result[a['name']]=a.get('content')
        if tag=='script' and a.get('type')=='application/ld+json': self.ld=True; self.ld_text=''
    def handle_data(self,data):
        if self.capture: self.result[self.capture]+=data
        if self.ld: self.ld_text+=data
    def handle_endtag(self,tag):
        if tag==self.capture: self.capture=None
        if tag=='script' and self.ld:
            self.ld=False
            def walk(v):
                if isinstance(v,dict):
                    typ=v.get('@type'); self.types.extend(typ if isinstance(typ,list) else [typ] if typ else [])
                    for val in v.values(): walk(val)
                elif isinstance(v,list):
                    for val in v: walk(val)
            graph=json.loads(self.ld_text); self.graphs.extend(graph.get('@graph',[])); walk(graph)
    def summary(self):
        return {**{k:' '.join(v.split()) if isinstance(v,str) else v for k,v in self.result.items()},'schemaTypes':sorted(self.types)}
