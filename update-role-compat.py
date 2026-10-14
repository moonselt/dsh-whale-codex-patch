import json,pathlib,difflib
root=pathlib.Path(__file__).resolve().parent
file='assets/whale-widget.js'
spec=json.loads((root/'compat-patches.json').read_text(encoding='utf-8'))
hunks=spec['files'][file]
base=(root/'upgrade-0.4.2'/'upstream'/file).read_text(encoding='utf-8')
previous=base
for h in hunks:
    assert previous.count(h['before'])==1
    previous=previous.replace(h['before'],h['after'],1)
stage=(root/'plugin'/file).read_text(encoding='utf-8')
a,b=previous.splitlines(keepends=True),stage.splitlines(keepends=True)
changes=[]
for group in difflib.SequenceMatcher(None,a,b,autojunk=False).get_grouped_opcodes(1):
    before=''.join(a[group[0][1]:group[-1][2]])
    after=''.join(b[group[0][3]:group[-1][4]])
    indexes=[i for i,h in enumerate(hunks) if h['after'].count(before)==1]
    assert len(indexes)==1,(group[0][1]+1,indexes)
    changes.append((indexes[0],before,after))
for i,before,after in changes:
    hunks[i]['after']=hunks[i]['after'].replace(before,after,1)
for version in spec['supportedVersions']:
    snapshot=root/'original' if version=='0.4.0' else root/f'upgrade-{version}'/'upstream'
    result=(snapshot/file).read_text(encoding='utf-8')
    for h in hunks:
        assert result.count(h['before'])==1,(version,h['line'])
        result=result.replace(h['before'],h['after'],1)
    if version=='0.4.2':assert result==stage,'Staged frontend differs from replay'
(root/'compat-patches.json').write_text(json.dumps(spec,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Updated',len(changes),'frontend hunks without touching upstream content; versions:',spec['supportedVersions'])
