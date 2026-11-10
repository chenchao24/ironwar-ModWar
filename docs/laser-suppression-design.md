# 激光告警/压制系统（LWS）迭代方案

> 迭代日期：2026-09-06 · 涉及车型：ZTZ-99A（JD-3）、T-90M/T-90SM（Shtora-1 窗帘-1）
> 备份：改动前全量副本 `backup_b2_lws/` 已于迭代结束后清理；本文档记录全部改动与数值，回退可按此反推

## 一、系统定义

现实原型：俄系「窗帘-1」(Shtora-1)、国产 99 式 JD-3 激光压制观瞄系统。软杀伤主动防护：
**激光告警接收机**发现被敌方测距/瞄准 → 自动抛烟幕 + **激光压制器**发射高功率红外激光，
致盲敌方测距仪与炮长瞄准镜（传感器饱和），使对方无法完成精确瞄准射击。

游戏化取舍（已与需求方确认）：

| 现实功能 | 游戏实现 |
|---|---|
| 激光告警接收机 | 玩家被 AI 炮塔锁定时，屏幕上方红色告警框 |
| 自动抛烟幕联动 | **不做**（按需求方决定，AI 不抛烟、无特效） |
| 激光压制器致盲敌方观瞄 | 玩家压制 AI：AI 每 10s 被强制 2.5s 停止瞄准射击（机动照常，无特效，玩家侧显示「激光压制中」提示） |
| 敌方压制器致盲我方 | AI 压制玩家：镜内画面白屏 2.5s（仅开镜瞄准时触发，白屏期间 AI 照常开火） |
| 压制器为炮塔外设备 | 可被机枪/机炮扫伤（分级：受损→发射成功率减半 / 损毁→系统离线），维修包可修，AI 会主动抢修 |

## 二、触发与判定规则

**双向共用触发前提**（每帧判定，挂在 main.js `_updateLaser`）：
1. 玩家处于开镜瞄准状态（`rig.aiming`）且准星射线命中目标（`aimTargetTank`）；
2. 双方视线通畅（`visibility.canSee`：地形/掩体/烟雾均可遮断激光）；
3. 目标处于射手**炮塔正面 ±110° 扇区**内（压制器固定朝向，绕侧/绕后失效——核心反制手段）。

- **告警（AI→玩家提示）**：AI 炮塔锁定玩家（`aimOffset` 收敛 + 在射程内 + 玩家点亮）期间，
  罗盘下方 100px 显示红底白字「⚠ 被激光测距定位」，锁定期结束自动消失。
- **压制（冷却 10s，受击方不叠加）**：射手压制器就绪且目标未被压制 → 发射：
  - 玩家为射手：`enemy.suppressT = 2.5s`，AI 在窗口内不转炮塔瞄准、不开炮、机枪停射，机动照常；
    玩家 HUD 显示绿底「激光压制中 X.Xs」。
  - AI 为射手：`player.suppressT = 2.5s × 难度系数`（新手×0.6 / 标准×1.0 / 王牌×1.3），
    镜内白幕渐入 0.18s / 渐出 0.8s + 「⚠ 被激光压制」字样；关镜免疫（未通过镜内通道观瞄）。
- **被压制方已有 `suppressT > 0` 时不重复触发**（多 AI 防连锁白屏）。

## 三、数值（config.js `LWS_RULES`）

```js
cooldown: 10,            // 发射冷却 s
blindTime: 2.5,          // 致盲窗口 s
sector: 1.92,            // 覆盖半扇区 rad（±110°）
emitterHp: 60,           // 压制器毁伤 HP（机枪/机炮扫）
fireChanceDamaged: 0.5,  // 损伤档发射成功率（未发射不耗冷却）
```

机枪对压制器毁伤点（`SENSOR_RULES.caliber.laser`，与雷达同档）：7.62→2 / 12.7→3 / 30mm→5。

## 四、实现落点

| 文件 | 改动 |
|---|---|
| config.js | `LWS_RULES`；`SENSOR_RULES.caliber` 加 `laser`；三车 cfg 加 `lws:{model}`；AI 三档难度加 `laserBlindMul` |
| tank.js | 构造：`suppressT`（全体）+ `lws{model,cooldown,emitterHp}`；`update()` 冷却/窗口倒计时；`tryLaserSuppress(target, blindTime)`；`applyMGDamage` 压制器分级损伤；`useRepairKit` 可修压制器 |
| ai.js | 被压制（`suppressT>0`）：巡逻停扫掠、侧翼停转炮、交战分支提前 return（炮塔停跟/不开火/机枪停射，机动照常）；炮塔锁定玩家 → `onLase` 回调；损毁压制器纳入 AI 抢修 |
| main.js | `_updateLaser(dt)`（`_updateRanging` 后调用）：告警状态 + 双向压制触发（扇区/LOS/开镜判定）+ HUD 驱动；`_protInfo` 加 lws 行；`onLase` 接线；机库参数表「激光压制」行 |
| ui.js | `setLaseWarn / setLaserSuppress / setLaserBlind`（内容不变不重排）；`_updateProt` 加压制器行 |
| index.html | `#laser-warning`、`#laser-suppress`（hud-top 内）；`#gs-blind` 白幕（gunsight 内）；`#prot-lws` 行 |
| style.css | 告警框（红底白字+脉冲光晕）、压制提示（绿底）、镜内白幕过渡 |

## 五、平衡与体验说明

- 白屏期间 AI 照常开火（现实行为）：玩家侧反制 = 关镜脱离瞄准通道 / 缩回掩体断 LOS / 绕侧打扇区外。
- AI 被压制仅停瞄准射击、机动照常：玩家获得 2.5s 安全输出窗，但 AI 仍会倒车/摆角，不显呆滞。
- 压制器可被机枪扫损毁 → 30mm 机炮（Abrams-X）成为 LWS 车的天敌克制链；维修包可恢复。
- 烟雾/掩体断 LOS 即免疫压制：与既有烟幕战术体系自然衔接。

## 六、验证清单

1. `node --check`（ESM 语法）全绿；
2. 浏览器冒烟：控制台无报错；`__game.player.lws` 存在（选 99A）；
3. 机制验证：`enemies[0].tryLaserSuppress(player)` → `player.suppressT>0` + 镜内白幕 + HUD 文案；
   `player.tryLaserSuppress(enemies[0])` → 敌 `suppressT>0` + 「激光压制中」提示 + AI 窗口内不开火；
4. 实战观察：告警框随 AI 锁定出现/消失；压制周期约 10s；绕侧 >110° 后不再触发。
