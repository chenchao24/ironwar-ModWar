import io
import re

# ═══ 1. maps.js：删除 war_city 注册 + 布局覆盖 + warCityHeight + buildWarCity（文件尾整块） ═══
p = 'js/maps.js'
s = io.open(p, encoding='utf-8').read()

s = s.replace("  war_city: { id: 'war_city', name: '战火城市', size: 4000, exposure: 1.1 },\n", "")

# 删除布局覆盖导出
old = """// 战火城市布局覆盖（编辑器保存后由 main 注入；null = 程序化网格布局）
let WAR_CITY_LAYOUT_OVERRIDE = null;
export function setWarCityLayout(list) { WAR_CITY_LAYOUT_OVERRIDE = Array.isArray(list) && list.length ? list : null; }

"""
assert old in s; s = s.replace(old, "")

# 删除 buildMap 分支
old = """  if (isTown) buildTown(ctx, des);
  else if (world.mapId === 'war_city') buildWarCity(ctx, des);
  else buildPlains(ctx, des);"""
new = """  if (isTown) buildTown(ctx, des);
  else buildPlains(ctx, des);"""
assert old in s; s = s.replace(old, new)

# 删除 warCityHeight + buildWarCity（从注释行到文件尾）
m = "// ═══════════════════════ 战火城市（2000×2000 网格状城市；主干道贯穿；乌克兰战区参考） ═══════════════════════"
i0 = s.index(m)
s = s[:i0].rstrip() + '\n'
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('maps.js cleaned')

# ═══ 2. main.js：删除懒加载方法 / 资产清单 / 布局拉取 / 出生分支 / import ═══
p = 'js/main.js'
s = io.open(p, encoding='utf-8').read()

# import
old = "import { MAPS, setWarCityLayout } from './maps.js';"
new = "import { MAPS } from './maps.js';"
assert old in s; s = s.replace(old, new)

# _ensureWarCityLayout 方法
old = """  // 布局数据：编辑器保存的 maps/war_city_layout.json（每次开战拉取最新；不存在则用内置默认布局）
  async _ensureWarCityLayout() {
    try {
      const r = await fetch('maps/war_city_layout.json');
      if (r.ok) {
        const l = await r.json();
        if (Array.isArray(l) && l.length) setWarCityLayout(l);
      }
    } catch (e) { /* 无布局文件：用内置默认布局 */ }
  }
"""
assert old in s; s = s.replace(old, "")

# _load then 闸门（改回单资产调用）
old = """      if (this.mapId === 'war_city') {
        await this._ensureWarCityAssets();
        await this._ensureWarCityLayout();
      }"""
new = """      if (this.mapId === 'war_city') await this._ensureWarCityAssets();"""
assert old in s; s = s.replace(old, new)

# _ensureWarCityAssets 方法 + 静态清单（从 "  // 战火城市专属资产" 到方法闭合）
i0 = s.index("  // 战火城市专属资产（约 50MB）：仅选择该地图时懒加载，不拖慢全局启动")
# 方法体结束：找 "    return this._wcAssets;\n  }\n"
i1 = s.index("    return this._wcAssets;\n  }\n", i0) + len("    return this._wcAssets;\n  }\n")
s = s[:i0] + s[i1:]

# _startBattle 懒加载闸门
old = """      // 战火城市：专属资产懒加载（约 50MB，仅首次选图时装载）+ 每次开战拉取最新布局
      if (mapId === 'war_city') {
        if (!this._wcAssets) {
          this.ui.message('战火城市：资源装载中…', 3);
          await this._ensureWarCityAssets();
        }
        await this._ensureWarCityLayout();   // 每次开战拉取最新布局（编辑器保存即生效）
      }"""
assert old in s; s = s.replace(old, "")

# 出生分支
old = """    } else if (this.world.mapId === 'war_city') {
      // 战火城市：主干道南北两端 1640m 对峙（穿越城区正面交战）
      pSpawn = [0, -820]; eSpawn = [0, 820];
    } else {"""
new = """    } else {"""
assert old in s; s = s.replace(old, new)

# async 化还原（无 await 残留则还原为同步）
if 'await this._ensureWarCityAssets' not in s and 'await this._ensureWarCityLayout' not in s:
    s = s.replace("  async _startBattle() {", "  _startBattle() {")
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('main.js cleaned')

# ═══ 3. ui.js：地图名映射还原 ═══
p = 'js/ui.js'
s = io.open(p, encoding='utf-8').read()
old = "    const mapName = { town: '东欧小镇', war_city: '战火城市' }[this.settings.map] || '开阔平原';"
new = "    const mapName = this.settings.map === 'town' ? '东欧小镇' : '开阔平原';"
assert old in s; s = s.replace(old, new)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('ui.js cleaned')

# ═══ 4. index.html：删按钮 + 错误钩子 ═══
p = 'index.html'
s = io.open(p, encoding='utf-8').read()
old = """      <button class="fh-diff-btn" data-map="war_city">战火城市</button>
"""
assert old in s; s = s.replace(old, "")
old = """<script>
window.__errs = [];
window.addEventListener('error', e => { window.__errs.push(String(e.message || e.type).slice(0, 140) + ' @' + String(e.filename || '').split('/').pop() + ':' + e.lineno); });
window.addEventListener('unhandledrejection', e => { window.__errs.push('REJ: ' + String(e.reason && (e.reason.message || e.reason)).slice(0, 140)); });
</script>
"""
assert old in s; s = s.replace(old, "")
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('index.html cleaned')

# ═══ 5. server.js：删保存 API ═══
p = 'server.js'
s = io.open(p, encoding='utf-8').read()
old = """  // 地图编辑器保存接口：POST /api/save-layout → 写入 maps/war_city_layout.json
  if (req.method === 'POST' && urlPath === '/api/save-layout') {
    let body = '';
    req.on('data', (ch) => { body += ch; if (body.length > 512 * 1024) req.destroy(); });
    req.on('end', () => {
      try {
        JSON.parse(body);   // 校验合法 JSON
        fs.writeFileSync(path.join(root, 'maps', 'war_city_layout.json'), body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch (e) { res.writeHead(400); res.end('{"ok":false}'); }
    });
    return;
  }
"""
assert old in s; s = s.replace(old, "")
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('server.js cleaned')

# ═══ 6. PROJECT.md：删两条战火城市条目 ═══
p = 'PROJECT.md'
s = io.open(p, encoding='utf-8').read()
for marker in ['- **新地图「战火城市」（M3.5）**：', '- **战火城市重构 + 地图编辑器（M3.7）**：']:
    i0 = s.index(marker)
    i1 = s.index('\n- **', i0)
    s = s[:i0] + s[i1 + 1:]
# 空行规整
s = re.sub(r'\n{3,}', '\n\n', s)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('PROJECT.md cleaned')
PYEOF