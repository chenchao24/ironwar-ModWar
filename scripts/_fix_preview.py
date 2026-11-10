import io

# 1. ui.js：补回 mapName 声明
p = 'js/ui.js'
s = io.open(p, encoding='utf-8').read()
old = "    const diff = AI_DIFFICULTY[this.aiDifficulty] || AI_DIFFICULTY.standard;\n\n    preview.innerHTML = `<div class=\"fh-pv-row\"><span>地图</span><b>歼灭战 1v1</b></div>"
new = "    const diff = AI_DIFFICULTY[this.aiDifficulty] || AI_DIFFICULTY.standard;\n    const mapName = this.settings.map === 'town' ? '东欧小镇' : '开阔平原';\n\n    preview.innerHTML = `<div class=\"fh-pv-row\"><span>地图</span><b>歼灭战 1v1</b></div>"
assert old in s, 'ui anchor'
s = s.replace(old, new, 1)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('ui.js mapName restored')

# 2. index.html：删调试钩子残留
p = 'index.html'
s = io.open(p, encoding='utf-8').read()
old = "<script>\nwindow.__errs = [];\nwindow.addEventListener('error', e => { window.__errs.push(String(e.message || e.type).slice(0, 140) + ' @' + String(e.filename || '').split('/').pop() + ':' + e.lineno); });\nwindow.addEventListener('unhandledrejection', e => { window.__errs.push('REJ: ' + String(e.reason && (e.reason.message || e.reason)).slice(0, 140)); });\n</script>\n"
if old in s:
    s = s.replace(old, '', 1)
    print('index hook removed')
else:
    print('index hook already gone')
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('done')
