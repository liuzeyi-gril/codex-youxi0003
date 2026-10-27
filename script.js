(() => {
  "use strict";

  const WIDTH = 1600;
  const HEIGHT = 900;
  const MAX_LIVES = 3;
  const MAX_ENGINE = 5;
  const TAU = Math.PI * 2;
  const FONT_STACK = '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif';
  const STORAGE_KEYS = {
    bestScore: "chongtian-rocket-best-score-v2",
    bestAltitude: "chongtian-rocket-best-altitude-v2",
    sound: "chongtian-rocket-sound-v2"
  };
  const PART_LABELS = { fin: "尾翼", fuel: "燃料舱", nav: "导航模块" };
  const SUPPLY_LABELS = {
    core: "星核",
    heal: "维修包",
    upgrade: "引擎升级",
    fin: "尾翼零件",
    fuel: "燃料舱零件",
    nav: "导航模块零件"
  };
  const NUMBER_FORMAT = new Intl.NumberFormat("zh-CN");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const random = (min, max) => min + Math.random() * (max - min);
  const randomInt = (min, max) => Math.floor(random(min, max + 1));
  const distanceSquared = (a, b, c, d) => {
    const dx = a - c;
    const dy = b - d;
    return dx * dx + dy * dy;
  };

  function readNumber(key) {
    try {
      return Math.max(0, Number.parseInt(localStorage.getItem(key), 10) || 0);
    } catch (error) {
      return 0;
    }
  }

  function writeNumber(key, value) {
    try {
      localStorage.setItem(key, String(Math.max(0, Math.floor(value))));
    } catch (error) {
      // 本地记录不可用时不影响游戏运行。
    }
  }

  function readSoundPreference() {
    try {
      return localStorage.getItem(STORAGE_KEYS.sound) !== "0";
    } catch (error) {
      return true;
    }
  }

  function writeSoundPreference(enabled) {
    try {
      localStorage.setItem(STORAGE_KEYS.sound, enabled ? "1" : "0");
    } catch (error) {
      // 忽略浏览器对本地存储的限制。
    }
  }

  const stage = document.querySelector("#gameStage");
  const canvas = document.querySelector("#gameCanvas");
  const ctx = canvas.getContext("2d", { alpha: false });

  const dom = {
    scoreValue: document.querySelector("#scoreValue"),
    altitudeValue: document.querySelector("#altitudeValue"),
    coreValue: document.querySelector("#coreValue"),
    coreCard: document.querySelector("#coreCard"),
    engineLevelValue: document.querySelector("#engineLevelValue"),
    componentTracker: document.querySelector("#componentTracker"),
    partSlots: Array.from(document.querySelectorAll(".part-slot")),
    shieldPill: document.querySelector("#shieldPill"),
    shieldTime: document.querySelector("#shieldTime"),
    hearts: document.querySelector("#hearts"),
    lives: Array.from(document.querySelectorAll(".life")),
    pauseBtn: document.querySelector("#pauseBtn"),
    soundBtn: document.querySelector("#soundBtn"),
    playHint: document.querySelector("#playHint"),
    toast: document.querySelector("#toast"),
    startOverlay: document.querySelector("#startOverlay"),
    overOverlay: document.querySelector("#overOverlay"),
    pauseOverlay: document.querySelector("#pauseOverlay"),
    resultTitle: document.querySelector("#resultTitle"),
    resultMessage: document.querySelector("#resultMessage"),
    newRecordBadge: document.querySelector("#newRecordBadge"),
    finalScore: document.querySelector("#finalScore"),
    finalAltitude: document.querySelector("#finalAltitude"),
    finalCores: document.querySelector("#finalCores"),
    finalParts: document.querySelector("#finalParts"),
    finalEngine: document.querySelector("#finalEngine"),
    restartBtn: document.querySelector("#restartBtn"),
    resumeBtn: document.querySelector("#resumeBtn"),
    quitBtn: document.querySelector("#quitBtn"),
    bestScoreStart: document.querySelector("#bestScoreStart"),
    bestAltitudeStart: document.querySelector("#bestAltitudeStart"),
    bestScoreFooter: document.querySelector("#bestScoreFooter"),
    bestAltitudeFooter: document.querySelector("#bestAltitudeFooter"),
    statusText: document.querySelector("#statusText"),
    powerBtn: document.querySelector("#powerBtn"),
    igniteBtn: document.querySelector("#igniteBtn"),
    launchBtn: document.querySelector("#launchBtn"),
    powerState: document.querySelector("#powerState"),
    igniteState: document.querySelector("#igniteState"),
    launchState: document.querySelector("#launchState"),
    launchStatus: document.querySelector("#launchStatus"),
    consoleLed: document.querySelector("#consoleLed"),
    liveStatus: document.querySelector("#liveStatus")
  };

  if (!ctx || !stage || !canvas) {
    return;
  }

  class AudioEngine {
    constructor() {
      this.enabled = readSoundPreference();
      this.context = null;
      this.master = null;
      this.noiseBuffer = null;
    }

    init() {
      if (this.context) {
        if (this.context.state === "suspended") {
          this.context.resume().catch(() => {});
        }
        return;
      }

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        return;
      }

      try {
        this.context = new AudioContextClass();
        this.master = this.context.createGain();
        this.master.gain.value = this.enabled ? 0.42 : 0;
        this.master.connect(this.context.destination);
      } catch (error) {
        this.context = null;
        this.master = null;
      }
    }

    setEnabled(enabled) {
      this.enabled = Boolean(enabled);
      writeSoundPreference(this.enabled);

      if (this.enabled) {
        this.init();
        if (this.master && this.context) {
          this.master.gain.cancelScheduledValues(this.context.currentTime);
          this.master.gain.setTargetAtTime(0.42, this.context.currentTime, 0.035);
        }
        this.tone({ frequency: 520, endFrequency: 760, duration: 0.1, volume: 0.028 });
      } else if (this.master && this.context) {
        this.master.gain.cancelScheduledValues(this.context.currentTime);
        this.master.gain.setTargetAtTime(0.0001, this.context.currentTime, 0.025);
      }
    }

    tone(options) {
      if (!this.enabled) {
        return;
      }

      this.init();
      if (!this.context || !this.master) {
        return;
      }

      const {
        frequency,
        endFrequency = null,
        duration = 0.15,
        type = "sine",
        volume = 0.03,
        delay = 0
      } = options;
      const start = this.context.currentTime + delay;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(Math.max(1, frequency), start);
      if (endFrequency) {
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
      }

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(this.master);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.03);
    }

    noise(options = {}) {
      if (!this.enabled) {
        return;
      }

      this.init();
      if (!this.context || !this.master) {
        return;
      }

      const duration = options.duration || 0.25;
      const volume = options.volume || 0.025;
      const filterFrequency = options.filterFrequency || 800;
      const now = this.context.currentTime;

      if (!this.noiseBuffer) {
        const frameCount = Math.floor(this.context.sampleRate * 1.2);
        this.noiseBuffer = this.context.createBuffer(1, frameCount, this.context.sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        for (let index = 0; index < frameCount; index += 1) {
          data[index] = Math.random() * 2 - 1;
        }
      }

      const source = this.context.createBufferSource();
      const filter = this.context.createBiquadFilter();
      const gain = this.context.createGain();
      source.buffer = this.noiseBuffer;
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(filterFrequency, now);
      filter.frequency.exponentialRampToValueAtTime(Math.max(120, filterFrequency * 0.35), now + duration);
      gain.gain.setValueAtTime(Math.max(0.0002, volume), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      source.start(now);
      source.stop(now + duration);
    }

    play(name) {
      switch (name) {
        case "power":
          this.tone({ frequency: 430, endFrequency: 690, duration: 0.14, type: "triangle", volume: 0.035 });
          this.tone({ frequency: 690, endFrequency: 860, duration: 0.11, type: "sine", volume: 0.025, delay: 0.11 });
          break;
        case "ignite":
          this.noise({ duration: 0.75, volume: 0.055, filterFrequency: 420 });
          this.tone({ frequency: 96, endFrequency: 184, duration: 0.7, type: "sawtooth", volume: 0.045 });
          break;
        case "launch":
          this.noise({ duration: 0.95, volume: 0.075, filterFrequency: 580 });
          this.tone({ frequency: 74, endFrequency: 230, duration: 0.9, type: "sawtooth", volume: 0.06 });
          break;
        case "core":
          this.tone({ frequency: 760, endFrequency: 1160, duration: 0.11, volume: 0.035 });
          this.tone({ frequency: 1080, endFrequency: 1420, duration: 0.13, volume: 0.026, delay: 0.07 });
          break;
        case "heal":
          this.tone({ frequency: 440, endFrequency: 700, duration: 0.22, type: "triangle", volume: 0.032 });
          this.tone({ frequency: 660, endFrequency: 900, duration: 0.2, volume: 0.022, delay: 0.11 });
          break;
        case "upgrade":
          this.tone({ frequency: 330, endFrequency: 780, duration: 0.26, type: "triangle", volume: 0.036 });
          this.tone({ frequency: 650, endFrequency: 1060, duration: 0.22, volume: 0.024, delay: 0.16 });
          break;
        case "part":
          this.tone({ frequency: 510, endFrequency: 940, duration: 0.2, type: "sine", volume: 0.036 });
          this.tone({ frequency: 780, endFrequency: 1280, duration: 0.19, volume: 0.028, delay: 0.1 });
          break;
        case "assembled":
          [523, 659, 784, 1046].forEach((frequency, index) => {
            this.tone({ frequency, duration: 0.26, type: "triangle", volume: 0.03, delay: index * 0.09 });
          });
          break;
        case "hurt":
          this.noise({ duration: 0.24, volume: 0.07, filterFrequency: 360 });
          this.tone({ frequency: 150, endFrequency: 58, duration: 0.3, type: "square", volume: 0.04 });
          break;
        case "shield":
          this.tone({ frequency: 820, endFrequency: 480, duration: 0.3, type: "sine", volume: 0.03 });
          break;
        case "over":
          this.tone({ frequency: 280, endFrequency: 72, duration: 0.72, type: "triangle", volume: 0.05 });
          this.noise({ duration: 0.55, volume: 0.04, filterFrequency: 420 });
          break;
        default:
          break;
      }
    }
  }

  const sound = new AudioEngine();
  const keys = { left: false, right: false };
  const pointer = { active: false, id: null, offset: 0 };

  const state = {
    mode: "ready",
    launchStep: 0,
    elapsed: 0,
    altitude: 0,
    bonusScore: 0,
    score: 0,
    engineLevel: 0,
    cores: 0,
    lives: MAX_LIVES,
    parts: new Set(),
    shield: 0,
    invulnerability: 0,
    wasAssembled: false,
    flash: 0,
    shake: 0,
    deathTimer: 0,
    obstacleTimer: 1.5,
    supplyTimer: 0.7,
    obstacleIndex: 0,
    supplyDeck: [],
    exhaustTimer: 0,
    milestoneIndex: 0,
    stars: [],
    obstacles: [],
    supplies: [],
    particles: [],
    texts: [],
    rocket: {
      x: WIDTH / 2,
      targetX: WIDTH / 2,
      y: HEIGHT * 0.75,
      tilt: 0,
      alive: true
    }
  };

  let toastTimer = 0;
  let hintTimer = 0;
  let bestScore = readNumber(STORAGE_KEYS.bestScore);
  let bestAltitude = readNumber(STORAGE_KEYS.bestAltitude);
  let lastHud = {};
  let lastFrameTime = 0;

  function createStar() {
    return {
      x: random(0, WIDTH),
      y: random(0, HEIGHT),
      size: random(0.6, 2.3),
      alpha: random(0.22, 0.95),
      layer: random(0.35, 1.6),
      phase: random(0, TAU)
    };
  }

  function initializeStars() {
    state.stars = Array.from({ length: 190 }, createStar);
  }

  function setOverlay(element, visible) {
    element.classList.toggle("is-hidden", !visible);
    element.setAttribute("aria-hidden", String(!visible));
  }

  function setStatus(text) {
    dom.statusText.textContent = text;
  }

  function announce(text) {
    dom.liveStatus.textContent = "";
    window.setTimeout(() => {
      dom.liveStatus.textContent = text;
    }, 30);
  }

  function showToast(text, tone = "amber", duration = 1600) {
    window.clearTimeout(toastTimer);
    dom.toast.textContent = text;
    dom.toast.classList.toggle("is-cyan", tone === "cyan");
    dom.toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => {
      dom.toast.classList.remove("is-visible");
    }, duration);
  }

  function showControlHint() {
    window.clearTimeout(hintTimer);
    dom.playHint.classList.add("is-visible");
    hintTimer = window.setTimeout(() => {
      dom.playHint.classList.remove("is-visible");
    }, 5200);
  }

  function syncSoundButton() {
    dom.soundBtn.classList.toggle("is-muted", !sound.enabled);
    dom.soundBtn.setAttribute("aria-label", sound.enabled ? "关闭音效" : "开启音效");
    dom.soundBtn.title = sound.enabled ? "关闭音效" : "开启音效";
  }

  function updateBestLabels() {
    const scoreText = NUMBER_FORMAT.format(bestScore);
    const altitudeText = NUMBER_FORMAT.format(bestAltitude);
    dom.bestScoreStart.textContent = scoreText;
    dom.bestAltitudeStart.textContent = altitudeText;
    dom.bestScoreFooter.textContent = scoreText;
    dom.bestAltitudeFooter.textContent = altitudeText;
  }

  function shuffle(values) {
    const result = values.slice();
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = randomInt(0, index);
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function rebuildSupplyDeck() {
    state.supplyDeck = shuffle(["core", "heal", "upgrade", "fin", "fuel", "nav"]);
  }

  function takeSupplyType() {
    if (!state.supplyDeck.length) {
      rebuildSupplyDeck();
    }
    const type = state.supplyDeck.pop();
    if ((type === "fin" || type === "fuel" || type === "nav") && state.parts.has(type)) {
      return "core";
    }
    return type;
  }

  function updateHud(force = false) {
    const shieldSeconds = Math.ceil(state.shield);
    const snapshot = {
      score: Math.floor(state.score),
      altitude: Math.floor(state.altitude),
      cores: state.cores,
      engine: state.engineLevel,
      lives: state.lives,
      shield: shieldSeconds,
      parts: `${state.parts.has("fin")}${state.parts.has("fuel")}${state.parts.has("nav")}`
    };

    if (force || snapshot.score !== lastHud.score) {
      dom.scoreValue.textContent = NUMBER_FORMAT.format(snapshot.score);
    }
    if (force || snapshot.altitude !== lastHud.altitude) {
      dom.altitudeValue.textContent = NUMBER_FORMAT.format(snapshot.altitude);
    }
    if (force || snapshot.cores !== lastHud.cores) {
      dom.coreValue.textContent = NUMBER_FORMAT.format(snapshot.cores);
    }
    if (force || snapshot.engine !== lastHud.engine) {
      dom.engineLevelValue.textContent = `Lv.${snapshot.engine}`;
    }
    if (force || snapshot.lives !== lastHud.lives) {
      dom.lives.forEach((life, index) => {
        life.classList.toggle("is-lost", index >= snapshot.lives);
      });
      dom.hearts.setAttribute("aria-label", `飞船耐久：${snapshot.lives}`);
    }
    if (force || snapshot.shield !== lastHud.shield) {
      dom.shieldTime.textContent = String(snapshot.shield);
      dom.shieldPill.classList.toggle("is-visible", snapshot.shield > 0);
    }
    if (force || snapshot.parts !== lastHud.parts) {
      dom.partSlots.forEach((slot) => {
        const part = slot.dataset.part;
        slot.classList.toggle("is-collected", state.parts.has(part));
      });
      const collected = state.parts.size;
      dom.componentTracker.classList.toggle("is-complete", collected === 3);
      dom.componentTracker.setAttribute("aria-label", `火箭组件收集进度：${collected} / 3`);
    }

    lastHud = snapshot;
  }
  function updateLaunchUi() {
    const step = state.launchStep;
    dom.powerBtn.disabled = step >= 1;
    dom.igniteBtn.disabled = step !== 1;
    dom.launchBtn.disabled = step !== 2;

    dom.powerBtn.classList.toggle("is-done", step >= 1);
    dom.igniteBtn.classList.toggle("is-done", step >= 2);
    dom.launchBtn.classList.toggle("is-done", false);
    dom.powerState.textContent = step >= 1 ? "完成" : "待命";
    dom.igniteState.textContent = step >= 2 ? "预热完成" : step === 1 ? "可用" : "锁定";
    dom.launchState.textContent = step === 2 ? "准备发射" : "锁定";

    if (step === 0) {
      dom.launchStatus.textContent = "等待启动指令";
    } else if (step === 1) {
      dom.launchStatus.textContent = "系统自检完成 · 点火已解锁";
    } else {
      dom.launchStatus.textContent = "主引擎预热完成 · 发射已解锁";
    }

    dom.consoleLed.classList.toggle("is-on", step >= 1);
    dom.consoleLed.classList.toggle("is-ignited", step >= 2);
    dom.startOverlay.classList.toggle("is-ignited", step >= 2);
    stage.dataset.launchStep = String(step);
  }

  function resetRunData() {
    state.elapsed = 0;
    state.altitude = 0;
    state.bonusScore = 0;
    state.score = 0;
    state.engineLevel = 0;
    state.cores = 0;
    state.lives = MAX_LIVES;
    state.parts = new Set();
    state.shield = 0;
    state.invulnerability = 0;
    state.wasAssembled = false;
    state.flash = 0;
    state.shake = 0;
    state.deathTimer = 0;
    state.obstacleTimer = 1.45;
    state.supplyTimer = 0.65;
    state.obstacleIndex = 0;
    state.exhaustTimer = 0;
    state.milestoneIndex = 0;
    state.obstacles = [];
    state.supplies = [];
    state.particles = [];
    state.texts = [];
    state.rocket.x = WIDTH / 2;
    state.rocket.targetX = WIDTH / 2;
    state.rocket.y = HEIGHT * 0.75;
    state.rocket.tilt = 0;
    state.rocket.alive = true;
    rebuildSupplyDeck();
    lastHud = {};
    updateHud(true);
  }

  function resetToPad() {
    window.clearTimeout(hintTimer);
    dom.playHint.classList.remove("is-visible");
    setOverlay(dom.startOverlay, true);
    setOverlay(dom.overOverlay, false);
    setOverlay(dom.pauseOverlay, false);
    state.mode = "ready";
    state.launchStep = 0;
    resetRunData();
    updateLaunchUi();
    dom.pauseBtn.disabled = true;
    dom.newRecordBadge.classList.add("is-hidden");
    setStatus("待命");
    announce("已返回发射台，等待启动指令");
  }

  function powerOnSequence() {
    if (state.mode !== "ready" || state.launchStep !== 0) {
      return;
    }
    state.launchStep = 1;
    updateLaunchUi();
    setStatus("系统自检");
    sound.play("power");
    showToast("系统通电 · 自检通过", "cyan", 1300);
    announce("启动完成，点火已解锁");
  }

  function igniteSequence() {
    if (state.mode !== "ready" || state.launchStep !== 1) {
      return;
    }
    state.launchStep = 2;
    updateLaunchUi();
    setStatus("引擎预热");
    sound.play("ignite");
    showToast("主引擎点火 · 推力稳定", "amber", 1450);
    announce("点火完成，发射已解锁");
  }

  function startFlight() {
    if (state.mode !== "ready" || state.launchStep !== 2) {
      return;
    }

    sound.init();
    state.mode = "playing";
    state.elapsed = 0;
    state.rocket.alive = true;
    state.rocket.x = WIDTH / 2;
    state.rocket.targetX = WIDTH / 2;
    state.invulnerability = 0.7;
    setOverlay(dom.startOverlay, false);
    setOverlay(dom.overOverlay, false);
    setOverlay(dom.pauseOverlay, false);
    dom.pauseBtn.disabled = false;
    setStatus("正在爬升");
    showToast("发射成功 · 开始爬升", "cyan", 1900);
    showControlHint();
    updateHud(true);
    emitLaunchBurst();
    sound.play("launch");
    announce("火箭已发射，正在爬升。拖动或使用方向键移动火箭。");
  }

  function advanceLaunch() {
    if (state.launchStep === 0) {
      powerOnSequence();
    } else if (state.launchStep === 1) {
      igniteSequence();
    } else {
      startFlight();
    }
  }

  function pauseGame(auto = false) {
    if (state.mode !== "playing") {
      return;
    }
    state.mode = "paused";
    setOverlay(dom.pauseOverlay, true);
    dom.pauseBtn.disabled = true;
    setStatus("已暂停");
    if (auto) {
      showToast("任务窗口失焦，航行已暂停", "cyan", 1600);
    }
  }

  function resumeGame() {
    if (state.mode !== "paused") {
      return;
    }
    state.mode = "playing";
    setOverlay(dom.pauseOverlay, false);
    dom.pauseBtn.disabled = false;
    setStatus("正在爬升");
    lastFrameTime = 0;
  }

  function togglePause() {
    if (state.mode === "playing") {
      pauseGame(false);
    } else if (state.mode === "paused") {
      resumeGame();
    }
  }

  function endGame() {
    if (state.mode === "over") {
      return;
    }

    state.mode = "over";
    state.rocket.alive = false;
    state.shake = 0;
    state.flash = 0;
    setOverlay(dom.pauseOverlay, false);
    setOverlay(dom.overOverlay, true);
    dom.pauseBtn.disabled = true;
    dom.playHint.classList.remove("is-visible");
    setStatus("航程结束");

    const previousBestScore = bestScore;
    const previousBestAltitude = bestAltitude;
    const isNewRecord = state.score > bestScore || state.altitude > bestAltitude;
    bestScore = Math.max(bestScore, Math.floor(state.score));
    bestAltitude = Math.max(bestAltitude, Math.floor(state.altitude));
    writeNumber(STORAGE_KEYS.bestScore, bestScore);
    writeNumber(STORAGE_KEYS.bestAltitude, bestAltitude);
    updateBestLabels();

    dom.newRecordBadge.textContent = isNewRecord ? "新纪录" : "";
    dom.newRecordBadge.classList.toggle("is-hidden", !isNewRecord);
    dom.finalScore.textContent = NUMBER_FORMAT.format(Math.floor(state.score));
    dom.finalAltitude.textContent = `${NUMBER_FORMAT.format(Math.floor(state.altitude))} 米`;
    dom.finalCores.textContent = `${NUMBER_FORMAT.format(state.cores)} 枚`;
    dom.finalParts.textContent = `${state.parts.size} / 3`;
    dom.finalEngine.textContent = `Lv.${state.engineLevel}`;

    let title = "航程中断";
    let message = "这次高度已经写入航行日志，下一次会飞得更远。";
    if (state.altitude >= 12000) {
      title = "抵达近地轨道";
      message = "穿越三层障碍带，冲天号完成了本轮远征。";
    } else if (state.parts.size === 3) {
      title = "冲天号完整返航";
      message = "三类零件全部就位，完全体火箭完成了本次试航。";
    } else if (state.altitude >= 3000) {
      title = "突破云层";
      message = "星核远征已进入预定航段，继续升级引擎冲击更高空域。";
    }

    if (isNewRecord && previousBestScore === 0 && previousBestAltitude === 0) {
      message = "首次航行数据已记录，新的远征纪录由中国航天队保存。";
    }

    dom.resultTitle.textContent = title;
    dom.resultMessage.textContent = message;
    dom.finalScore.setAttribute("aria-label", `最终得分 ${Math.floor(state.score)}`);
    sound.play("over");
    announce(`航行结束，得分 ${Math.floor(state.score)}，飞行高度 ${Math.floor(state.altitude)} 米。`);
  }

  function quitRun() {
    if (state.mode === "paused") {
      setOverlay(dom.pauseOverlay, false);
      endGame();
    }
  }

  function addParticle(options) {
    if (state.particles.length >= 440) {
      state.particles.shift();
    }
    const life = options.life || 0.6;
    state.particles.push({
      x: options.x,
      y: options.y,
      vx: options.vx || 0,
      vy: options.vy || 0,
      life,
      maxLife: life,
      size: options.size || 2,
      color: options.color || "#8befff",
      gravity: options.gravity || 0,
      drag: options.drag || 0,
      glow: Boolean(options.glow),
      line: Boolean(options.line)
    });
  }

  function addFloatingText(text, x, y, color = "#e9fdff") {
    state.texts.push({ text, x, y, color, life: 1.25, maxLife: 1.25 });
  }

  function emitRocketExhaust() {
    if (state.mode !== "playing" && state.mode !== "dying") {
      return;
    }
    const rocket = state.rocket;
    if (!rocket.alive && state.mode !== "dying") {
      return;
    }
    const count = reducedMotion ? 1 : 2;
    for (let index = 0; index < count; index += 1) {
      addParticle({
        x: rocket.x + random(-9, 9),
        y: rocket.y + 43,
        vx: random(-34, 34) - rocket.tilt * 90,
        vy: random(150, 260),
        life: random(0.28, 0.58),
        size: random(2.4, 5.4),
        color: Math.random() > 0.42 ? "#ffb44f" : "#66efff",
        drag: 1.8,
        glow: true
      });
    }
  }

  function emitLaunchBurst() {
    for (let index = 0; index < 52; index += 1) {
      const angle = random(0.5, Math.PI - 0.5);
      const speed = random(90, 360);
      addParticle({
        x: state.rocket.x + random(-15, 15),
        y: state.rocket.y + 40,
        vx: Math.cos(angle) * speed,
        vy: Math.abs(Math.sin(angle)) * speed + 70,
        life: random(0.45, 1.1),
        size: random(2, 6),
        color: Math.random() > 0.35 ? "#ffb758" : "#72f5ff",
        gravity: 80,
        drag: 0.7,
        glow: true
      });
    }
  }

  function emitExplosion(x, y, color = "#ff9a5c", amount = 28, power = 260) {
    const total = reducedMotion ? Math.ceil(amount * 0.55) : amount;
    for (let index = 0; index < total; index += 1) {
      const angle = random(0, TAU);
      const speed = random(40, power);
      addParticle({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: random(0.35, 0.95),
        size: random(1.8, 5.5),
        color: Math.random() > 0.34 ? color : "#dffcff",
        gravity: 44,
        drag: 1.15,
        glow: true
      });
    }
  }

  function emitPickup(x, y, color) {
    for (let index = 0; index < 16; index += 1) {
      const angle = random(0, TAU);
      const speed = random(45, 150);
      addParticle({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: random(0.35, 0.7),
        size: random(1.8, 4),
        color,
        drag: 1.4,
        glow: true
      });
    }
  }

  function spawnObstacle() {
    if (state.obstacles.length >= 11) {
      return;
    }
    const type = ["meteor", "mine", "comet"][state.obstacleIndex % 3];
    state.obstacleIndex += 1;
    const difficulty = 1 + Math.min(0.82, state.elapsed / 90);
    const base = {
      type,
      x: random(WIDTH * 0.09, WIDTH * 0.91),
      y: -125,
      dead: false,
      rotation: random(0, TAU),
      spin: random(-1.4, 1.4),
      sparkTimer: 0
    };

    if (type === "meteor") {
      const radius = random(36, 56);
      const points = [];
      const pointCount = 9;
      for (let index = 0; index < pointCount; index += 1) {
        points.push({
          angle: (index / pointCount) * TAU,
          radius: radius * random(0.78, 1.12)
        });
      }
      state.obstacles.push({
        ...base,
        radius,
        points,
        vx: random(-65, 65),
        vy: random(220, 275) * difficulty,
        color: "#ff9c55"
      });
    } else if (type === "mine") {
      state.obstacles.push({
        ...base,
        radius: 40,
        vx: random(-72, 72),
        vy: random(150, 195) * difficulty,
        pulse: random(0, TAU),
        color: "#ff5f78"
      });
    } else {
      const direction = Math.random() > 0.5 ? 1 : -1;
      state.obstacles.push({
        ...base,
        radius: 27,
        vx: direction * random(105, 160),
        vy: random(360, 435) * difficulty,
        color: "#83eeff"
      });
    }
  }

  function spawnSupply() {
    if (state.supplies.length >= 6) {
      return;
    }
    state.supplies.push({
      type: takeSupplyType(),
      x: random(WIDTH * 0.08, WIDTH * 0.92),
      y: -75,
      vx: random(-34, 34),
      vy: random(118, 158),
      phase: random(0, TAU),
      rotation: random(-0.12, 0.12),
      dead: false
    });
  }

  function collectSupply(supply) {
    if (supply.dead) {
      return;
    }
    supply.dead = true;
    const { x, y, type } = supply;
    let message = "";
    let color = "#ffe29a";

    if (type === "core") {
      state.cores += 1;
      state.bonusScore += 80;
      message = "星核 +80";
      color = "#82f2ff";
      emitPickup(x, y, "#8df5ff");
      sound.play("core");
      dom.coreCard.classList.remove("is-pulsing");
      void dom.coreCard.offsetWidth;
      dom.coreCard.classList.add("is-pulsing");
    } else if (type === "heal") {
      if (state.lives < MAX_LIVES) {
        state.lives += 1;
        message = "维修完成 · 耐久 +1";
      } else {
        state.bonusScore += 120;
        message = "耐久已满 · 转化为 120 分";
      }
      color = "#ff9bad";
      emitPickup(x, y, "#ff849b");
      sound.play("heal");
    } else if (type === "upgrade") {
      if (state.engineLevel < MAX_ENGINE) {
        state.engineLevel += 1;
        state.bonusScore += 60;
        message = `引擎升级 · Lv.${state.engineLevel}`;
      } else {
        state.bonusScore += 160;
        message = "引擎已满级 · 转化为 160 分";
      }
      color = "#ffd26b";
      emitPickup(x, y, "#ffc354");
      sound.play("upgrade");
    } else {
      const partName = PART_LABELS[type];
      if (!state.parts.has(type)) {
        state.parts.add(type);
        state.bonusScore += 100;
        message = `已获得${partName} · 组装 ${state.parts.size}/3`;
      } else {
        state.bonusScore += 80;
        message = `重复${partName} · 转化为 80 分`;
      }
      color = "#ffd178";
      emitPickup(x, y, "#ffc66b");
      sound.play("part");
    }

    if (state.parts.size === 3 && !state.wasAssembled) {
      state.wasAssembled = true;
      state.shield = Math.max(state.shield, 10);
      state.bonusScore += 250;
      message = "冲天号组装完成 · 护盾 10 秒";
      emitExplosion(x, y, "#ffd477", 54, 310);
      sound.play("assembled");
      window.setTimeout(() => sound.play("shield"), 260);
      announce("火箭三类零部件集齐，冲天号完全体组装完成，获得十秒护盾。");
    }

    addFloatingText(message, x, y - 28, color);
    updateHud(true);
  }

  function hurtRocket(obstacle) {
    if (state.mode !== "playing" || !state.rocket.alive || state.invulnerability > 0) {
      return;
    }

    if (state.shield > 0) {
      obstacle.dead = true;
      emitExplosion(obstacle.x, obstacle.y, "#70f0ff", 22, 220);
      addFloatingText("护盾抵挡", obstacle.x, obstacle.y - 20, "#a9faff");
      state.shake = Math.max(state.shake, 7);
      sound.play("shield");
      return;
    }

    state.lives -= 1;
    state.invulnerability = 1.75;
    state.flash = 0.8;
    state.shake = 22;
    obstacle.dead = true;
    emitExplosion(obstacle.x, obstacle.y, "#ff8a68", 34, 290);
    emitExplosion(state.rocket.x, state.rocket.y, "#ffc36e", 18, 180);
    sound.play("hurt");
    updateHud(true);

    if (state.lives <= 0) {
      state.rocket.alive = false;
      state.mode = "dying";
      state.deathTimer = 0.82;
      setStatus("信号中断");
      dom.pauseBtn.disabled = true;
      announce("火箭耐久耗尽，航行即将结束。");
    } else {
      addFloatingText(`耐久 -1 · 剩余 ${state.lives}`, state.rocket.x, state.rocket.y - 54, "#ff91a3");
      showToast(`受到撞击 · 剩余耐久 ${state.lives} 格`, "amber", 1300);
      announce(`火箭受到撞击，剩余耐久 ${state.lives} 格。`);
    }
  }

  function updateRocket(dt) {
    const rocket = state.rocket;
    if (keys.left) {
      rocket.targetX -= 650 * dt;
    }
    if (keys.right) {
      rocket.targetX += 650 * dt;
    }

    rocket.targetX = clamp(rocket.targetX, 58, WIDTH - 58);
    const previousX = rocket.x;
    rocket.x += (rocket.targetX - rocket.x) * Math.min(1, dt * 10);
    const velocity = (rocket.x - previousX) / Math.max(dt, 0.001);
    rocket.tilt += (clamp(velocity * 0.00105, -0.32, 0.32) - rocket.tilt) * Math.min(1, dt * 8);

    state.exhaustTimer -= dt;
    if (state.exhaustTimer <= 0) {
      emitRocketExhaust();
      state.exhaustTimer = reducedMotion ? 0.08 : 0.035;
    }
  }

  function updateObstacles(dt) {
    for (let index = state.obstacles.length - 1; index >= 0; index -= 1) {
      const obstacle = state.obstacles[index];
      if (obstacle.dead) {
        state.obstacles.splice(index, 1);
        continue;
      }

      obstacle.y += obstacle.vy * dt;
      obstacle.x += obstacle.vx * dt;
      obstacle.rotation += obstacle.spin * dt;
      if (obstacle.type === "mine") {
        obstacle.pulse += dt * 3.2;
      }

      if (obstacle.type === "comet") {
        obstacle.sparkTimer -= dt;
        if (obstacle.sparkTimer <= 0) {
          obstacle.sparkTimer = 0.045;
          addParticle({
            x: obstacle.x + random(-8, 8),
            y: obstacle.y - 15,
            vx: -obstacle.vx * 0.08 + random(-20, 20),
            vy: -80 + random(-20, 20),
            life: random(0.22, 0.45),
            size: random(1.5, 3.7),
            color: Math.random() > 0.3 ? "#7defff" : "#d6fdff",
            drag: 0.8,
            glow: true
          });
        }
      }

      if (state.mode === "playing" && state.rocket.alive) {
        const hitRadius = obstacle.radius * 0.7 + 23;
        if (distanceSquared(obstacle.x, obstacle.y, state.rocket.x, state.rocket.y) < hitRadius * hitRadius) {
          hurtRocket(obstacle);
        }
      }

      if (obstacle.y > HEIGHT + 150 || obstacle.x < -220 || obstacle.x > WIDTH + 220) {
        state.obstacles.splice(index, 1);
      }
    }
  }

  function updateSupplies(dt) {
    for (let index = state.supplies.length - 1; index >= 0; index -= 1) {
      const supply = state.supplies[index];
      if (supply.dead) {
        state.supplies.splice(index, 1);
        continue;
      }

      supply.phase += dt * 2.6;
      supply.y += supply.vy * dt;
      supply.x += (supply.vx + Math.sin(supply.phase) * 18) * dt;

      if (state.mode === "playing" && state.rocket.alive) {
        const collectRadius = 45 + 17;
        if (distanceSquared(supply.x, supply.y, state.rocket.x, state.rocket.y) < collectRadius * collectRadius) {
          collectSupply(supply);
          state.supplies.splice(index, 1);
          continue;
        }
      }

      if (supply.y > HEIGHT + 90 || supply.x < -100 || supply.x > WIDTH + 100) {
        state.supplies.splice(index, 1);
      }
    }
  }

  function updateParticles(dt) {
    for (let index = state.particles.length - 1; index >= 0; index -= 1) {
      const particle = state.particles[index];
      particle.life -= dt;
      if (particle.life <= 0) {
        state.particles.splice(index, 1);
        continue;
      }
      particle.vx *= Math.max(0, 1 - particle.drag * dt);
      particle.vy *= Math.max(0, 1 - particle.drag * dt);
      particle.vy += particle.gravity * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
    }
  }

  function updateTexts(dt) {
    for (let index = state.texts.length - 1; index >= 0; index -= 1) {
      const text = state.texts[index];
      text.life -= dt;
      text.y -= 34 * dt;
      if (text.life <= 0) {
        state.texts.splice(index, 1);
      }
    }
  }

  function updateStars(dt, speed) {
    for (const star of state.stars) {
      star.y += speed * star.layer * dt;
      if (star.y > HEIGHT + 4) {
        star.y = -4;
        star.x = random(0, WIDTH);
        star.size = random(0.6, 2.3);
        star.alpha = random(0.22, 0.95);
      }
    }
  }

  const MILESTONES = [
    { altitude: 500, text: "突破云层 · 500 米" },
    { altitude: 1500, text: "进入平流层 · 1500 米" },
    { altitude: 3500, text: "航行高度 3500 米" },
    { altitude: 7500, text: "接近近地轨道 · 7500 米" },
    { altitude: 12000, text: "抵达近地轨道 · 12000 米" },
    { altitude: 20000, text: "远征纪录 · 20000 米" }
  ];

  function updateGame(dt) {
    if (state.mode === "dying") {
      updateParticles(dt);
      updateTexts(dt);
      updateStars(dt, 36);
      state.shake = Math.max(0, state.shake - dt * 30);
      state.flash = Math.max(0, state.flash - dt * 1.9);
      state.deathTimer -= dt;
      if (state.deathTimer <= 0) {
        endGame();
      }
      return;
    }

    if (state.mode !== "playing") {
      updateStars(dt, state.mode === "ready" ? 12 : 4);
      updateParticles(dt);
      updateTexts(dt);
      return;
    }

    state.elapsed += dt;
    const climbSpeed = 34 + state.engineLevel * 10;
    state.altitude += climbSpeed * dt;
    state.score = Math.floor(state.altitude * 0.12) + state.bonusScore;
    state.shield = Math.max(0, state.shield - dt);
    state.invulnerability = Math.max(0, state.invulnerability - dt);
    state.flash = Math.max(0, state.flash - dt * 1.8);
    state.shake = Math.max(0, state.shake - dt * 28);

    updateRocket(dt);
    updateObstacles(dt);
    updateSupplies(dt);
    updateParticles(dt);
    updateTexts(dt);
    updateStars(dt, 34 + climbSpeed * 0.55);

    state.obstacleTimer -= dt;
    if (state.obstacleTimer <= 0) {
      spawnObstacle();
      state.obstacleTimer = Math.max(0.62, random(1.18, 1.62) - Math.min(0.5, state.elapsed * 0.007));
    }

    state.supplyTimer -= dt;
    if (state.supplyTimer <= 0) {
      spawnSupply();
      state.supplyTimer = random(1.1, 1.7);
    }

    while (
      state.milestoneIndex < MILESTONES.length &&
      state.altitude >= MILESTONES[state.milestoneIndex].altitude
    ) {
      const milestone = MILESTONES[state.milestoneIndex];
      showToast(milestone.text, "cyan", 1550);
      announce(milestone.text);
      state.milestoneIndex += 1;
    }

    updateHud();
  }
  function roundRectPath(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  function drawStarPath(context, outerRadius, innerRadius, points = 5) {
    context.beginPath();
    for (let index = 0; index < points * 2; index += 1) {
      const radius = index % 2 === 0 ? outerRadius : innerRadius;
      const angle = -Math.PI / 2 + (index / (points * 2)) * TAU;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    }
    context.closePath();
  }

  function drawBackground(now) {
    const altitudeRatio = clamp(state.altitude / 12000, 0, 1);
    const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    gradient.addColorStop(0, `hsl(${222 - altitudeRatio * 22} 52% ${4 + altitudeRatio * 2}%)`);
    gradient.addColorStop(0.48, `hsl(${214 - altitudeRatio * 18} 44% ${8 + altitudeRatio * 3}%)`);
    gradient.addColorStop(1, `hsl(${202 - altitudeRatio * 26} 39% ${12 + altitudeRatio * 3}%)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const nebula = ctx.createRadialGradient(
      WIDTH * 0.18,
      HEIGHT * 0.36,
      10,
      WIDTH * 0.18,
      HEIGHT * 0.36,
      WIDTH * 0.42
    );
    nebula.addColorStop(0, "rgba(34, 135, 178, 0.16)");
    nebula.addColorStop(0.48, "rgba(43, 85, 153, 0.08)");
    nebula.addColorStop(1, "rgba(3, 8, 20, 0)");
    ctx.fillStyle = nebula;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const violetNebula = ctx.createRadialGradient(
      WIDTH * 0.82,
      HEIGHT * 0.2,
      20,
      WIDTH * 0.82,
      HEIGHT * 0.2,
      WIDTH * 0.36
    );
    violetNebula.addColorStop(0, "rgba(151, 85, 196, 0.13)");
    violetNebula.addColorStop(0.55, "rgba(77, 58, 149, 0.06)");
    violetNebula.addColorStop(1, "rgba(4, 6, 18, 0)");
    ctx.fillStyle = violetNebula;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    drawStars(now);

    ctx.save();
    ctx.globalAlpha = 0.72 - altitudeRatio * 0.2;
    drawPlanet(WIDTH * 0.89, HEIGHT * 0.3, 122 + altitudeRatio * 18, altitudeRatio);
    ctx.restore();

    if (state.altitude < 1500) {
      const atmosphere = ctx.createLinearGradient(0, HEIGHT * 0.66, 0, HEIGHT);
      atmosphere.addColorStop(0, "rgba(50, 161, 208, 0)");
      atmosphere.addColorStop(1, `rgba(50, 156, 205, ${0.14 * (1 - state.altitude / 1500)})`);
      ctx.fillStyle = atmosphere;
      ctx.fillRect(0, HEIGHT * 0.6, WIDTH, HEIGHT * 0.4);
    }

    if (state.altitude > 2600) {
      ctx.save();
      ctx.strokeStyle = "rgba(151, 235, 255, 0.08)";
      ctx.lineWidth = 1;
      const streakSpeed = 120 + state.altitude * 0.005;
      for (let index = 0; index < 9; index += 1) {
        const y = ((now * streakSpeed + index * 131) % (HEIGHT + 220)) - 110;
        const x = 90 + ((index * 227) % (WIDTH - 180));
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 44, y - 15);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawStars(now) {
    ctx.save();
    for (const star of state.stars) {
      const twinkle = 0.72 + Math.sin(now * 1.8 + star.phase) * 0.28;
      const alpha = star.alpha * twinkle;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = star.layer > 1.2 ? "#c9f7ff" : "#e7f8ff";
      if (star.size > 1.7) {
        ctx.shadowColor = "#86e6ff";
        ctx.shadowBlur = 9;
      } else {
        ctx.shadowBlur = 0;
      }
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPlanet(x, y, radius, altitudeRatio) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.18);

    ctx.save();
    ctx.strokeStyle = "rgba(135, 200, 255, 0.13)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 1.62, radius * 0.34, 0, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = "rgba(214, 164, 255, 0.12)";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 1.47, radius * 0.29, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();

    const planet = ctx.createRadialGradient(-radius * 0.34, -radius * 0.38, 4, 0, 0, radius);
    planet.addColorStop(0, altitudeRatio > 0.52 ? "#7168b6" : "#4d8db7");
    planet.addColorStop(0.52, altitudeRatio > 0.52 ? "#373168" : "#225475");
    planet.addColorStop(1, "#081529");
    ctx.fillStyle = planet;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.fill();

    ctx.globalAlpha = 0.32;
    ctx.strokeStyle = "#8cdaf0";
    ctx.lineWidth = 2;
    for (let index = -2; index <= 2; index += 1) {
      ctx.beginPath();
      ctx.ellipse(0, index * radius * 0.22, radius * 0.91, radius * 0.1, 0, 0.1, Math.PI - 0.1);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawLaunchPad(now) {
    if (state.mode !== "ready") {
      return;
    }

    const centerX = state.rocket.x;
    ctx.save();
    const glow = ctx.createRadialGradient(centerX, 790, 10, centerX, 790, 220);
    glow.addColorStop(0, "rgba(79, 220, 255, 0.22)");
    glow.addColorStop(1, "rgba(79, 220, 255, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(centerX - 240, 630, 480, 220);

    ctx.fillStyle = "rgba(5, 14, 27, 0.9)";
    ctx.strokeStyle = "rgba(105, 219, 244, 0.3)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX - 190, 790);
    ctx.lineTo(centerX + 190, 790);
    ctx.lineTo(centerX + 130, 848);
    ctx.lineTo(centerX - 130, 848);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "rgba(10, 28, 44, 0.96)";
    ctx.strokeStyle = "rgba(109, 227, 251, 0.38)";
    roundRectPath(ctx, centerX - 82, 760, 164, 22, 8);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = "rgba(105, 215, 239, 0.36)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(centerX + 104, 780);
    ctx.lineTo(centerX + 104, 471);
    ctx.lineTo(centerX + 172, 471);
    ctx.moveTo(centerX + 104, 538);
    ctx.lineTo(centerX + 158, 538);
    ctx.moveTo(centerX + 104, 610);
    ctx.lineTo(centerX + 158, 610);
    ctx.moveTo(centerX + 104, 680);
    ctx.lineTo(centerX + 158, 680);
    ctx.stroke();

    const lampAlpha = 0.5 + Math.sin(now * 2.7) * 0.3;
    ctx.fillStyle = `rgba(255, 181, 75, ${lampAlpha})`;
    ctx.shadowColor = "#ffb44f";
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(centerX + 172, 471, 4, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawObstacles() {
    for (const obstacle of state.obstacles) {
      if (obstacle.type === "meteor") {
        drawMeteor(obstacle);
      } else if (obstacle.type === "mine") {
        drawSpaceMine(obstacle);
      } else {
        drawComet(obstacle);
      }
    }
  }

  function drawMeteor(obstacle) {
    const radius = obstacle.radius;
    ctx.save();
    ctx.translate(obstacle.x, obstacle.y);

    const trail = ctx.createLinearGradient(0, -radius * 1.4, 0, radius * 2.2);
    trail.addColorStop(0, "rgba(255, 102, 61, 0)");
    trail.addColorStop(0.58, "rgba(255, 117, 55, 0.14)");
    trail.addColorStop(0.8, "rgba(255, 173, 75, 0.26)");
    trail.addColorStop(1, "rgba(255, 202, 116, 0)");
    ctx.fillStyle = trail;
    ctx.beginPath();
    ctx.moveTo(-radius * 0.52, -radius * 2.9);
    ctx.lineTo(radius * 0.34, -radius * 3.5);
    ctx.lineTo(radius * 0.78, radius * 0.35);
    ctx.lineTo(-radius * 0.65, radius * 0.35);
    ctx.closePath();
    ctx.fill();

    ctx.rotate(obstacle.rotation);
    ctx.shadowColor = "rgba(255, 107, 52, 0.8)";
    ctx.shadowBlur = 25;
    const rock = ctx.createRadialGradient(-radius * 0.34, -radius * 0.42, radius * 0.08, 0, 0, radius * 1.2);
    rock.addColorStop(0, "#ffc074");
    rock.addColorStop(0.34, "#be6439");
    rock.addColorStop(0.7, "#67352c");
    rock.addColorStop(1, "#261e25");
    ctx.fillStyle = rock;
    ctx.beginPath();
    obstacle.points.forEach((point, index) => {
      const x = Math.cos(point.angle) * point.radius;
      const y = Math.sin(point.angle) * point.radius;
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "rgba(33, 22, 26, 0.58)";
    ctx.beginPath();
    ctx.ellipse(-radius * 0.2, -radius * 0.08, radius * 0.22, radius * 0.15, -0.4, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(radius * 0.28, radius * 0.24, radius * 0.16, radius * 0.1, 0.2, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = "rgba(255, 214, 150, 0.58)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(-radius * 0.1, -radius * 0.15, radius * 0.68, 3.45, 4.52);
    ctx.stroke();
    ctx.restore();
  }

  function drawSpaceMine(obstacle) {
    const radius = obstacle.radius;
    const pulse = 0.5 + Math.sin(obstacle.pulse) * 0.5;
    ctx.save();
    ctx.translate(obstacle.x, obstacle.y);
    ctx.rotate(obstacle.rotation * 0.35);
    ctx.shadowColor = "rgba(255, 70, 103, 0.75)";
    ctx.shadowBlur = 22 + pulse * 12;

    ctx.strokeStyle = "rgba(255, 112, 129, 0.8)";
    ctx.lineWidth = 4;
    for (let index = 0; index < 12; index += 1) {
      const angle = (index / 12) * TAU;
      const inner = radius * 0.83;
      const outer = radius * (1.18 + (index % 2) * 0.08);
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    const shell = ctx.createRadialGradient(-radius * 0.3, -radius * 0.34, 2, 0, 0, radius);
    shell.addColorStop(0, "#546174");
    shell.addColorStop(0.48, "#202a39");
    shell.addColorStop(1, "#0b111b");
    ctx.fillStyle = shell;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 105, 125, 0.52)";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.strokeStyle = `rgba(255, 95, 120, ${0.32 + pulse * 0.4})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 7]);
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.65, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#ff526d";
    ctx.shadowColor = "#ff435f";
    ctx.shadowBlur = 16 + pulse * 13;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.23, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#ffe6e9";
    ctx.beginPath();
    ctx.arc(-radius * 0.05, -radius * 0.06, radius * 0.07, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawComet(obstacle) {
    const radius = obstacle.radius;
    const velocityLength = Math.hypot(obstacle.vx, obstacle.vy) || 1;
    const tailX = (-obstacle.vx / velocityLength) * radius * 4.3;
    const tailY = (-obstacle.vy / velocityLength) * radius * 4.3;

    ctx.save();
    ctx.translate(obstacle.x, obstacle.y);
    const tail = ctx.createLinearGradient(0, 0, tailX, tailY);
    tail.addColorStop(0, "rgba(121, 239, 255, 0.7)");
    tail.addColorStop(0.38, "rgba(77, 181, 255, 0.32)");
    tail.addColorStop(1, "rgba(64, 119, 255, 0)");
    ctx.strokeStyle = tail;
    ctx.lineCap = "round";
    ctx.lineWidth = radius * 0.76;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(tailX, tailY);
    ctx.stroke();
    ctx.lineWidth = radius * 0.22;
    ctx.strokeStyle = "rgba(228, 254, 255, 0.62)";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(tailX * 0.82, tailY * 0.82);
    ctx.stroke();

    ctx.shadowColor = "#75eaff";
    ctx.shadowBlur = 28;
    const head = ctx.createRadialGradient(-radius * 0.3, -radius * 0.35, 1, 0, 0, radius);
    head.addColorStop(0, "#ffffff");
    head.addColorStop(0.3, "#c6faff");
    head.addColorStop(0.68, "#67dff5");
    head.addColorStop(1, "#2781b7");
    ctx.fillStyle = head;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(238, 255, 255, 0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-radius * 1.15, 0);
    ctx.lineTo(radius * 1.15, 0);
    ctx.moveTo(0, -radius * 1.15);
    ctx.lineTo(0, radius * 1.15);
    ctx.stroke();
    ctx.restore();
  }

  function drawSupplies() {
    const colors = {
      core: "#84f4ff",
      heal: "#ff8ca1",
      upgrade: "#ffc85f",
      fin: "#ffd077",
      fuel: "#ffa85e",
      nav: "#8eb7ff"
    };

    for (const supply of state.supplies) {
      const pulse = 1 + Math.sin(supply.phase * 1.55) * 0.045;
      const color = colors[supply.type];
      ctx.save();
      ctx.translate(supply.x, supply.y);
      ctx.rotate(supply.rotation + Math.sin(supply.phase * 0.8) * 0.04);
      ctx.scale(pulse, pulse);

      const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 52);
      glow.addColorStop(0, `${color}66`);
      glow.addColorStop(0.55, `${color}1f`);
      glow.addColorStop(1, `${color}00`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, 52, 0, TAU);
      ctx.fill();

      ctx.strokeStyle = `${color}80`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 34 + Math.sin(supply.phase) * 2, 0, TAU);
      ctx.stroke();

      ctx.fillStyle = "rgba(5, 16, 30, 0.94)";
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = color;
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(0, 0, 28, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      drawSupplyIcon(supply.type, color);

      ctx.fillStyle = "rgba(229, 251, 255, 0.94)";
      ctx.font = `600 15px ${FONT_STACK}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
      ctx.shadowBlur = 6;
      ctx.fillText(SUPPLY_LABELS[supply.type], 0, 48);
      ctx.restore();
    }
  }

  function drawSupplyIcon(type, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (type === "core") {
      drawStarPath(ctx, 15, 6.5, 5);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      ctx.beginPath();
      ctx.arc(-4, -4, 2.2, 0, TAU);
      ctx.fill();
    } else if (type === "heal") {
      ctx.fillStyle = "#f7f2e9";
      roundRectPath(ctx, -13, -13, 26, 26, 5);
      ctx.fill();
      ctx.fillStyle = "#ef667e";
      roundRectPath(ctx, -8, -3, 16, 6, 2);
      ctx.fill();
      roundRectPath(ctx, -3, -8, 6, 16, 2);
      ctx.fill();
    } else if (type === "upgrade") {
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, 14);
      ctx.lineTo(0, -10);
      ctx.moveTo(-9, -1);
      ctx.lineTo(0, -11);
      ctx.lineTo(9, -1);
      ctx.stroke();
      ctx.fillStyle = "rgba(255, 207, 101, 0.75)";
      ctx.fillRect(-11, 16, 22, 3);
    } else if (type === "fin") {
      ctx.beginPath();
      ctx.moveTo(-10, -12);
      ctx.lineTo(8, 9);
      ctx.lineTo(-12, 13);
      ctx.lineTo(-4, 4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.66)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-7, -8);
      ctx.lineTo(3, 8);
      ctx.stroke();
    } else if (type === "fuel") {
      roundRectPath(ctx, -10, -11, 20, 25, 4);
      ctx.fill();
      ctx.fillStyle = "rgba(5, 16, 30, 0.85)";
      ctx.fillRect(-10, -3, 20, 5);
      ctx.fillStyle = color;
      roundRectPath(ctx, -5, -16, 10, 6, 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-5, 7);
      ctx.lineTo(5, 7);
      ctx.stroke();
    } else {
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(13, 0);
      ctx.lineTo(0, 14);
      ctx.lineTo(-13, 0);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-2, -8);
      ctx.lineTo(6, 0);
      ctx.lineTo(-2, 8);
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawParticles() {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const particle of state.particles) {
      const progress = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.globalAlpha = progress;
      ctx.fillStyle = particle.color;
      ctx.strokeStyle = particle.color;
      ctx.shadowColor = particle.color;
      ctx.shadowBlur = particle.glow && particle.size > 3 ? 8 : 0;

      if (particle.line) {
        ctx.lineWidth = Math.max(1, particle.size * progress);
        ctx.beginPath();
        ctx.moveTo(particle.x, particle.y);
        ctx.lineTo(particle.x - particle.vx * 0.035, particle.y - particle.vy * 0.035);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, Math.max(0.4, particle.size * progress), 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawFloatingTexts() {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const text of state.texts) {
      const progress = clamp(text.life / text.maxLife, 0, 1);
      ctx.globalAlpha = Math.min(1, progress * 1.8);
      ctx.fillStyle = text.color;
      ctx.font = `700 22px ${FONT_STACK}`;
      ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
      ctx.shadowBlur = 8;
      ctx.fillText(text.text, text.x, text.y);
    }
    ctx.restore();
  }

  function drawRocket(x, y, tilt, idle, now) {
    const rocket = state.rocket;
    const invulnerable = state.invulnerability > 0 && state.mode === "playing";
    const flicker = invulnerable && Math.floor(now * 17) % 2 === 0;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);

    if (state.shield > 0) {
      const shieldPulse = 0.5 + Math.sin(now * 4.6) * 0.5;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = `rgba(111, 241, 255, ${0.52 + shieldPulse * 0.28})`;
      ctx.fillStyle = `rgba(76, 218, 255, ${0.055 + shieldPulse * 0.025})`;
      ctx.lineWidth = 3;
      ctx.shadowColor = "#68edff";
      ctx.shadowBlur = 22;
      ctx.setLineDash([16, 10]);
      ctx.lineDashOffset = -now * 42;
      ctx.beginPath();
      ctx.ellipse(0, -4, 61, 72, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.ellipse(0, -4, 51, 62, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    if (!idle) {
      const flamePulse = Math.sin(now * 30) * 6 + Math.sin(now * 17) * 3;
      const flameLength = 29 + state.engineLevel * 3.5 + flamePulse;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.shadowColor = "#ffae4f";
      ctx.shadowBlur = 22;
      const outerFlame = ctx.createLinearGradient(0, 36, 0, 48 + flameLength);
      outerFlame.addColorStop(0, "rgba(255, 245, 202, 0.98)");
      outerFlame.addColorStop(0.22, "rgba(255, 185, 73, 0.95)");
      outerFlame.addColorStop(0.68, "rgba(255, 93, 66, 0.75)");
      outerFlame.addColorStop(1, "rgba(255, 75, 117, 0)");
      ctx.fillStyle = outerFlame;
      ctx.beginPath();
      ctx.moveTo(-12, 35);
      ctx.quadraticCurveTo(-9, 56 + flameLength * 0.36, 0, 49 + flameLength);
      ctx.quadraticCurveTo(9, 56 + flameLength * 0.36, 12, 35);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "rgba(137, 248, 255, 0.9)";
      ctx.shadowColor = "#6eefff";
      ctx.beginPath();
      ctx.moveTo(-6, 38);
      ctx.quadraticCurveTo(-4, 50 + flameLength * 0.3, 0, 42 + flameLength * 0.76);
      ctx.quadraticCurveTo(4, 50 + flameLength * 0.3, 6, 38);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.globalAlpha = flicker ? 0.38 : 1;

    if (state.parts.has("fin")) {
      const finGradient = ctx.createLinearGradient(-36, 0, 0, 30);
      finGradient.addColorStop(0, "#ffd181");
      finGradient.addColorStop(1, "#e27738");
      ctx.fillStyle = finGradient;
      ctx.strokeStyle = "rgba(255, 225, 160, 0.72)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-19, 9);
      ctx.lineTo(-38, 39);
      ctx.lineTo(-21, 34);
      ctx.lineTo(-15, 18);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(19, 9);
      ctx.lineTo(38, 39);
      ctx.lineTo(21, 34);
      ctx.lineTo(15, 18);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    if (state.parts.has("fuel")) {
      ctx.save();
      ctx.translate(-25, 6);
      ctx.fillStyle = "#ff9e4d";
      ctx.strokeStyle = "rgba(255, 220, 164, 0.8)";
      ctx.lineWidth = 1.4;
      roundRectPath(ctx, -7, -15, 14, 30, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(28, 43, 55, 0.75)";
      ctx.fillRect(-7, -3, 14, 5);
      ctx.fillStyle = "#ffe8b3";
      ctx.fillRect(-4, -20, 8, 5);
      ctx.restore();
    }

    ctx.fillStyle = "#243648";
    ctx.strokeStyle = "rgba(154, 231, 245, 0.42)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-14, 32);
    ctx.lineTo(14, 32);
    ctx.lineTo(11, 43);
    ctx.lineTo(-11, 43);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const bodyGradient = ctx.createLinearGradient(-20, -52, 23, 39);
    bodyGradient.addColorStop(0, "#ffffff");
    bodyGradient.addColorStop(0.28, "#e2f9ff");
    bodyGradient.addColorStop(0.65, "#abd8e6");
    bodyGradient.addColorStop(1, "#6fa4bb");
    ctx.fillStyle = bodyGradient;
    ctx.strokeStyle = "rgba(230, 253, 255, 0.88)";
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(0, -58);
    ctx.bezierCurveTo(17, -44, 25, -23, 23, 5);
    ctx.lineTo(20, 33);
    ctx.quadraticCurveTo(12, 41, 0, 41);
    ctx.quadraticCurveTo(-12, 41, -20, 33);
    ctx.lineTo(-23, 5);
    ctx.bezierCurveTo(-25, -23, -17, -44, 0, -58);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const noseGradient = ctx.createLinearGradient(0, -58, 0, -24);
    noseGradient.addColorStop(0, "#ffcd7f");
    noseGradient.addColorStop(1, "#ee7d4a");
    ctx.fillStyle = noseGradient;
    ctx.beginPath();
    ctx.moveTo(0, -58);
    ctx.bezierCurveTo(8, -49, 13, -38, 15, -27);
    ctx.lineTo(-15, -27);
    ctx.bezierCurveTo(-13, -38, -8, -49, 0, -58);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#071a29";
    ctx.strokeStyle = "#70edff";
    ctx.lineWidth = 3;
    ctx.shadowColor = "#67e9ff";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(0, -12, 10, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(218, 253, 255, 0.78)";
    ctx.beginPath();
    ctx.ellipse(-3.2, -15.5, 2.8, 4.2, -0.4, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = "rgba(60, 122, 145, 0.42)";
    ctx.lineWidth = 1.6;
    for (let index = 0; index < 3; index += 1) {
      ctx.beginPath();
      ctx.moveTo(-15 + index * 2, 2 + index * 9);
      ctx.lineTo(15 - index * 2, 2 + index * 9);
      ctx.stroke();
    }

    const engineCount = Math.min(3, 1 + Math.floor(state.engineLevel / 2));
    ctx.fillStyle = state.engineLevel > 0 ? "#ffd37f" : "#8fd9e6";
    for (let index = 0; index < engineCount; index += 1) {
      const offset = (index - (engineCount - 1) / 2) * 7;
      ctx.beginPath();
      ctx.arc(offset, 25, 2.2, 0, TAU);
      ctx.fill();
    }

    if (state.parts.has("nav")) {
      ctx.strokeStyle = "#9dc7ff";
      ctx.lineWidth = 2;
      ctx.shadowColor = "#72a8ff";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(17, -26);
      ctx.lineTo(27, -48);
      ctx.stroke();
      ctx.fillStyle = "#a8cfff";
      ctx.beginPath();
      ctx.arc(27, -50, 3.5, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.35 + Math.sin(now * 4) * 0.14;
      ctx.strokeStyle = "#8bb9ff";
      ctx.beginPath();
      ctx.arc(27, -50, 8, 0, TAU);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }

  function drawDamageFlash() {
    if (state.flash <= 0) {
      return;
    }
    ctx.save();
    const gradient = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, HEIGHT * 0.1, WIDTH / 2, HEIGHT / 2, HEIGHT * 0.75);
    gradient.addColorStop(0, `rgba(255, 79, 103, ${state.flash * 0.05})`);
    gradient.addColorStop(0.68, `rgba(255, 79, 103, ${state.flash * 0.12})`);
    gradient.addColorStop(1, `rgba(255, 63, 92, ${state.flash * 0.35})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.restore();
  }

  function render(now) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    drawBackground(now);

    ctx.save();
    if (state.shake > 0.2 && !reducedMotion) {
      ctx.translate(random(-state.shake, state.shake), random(-state.shake, state.shake));
    }

    drawLaunchPad(now);
    drawObstacles();
    drawSupplies();
    drawParticles();

    if (state.rocket.alive) {
      const idle = state.mode === "ready" || state.mode === "paused";
      drawRocket(state.rocket.x, state.rocket.y, state.rocket.tilt, idle, now);
    }

    drawFloatingTexts();
    ctx.restore();
    drawDamageFlash();
  }

  function setPointerTarget(clientX, pointerType) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) {
      return;
    }
    const worldX = ((clientX - rect.left) / rect.width) * WIDTH;
    const offset = pointerType === "mouse" ? 0 : pointer.offset;
    state.rocket.targetX = clamp(worldX + offset, 58, WIDTH - 58);
  }

  function handlePointerDown(event) {
    if (state.mode !== "playing") {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const worldX = ((event.clientX - rect.left) / rect.width) * WIDTH;
    pointer.active = true;
    pointer.id = event.pointerId;
    pointer.offset = event.pointerType === "mouse" ? 0 : state.rocket.x - worldX;
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch (error) {
      // 部分浏览器不支持指针捕获，不影响拖动。
    }
    setPointerTarget(event.clientX, event.pointerType);
    event.preventDefault();
  }

  function handlePointerMove(event) {
    if (state.mode !== "playing") {
      return;
    }
    if (event.pointerType === "mouse") {
      setPointerTarget(event.clientX, "mouse");
      return;
    }
    if (pointer.active && pointer.id === event.pointerId) {
      setPointerTarget(event.clientX, event.pointerType);
      event.preventDefault();
    }
  }

  function handlePointerUp(event) {
    if (pointer.id !== event.pointerId) {
      return;
    }
    pointer.active = false;
    pointer.id = null;
    try {
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    } catch (error) {
      // 指针已释放时无需额外处理。
    }
  }

  function handleKeyDown(event) {
    if (event.code === "ArrowLeft" || event.code === "KeyA") {
      keys.left = true;
      if (state.mode === "playing") {
        event.preventDefault();
      }
      return;
    }
    if (event.code === "ArrowRight" || event.code === "KeyD") {
      keys.right = true;
      if (state.mode === "playing") {
        event.preventDefault();
      }
      return;
    }
    if (event.code === "Enter" || event.code === "Space") {
      if (state.mode === "ready" || state.mode === "paused" || state.mode === "over") {
        event.preventDefault();
        if (event.repeat) {
          return;
        }
        if (state.mode === "ready") {
          advanceLaunch();
        } else if (state.mode === "paused") {
          resumeGame();
        } else {
          resetToPad();
        }
      }
      return;
    }
    if (event.code === "Escape" || event.code === "KeyP") {
      if (state.mode === "playing" || state.mode === "paused") {
        event.preventDefault();
        togglePause();
      }
      return;
    }
    if (event.code === "KeyM") {
      event.preventDefault();
      sound.setEnabled(!sound.enabled);
      syncSoundButton();
    }
  }

  function handleKeyUp(event) {
    if (event.code === "ArrowLeft" || event.code === "KeyA") {
      keys.left = false;
    } else if (event.code === "ArrowRight" || event.code === "KeyD") {
      keys.right = false;
    }
  }

  function frame(timestamp) {
    if (!lastFrameTime) {
      lastFrameTime = timestamp;
    }
    const dt = clamp((timestamp - lastFrameTime) / 1000, 0, 0.04);
    lastFrameTime = timestamp;
    updateGame(dt);
    render(timestamp / 1000);
    window.requestAnimationFrame(frame);
  }

  dom.powerBtn.addEventListener("click", powerOnSequence);
  dom.igniteBtn.addEventListener("click", igniteSequence);
  dom.launchBtn.addEventListener("click", startFlight);
  dom.restartBtn.addEventListener("click", resetToPad);
  dom.resumeBtn.addEventListener("click", resumeGame);
  dom.quitBtn.addEventListener("click", quitRun);
  dom.pauseBtn.addEventListener("click", () => pauseGame(false));
  dom.soundBtn.addEventListener("click", () => {
    sound.setEnabled(!sound.enabled);
    syncSoundButton();
  });

  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("pointercancel", handlePointerUp);
  canvas.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "touch") {
      handlePointerUp(event);
    }
  });
  document.addEventListener("keydown", handleKeyDown);
  document.addEventListener("keyup", handleKeyUp);

  window.addEventListener("blur", () => {
    keys.left = false;
    keys.right = false;
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.mode === "playing") {
      pauseGame(true);
    }
  });

  const portraitQuery = window.matchMedia("(orientation: portrait) and (max-width: 1000px) and (pointer: coarse)");
  function handleOrientationChange(event) {
    if (event.matches && state.mode === "playing") {
      pauseGame(true);
    }
  }
  if (portraitQuery.addEventListener) {
    portraitQuery.addEventListener("change", handleOrientationChange);
  } else if (portraitQuery.addListener) {
    portraitQuery.addListener(handleOrientationChange);
  }

  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  initializeStars();
  syncSoundButton();
  updateBestLabels();
  resetToPad();
  window.requestAnimationFrame(frame);
})();
