import difflib, json, pathlib, shutil, hashlib
root = pathlib.Path(__file__).resolve().parent
installed = pathlib.Path(r'C:\Users\15593\.dsh\profiles\desktop\node_modules\dsh-whale-widget')
snapshot = root / 'upgrade-0.4.1'
ops = {}
report = []
for relative in ['lib/index.js', 'assets/whale-widget.js']:
    original = (root/'original'/relative).read_text(encoding='utf-8')
    patched = (root/'plugin'/relative).read_text(encoding='utf-8')
    latest = (installed/relative).read_text(encoding='utf-8')
    for folder, content in [('previous-patched', patched), ('upstream', latest)]:
        dest=snapshot/folder/relative; dest.parent.mkdir(parents=True, exist_ok=True); dest.write_text(content, encoding='utf-8', newline='')
    a, b = original.splitlines(keepends=True), patched.splitlines(keepends=True)
    changes = []
    for group in difflib.SequenceMatcher(None, a, b, autojunk=False).get_grouped_opcodes(3):
        old=''.join(a[group[0][1]:group[-1][2]])
        new=''.join(b[group[0][3]:group[-1][4]])
        assert original.count(old)==1, 'Non-unique old hunk '+relative
        changes.append({'before':old,'after':new,'line':group[0][1]+1})
    projected=latest
    for change in changes:
        n=projected.count(change['before'])
        report.append(f"{relative}:{change['line']} exact matches={n}")
        if n==1: projected=projected.replace(change['before'],change['after'],1)
    ops[relative]=changes
    report.append('UPSTREAM CHANGES '+relative+'\n'+''.join(difflib.unified_diff(original.splitlines(True),latest.splitlines(True),fromfile='upstream-0.4.0',tofile='upstream-0.4.1',n=2)))
for relative in ['lib/client.js','lib/codex-subscription.mjs','package.json']:
    dest=snapshot/'previous-patched'/relative;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/'plugin'/relative,dest)
shutil.copy2(installed/'package.json',snapshot/'upstream'/'package.json')
(root/'compat-patches.json').write_text(json.dumps({'supportedVersions':['0.4.0','0.4.1'],'files':ops},ensure_ascii=False,indent=2),encoding='utf-8')
(root/'compat-report.txt').write_text('\n'.join(report),encoding='utf-8')
print('Prepared exact-anchor patch spec and untouched 0.4.1 backup')
print('\n'.join(line for line in report if 'exact matches=' in line))
