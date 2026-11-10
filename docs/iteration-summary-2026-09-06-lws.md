# 迭代总结：激光告警/压制系统（LWS）· 2026-09-06

> 设计文档：`docs/laser-suppression-design.md` · 改动前全量备份（`backup_b2_lws/`）已于迭代结束后清理，本文档记录全部改动与数值

## 一、交付内容

为 **ZTZ-99A（JD-3）** 与 **T-90M「突破-3」/ T-90SM「塔吉尔」（Shtora-1 窗帘-1）** 实装激光告警/压制系统：

| 功能 | 行为 |
|---|---|
| ① 激光告警（玩家侧） | AI 炮塔锁定玩家（对准 + 射程内）期间，罗盘下方 100px 显示红底白字「⚠ 被激光测距定位」（脉冲光晕），解锁自动消失 |
| ② 激光压制（双向自动） | 玩家开镜瞄准 + 准星命中 + LOS 通畅 + 目标在射手炮塔 ±110° 扇区内 → 每 10s 自动发射一次：我方压制敌 AI → 敌 2.5s 停止瞄准射击（机动照常，无烟幕无特效），HUD 显示绿底「激光压制中 X.Xs」；敌方压制玩家 → 镜内白幕 2.5s×难度系数（新手×0.6/标准×1.0/王牌×1.3），快亮 0.18s/慢灭 0.8s，关镜免疫 |
| ③ 压制器可打坏 | 机枪/机炮扫射分级毁伤（7.62→2 / 12.7→3 / 30mm→5 点/有效命中，emitterHp 60）：损伤档发射成功率 50%，损毁系统离线；维修包可修，AI 会主动抢修（与观瞄/雷达共用抢修逻辑） |

## 二、改动文件

- `js/config.js`：`LWS_RULES`（cooldown 10 / blindTime 2.5 / sector ±1.92rad / emitterHp 60 / fireChanceDamaged 0.5）；`SENSOR_RULES.caliber` 加 `laser` 毁伤点；三车 cfg 加 `lws:{model}`
- `js/tank.js`：`suppressT`（被致盲剩余时间，全车通用）+ `lws{model,cooldown,emitterHp}` 初始化；`update()` 双倒计时；`tryLaserSuppress(target, blindTime)`（目标压制中不叠加，损伤档掷骰，未发射不耗冷却）；`applyMGDamage` 压制器分级损伤事件；`useRepairKit` 可修压制器
- `js/ai.js`：`suppressT>0` 时巡逻停扫掠 / 失联停转炮 / 交战分支提前 return（炮塔停跟+不开火+机枪停射，`drive` 已照常执行）；`_setLasing` 沿触发 + `onLase` 回调；难度表加 `laserBlindMul`；压制器损毁纳入 AI 抢修
- `js/main.js`：`_updateLaser(dt)`（`_updateRanging` 后每帧）——告警状态机 + 双向压制触发（开镜/命中/LOS/扇区四重前提）+ HUD 驱动；`_laserCovered` 扇区判定；`onLase` 接线；`_protInfo` 加 lws
- `js/ui.js`：`setLaseWarn / setLaserSuppress / setLaserBlind`（内容不变不重排）；`_updateProt` 加 LWS 行；机库参数表加「激光压制」行
- `index.html`：`#laser-warning`、`#laser-suppress`（hud-top 内）；`#gs-blind` 白幕（gunsight 内，DOM 置于 #gs-flash 后）；`#prot-lws` 防护面板行
- `css/style.css`：告警框（红底白字 + lasePulse 光晕）、压制提示（绿底）、`#gs-blind` 白幕过渡

## 三、验证结果（无头浏览器实测）

1. ✅ `node --check`（ESM）config/tank/ai/main/ui 全绿；
2. ✅ 选 99A 开局：`player.lws.model === 'JD-3'`，保护面板 LWS 行显示「就绪」；
3. ✅ `tryLaserSuppress` 双向触发成功 → 目标 `suppressT=2.5`、射手进 10s 冷却、冷却期内二次触发被拒；
4. ✅ HUD 联动：「激光压制中 2.2s」实时倒计时显示/熄灭；`#gs-blind` 白幕 on/off；
5. ✅ AI 被压制时炮塔角 1.703 → 1.2s 后精确保持 1.703（冻结）；解除后 1.2s 内回调 0.97rad（恢复跟踪）；
6. ✅ 真实交战链路：150m 通视 → 自然点亮 → AI engage 炮塔收敛 → 告警框 1.6s 内自动亮起；
7. ✅ 开镜自然触发：准星压住敌车 → hitLog「激光压制：敌观瞄致盲」+「被激光压制！观瞄致盲」双条目、白幕亮起；
8. ✅ 扇区限制生效：敌方炮塔背对玩家时反击被正确拦下；
9. ✅ 战斗循环无运行时错误（唯一异常为无头测试无用户手势导致的 Pointer Lock 提示，实机点击进入不出现）。

## 四、平衡备注

- 白屏期间 AI 照常开火（现实行为）：反制手段 = 关镜脱离瞄准通道 / 缩掩体断 LOS / 绕侧打 ±110° 扇区外；
- 压制器可被机枪扫坏 → 30mm 机炮车（Abrams-X）是 LWS 车的天敌；维修包每场 1 个，AI 会抢修；
- 敌方告警接收机（①）全车通用（现代坦克标配，纯 UX）；压制器（②③）仅 99A / T-90M / T-90SM 装备，形成选车差异。
