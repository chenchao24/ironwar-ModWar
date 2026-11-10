// ═══ 输入系统：键盘 + 鼠标 + 滚轮 + 指针锁定 ═══

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.firePressed = false;      // 左键按下（边沿）
    this.rmb = false;              // 右键按住
    this.rmbPressed = false;       // 右键按下（边沿，镜内用于切倍率档）
    this.locked = false;
    this.enabled = false;
    this.onKeyDown = null;         // 按键回调（C 键等）

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this._shiftToggle = true;   // Shift 按下沿 = 开/关镜
      if (this.onKeyDown) this.onKeyDown(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.keys.clear(); this.rmb = false; }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.locked) { this.requestLock(); return; }   // 未锁定时点击 = 锁定
      if (e.button === 0) this.firePressed = true;
      if (e.button === 2) this.rmbPressed = true;   // 右键专职切档（不再参与开镜）
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) this.rmb = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    window.addEventListener('wheel', (e) => {
      if (this.locked) this.wheel += Math.sign(e.deltaY);
    }, { passive: true });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  requestLock() {
    if (this.locked) return;
    const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
    if (p && p.catch) p.catch(() => this.canvas.requestPointerLock());
  }
  releaseLock() {
    if (this.locked) document.exitPointerLock();
  }

  key(code) { return this.keys.has(code); }
  // 开镜状态：由 main.js 维护的闩锁（Shift 按下沿切换）；rmb 不再参与开镜（右键专职切档）
  get aiming() { return this._aimLatch || false; }
  set aiming(v) { this._aimLatch = v; }
  // Shift 按下沿（左右 Shift 均可）：开/关镜切换
  consumeShiftToggle() {
    const p = this._shiftToggle;
    this._shiftToggle = false;
    return p;
  }
  // 镜内右键边沿（切倍率档）
  consumeRmb() {
    const p = this.rmbPressed;
    this.rmbPressed = false;
    return p;
  }

  // 每帧读取并清零鼠标增量
  consumeMouse() {
    const d = { dx: this.mouseDX, dy: this.mouseDY, wheel: this.wheel };
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
    return d;
  }
  consumeFire() {
    const f = this.firePressed;
    this.firePressed = false;
    return f;
  }
}
