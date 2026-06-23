/**
 * 音效总线（Web Audio）。默认程序合成（无文件也有声音反馈）；本机有
 * 泰伯利亚之日免费 Sounds.mix 时，解码其真实 AUD 音效采样替换合成音
 * （真实 C&C 战斗/建造音），触发接口不变。自动节流（每类最小间隔 +
 * 全局并发上限），避免大规模交火爆音。
 */
import { BufferSource, MixFile, parseAud } from '@ra2web/data';
import { loadGameMix } from './game-files';

export type Sfx = 'fire' | 'cannon' | 'bomb' | 'bombImpact' | 'scream' | 'hit' | 'explosion' | 'bigExplosion' | 'build' | 'ready' | 'place' | 'select' | 'move' | 'deny' | 'missileLaunch' | 'missileFlight' | 'missileImpact';

const ALLOWED_SFX = new Set<Sfx>(['fire', 'cannon', 'bomb', 'bombImpact', 'scream', 'build', 'missileLaunch', 'missileFlight', 'missileImpact']);

export function shouldPlaySfx(sfx: Sfx): boolean {
  return ALLOWED_SFX.has(sfx);
}

/** EVA 播报事件（程序合成提示音；文字横幅在 match-view 负责）。 */
export type Eva = 'attack' | 'lowPower' | 'noFunds' | 'unitLost' | 'buildComplete';

export function shouldPlayEva(kind: Eva): boolean {
  return kind === 'buildComplete';
}

export function shouldPlayVoice(): boolean {
  return false;
}

export function shouldPlayAlarm(): boolean {
  return false;
}

export function shouldPlayUiKey(): boolean {
  return false;
}

/** 事件 → 泰伯利亚之日 Sounds.mix 真实音效文件（名取自 Sound01.ini）。 */
const REAL_SFX: Partial<Record<Sfx, string>> = {
  fire: 'infgun3.aud', // 步兵/轻武器开火
  cannon: 'bigggun1.aud', // 重型火炮
  hit: 'expnew14.aud', // 小型爆炸（命中）
  explosion: 'expnew06.aud', // 中型爆炸
  bigExplosion: 'expnew01.aud', // 大型建筑爆炸
  build: 'facbld1.aud', // 建造完成/工厂上线
  ready: 'notify.aud', // 提示音
  place: 'place2.aud', // 建筑落地
  select: 'clicky1.aud', // 选择点击
};
/** 单位语音应答文件（泰伯利亚之日 GDI 步兵语音，名取自 Sound01.ini 注释）。
 *  15-i012「是，长官」/ i006「长官？」/ i042「请下令？」/ i018「出发」… */
export const VOICE_FILES = [
  '15-i000', // Infantry reporting
  '15-i002', // Unit ready!
  '15-i006', // Sir?
  '15-i012', // Yes sir
  '15-i016', // Orders received
  '15-i018', // Moving out
  '15-i022', // On my way
  '15-i024', // You got it
  '15-i042', // Orders?
  '15-i046', // I'm on it
];

/** 各真实音效的播放增益（样本响度不一，逐类平衡）。 */
const REAL_GAIN: Partial<Record<Sfx, number>> = {
  fire: 0.5,
  cannon: 0.7,
  bomb: 0.65,
  bombImpact: 0.95,
  hit: 0.5,
  explosion: 0.9,
  bigExplosion: 1,
  build: 0.85,
  ready: 0.9,
  place: 0.8,
  select: 0.5,
  missileLaunch: 0.8,
  missileFlight: 0.4,
  missileImpact: 0.9,
};

type SyntheticWeaponSfx = 'fire' | 'cannon';

interface SyntheticWeaponSfxProfile {
  usesTonalBlip: boolean;
  noiseLayers: number;
  crackMs: number;
  crackHz: number;
  crackQ: number;
  crackGain: number;
  lowPunchHz: number;
  lowPunchEndHz: number;
  lowPunchMs: number;
  lowPunchGain: number;
  tailMs: number;
  tailDelayMs: number;
  tailCutoffHz: number;
  tailQ: number;
  tailGain: number;
  shockMs?: number;
  shockDelayMs?: number;
  shockCutoffHz?: number;
  shockGain?: number;
}

interface SyntheticBombSfxProfile {
  tonalLayers: number;
  dropCueGain: number;
  dropCueHz: number;
  dropCueMs: number;
  whistleMs: number;
  whistleStartHz: number;
  whistleEndHz: number;
  whistleGain: number;
  airRushMs: number;
  airRushCutoffHz: number;
  airRushGain: number;
  bodyMs: number;
  bodyGain: number;
  impactLowGain: number;
  impactTailMs: number;
  impactTailGain: number;
}

export const SYNTHETIC_WEAPON_SFX: Record<SyntheticWeaponSfx, SyntheticWeaponSfxProfile> = {
  fire: {
    usesTonalBlip: false,
    noiseLayers: 3,
    crackMs: 54,
    crackHz: 2450,
    crackQ: 0.82,
    crackGain: 0.34,
    lowPunchHz: 150,
    lowPunchEndHz: 46,
    lowPunchMs: 116,
    lowPunchGain: 0.26,
    tailMs: 190,
    tailDelayMs: 8,
    tailCutoffHz: 560,
    tailQ: 0.62,
    tailGain: 0.19,
    shockMs: 118,
    shockDelayMs: 18,
    shockCutoffHz: 132,
    shockGain: 0.09,
  },
  cannon: {
    usesTonalBlip: false,
    noiseLayers: 4,
    crackMs: 96,
    crackHz: 920,
    crackQ: 0.55,
    crackGain: 0.37,
    lowPunchHz: 86,
    lowPunchEndHz: 20,
    lowPunchMs: 430,
    lowPunchGain: 0.68,
    tailMs: 690,
    tailDelayMs: 18,
    tailCutoffHz: 310,
    tailQ: 0.58,
    tailGain: 0.5,
    shockMs: 260,
    shockDelayMs: 28,
    shockCutoffHz: 118,
    shockGain: 0.34,
  },
};

export const SYNTHETIC_BOMB_SFX: SyntheticBombSfxProfile = {
  tonalLayers: 2,
  dropCueGain: 0,
  dropCueHz: 0,
  dropCueMs: 0,
  whistleMs: 1720,
  whistleStartHz: 1450,
  whistleEndHz: 210,
  whistleGain: 0.08,
  airRushMs: 1840,
  airRushCutoffHz: 390,
  airRushGain: 0.12,
  bodyMs: 135,
  bodyGain: 0.46,
  impactLowGain: 0.36,
  impactTailMs: 620,
  impactTailGain: 0.26,
};

export class AudioBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private readonly lastPlayed = new Map<Sfx, number>();
  private activeVoices = 0;
  /** 已解码的真实音效 PCM（无 ctx 也可存）。 */
  private readonly realPcm = new Map<Sfx, { rate: number; samples: Int16Array }>();
  private readonly voices = new Map<string, { rate: number; samples: Int16Array }>();
  private readonly bufCache = new Map<string, AudioBuffer>();
  private realLoaded = false;
  private lastVoiceAt = -1e9;
  private lastEvaAt = -1e9;
  private battleAmbienceWanted = false;
  private battleAmbience: { gain: GainNode; sources: AudioScheduledSourceNode[] } | null = null;
  /** 本次 play() 的输出节点（含声像/距离增益）；合成与采样都接到这里。null=直连 master。 */
  private curOut: AudioNode | null = null;

  /** 载入本机 Sounds.mix 并解码常用音效为真实采样（有则替换合成音）。
   *  无文件/解码失败则静默保持合成音。可在任意时刻调用（不需 ctx）。 */
  async loadRealSounds(): Promise<void> {
    if (this.realLoaded) return;
    this.realLoaded = true;
    const bytes = await loadGameMix('Sounds.mix');
    if (!bytes) return;
    let mix: MixFile;
    try {
      mix = await MixFile.open(new BufferSource(bytes));
    } catch {
      return;
    }
    for (const [sfx, file] of Object.entries(REAL_SFX) as [Sfx, string][]) {
      try {
        if (!mix.hasFile(file)) continue;
        const a = parseAud(await mix.readFile(file));
        if (a.samples.length > 0) this.realPcm.set(sfx, { rate: a.sampleRate, samples: a.samples });
      } catch {
        /* 跳过坏样本，该类回退合成音 */
      }
    }
    for (const name of VOICE_FILES) {
      try {
        const file = `${name}.aud`;
        if (!mix.hasFile(file)) continue;
        const a = parseAud(await mix.readFile(file));
        if (a.samples.length > 0) this.voices.set(name, { rate: a.sampleRate, samples: a.samples });
      } catch {
        /* 跳过坏样本 */
      }
    }
  }

  /** 每类最小触发间隔（ms），抑制密集重复。 */
  private static readonly MIN_GAP: Record<Sfx, number> = {
    fire: 45,
    cannon: 70,
    bomb: 120,
    bombImpact: 90,
    scream: 260,
    hit: 60,
    explosion: 80,
    bigExplosion: 150,
    build: 0,
    ready: 0,
    place: 0,
    select: 30,
    move: 120,
    deny: 120,
    missileLaunch: 180,
    missileFlight: 350,
    missileImpact: 90,
  };

  /** 须在用户手势中调用以解锁音频（浏览器自动播放策略）。 */
  resume(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
      // 预生成 1s 白噪声
      const len = this.ctx.sampleRate;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      let seed = 22222;
      for (let i = 0; i < len; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        data[i] = (seed / 0x40000000) - 1;
      }
      this.noiseBuffer = buf;
    }
    void this.ctx.resume();
    this.ensureBattleAmbience();
  }

  get isMuted(): boolean {
    return this.muted;
  }
  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.35;
    if (!this.muted) this.ensureBattleAmbience();
    return this.muted;
  }

  get isBattleAmbienceWanted(): boolean {
    return this.battleAmbienceWanted;
  }

  startBattleAmbience(): void {
    this.battleAmbienceWanted = false;
    this.stopBattleAmbienceNodes();
  }

  stopBattleAmbience(): void {
    this.battleAmbienceWanted = false;
    this.stopBattleAmbienceNodes();
  }

  /** 播放音效。opts.pan(-1..1) 声像、opts.gain(0..1) 距离增益——由 match-view
   *  按事件屏幕位置算好传入；UI 类音效不传则居中满增益。 */
  play(sfx: Sfx, opts: { pan?: number; gain?: number } = {}): void {
    if (!shouldPlaySfx(sfx)) return;
    if (!this.ctx || !this.master || this.muted) return;
    const now = performance.now();
    const gap = AudioBus.MIN_GAP[sfx];
    const last = this.lastPlayed.get(sfx) ?? -1e9;
    if (now - last < gap) return;
    if (this.activeVoices > (sfx === 'bombImpact' ? 36 : 24)) return;
    this.lastPlayed.set(sfx, now);
    this.curOut = this.makeOut(opts.pan ?? 0, opts.gain ?? 1);
    try {
      if (this.realPcm.has(sfx) && sfx !== 'fire' && sfx !== 'cannon') {
        this.playSample(sfx);
        return;
      }
      switch (sfx) {
        case 'fire':
          this.playWeaponShot('fire');
          break;
        case 'cannon':
          this.playWeaponShot('cannon');
          break;
        case 'bomb':
          this.playBombDrop();
          break;
        case 'bombImpact':
          this.playBombImpact();
          break;
        case 'scream':
          this.playInfantryScream();
          break;
        case 'hit':
          this.noise(0.06, 2500, 0.12);
          break;
        case 'explosion':
          this.boom(0.35, 0.3);
          break;
        case 'bigExplosion':
          this.boom(0.6, 0.45);
          break;
        case 'build':
          this.chime([440, 660], 0.16);
          break;
        case 'place':
          this.blip(120, 0.12, 'sine', 0.3);
          break;
        case 'select':
          this.blip(900, 0.03, 'triangle', 0.1);
          break;
        case 'move':
          this.radioTick();
          break;
        case 'deny':
          this.blip(160, 0.12, 'square', 0.18);
          this.blip(120, 0.12, 'sawtooth', 0.1);
          break;
        case 'missileLaunch':
          this.playMissileLaunch();
          break;
        case 'missileFlight':
          this.playMissileFlight();
          break;
        case 'missileImpact':
          this.playMissileImpact();
          break;
      }
    } finally {
      this.curOut = null;
    }
  }

  /** 为本次播放构造输出节点：声像 + 距离增益。居中且满增益时直连 master（零开销）。 */
  private makeOut(pan: number, gainMul: number): AudioNode {
    const master = this.master!;
    if (pan === 0 && gainMul >= 1) return master;
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = Math.max(0, Math.min(1, gainMul));
    if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p).connect(master);
    } else {
      g.connect(master);
    }
    return g;
  }

  /** 合成/采样节点的输出落点：本次 play 的声像节点，或（EVA/UI）直连 master。 */
  private dest(): AudioNode {
    return this.curOut ?? this.master!;
  }

  /** EVA 事件提示音（居中、互相节流，避免与战斗音叠太密）。文字横幅由 match-view 显示。 */
  playEva(kind: Eva): void {
    if (!shouldPlayEva(kind)) return;
    if (!this.ctx || !this.master || this.muted) return;
    const now = performance.now();
    if (now - this.lastEvaAt < 900) return;
    this.lastEvaAt = now;
    switch (kind) {
      case 'attack':
        this.alarm();
        break;
      case 'buildComplete':
        this.chime([523, 784], 0.14); // 上行二音：肯定
        break;
      case 'lowPower':
        this.blip(300, 0.24, 'sawtooth', 0.2); // 低沉嗡鸣
        break;
      case 'noFunds':
        this.blip(170, 0.12, 'square', 0.24); // 低频"拒绝"
        break;
      case 'unitLost':
        this.blip(330, 0.3, 'sine', 0.2); // 柔和下坠：黯然
        break;
    }
  }

  /** 播放真实音效采样。 */
  private playSample(sfx: Sfx): void {
    this.playPcmBuffer(`sfx:${sfx}`, this.realPcm.get(sfx)!, REAL_GAIN[sfx] ?? 0.8);
  }

  /** 选中/下令时播放单位语音应答。无真实语音能力返回 false（调用方回退合成
   *  提示音）；有能力但静音/节流则视为已处理返回 true。语音不叠音。 */
  playVoice(name: string): boolean {
    if (!shouldPlayVoice()) return true;
    if (this.voices.size === 0) return false;
    if (!this.ctx || !this.master || this.muted) return true;
    const pcm = this.voices.get(name);
    if (!pcm) return true;
    const now = performance.now();
    if (now - this.lastVoiceAt < 650) return true;
    this.lastVoiceAt = now;
    this.playPcmBuffer(`voice:${name}`, pcm, 0.95);
    return true;
  }

  /** 「红色警戒」警报警笛（程序合成，开场红场转场用）。须音频已解锁(用户手势后)。
   *  更高亢：主音在 660↔1180Hz 拉鸣 + 一条高八度叠音，明亮刺耳。 */
  alarm(): void {
    if (!shouldPlayAlarm()) return;
    if (!this.ctx || !this.master || this.muted) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const dur = 4.4;
    const cycles = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.2);
    g.gain.setValueAtTime(0.22, t0 + dur - 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3200;
    lp.connect(g).connect(this.master);
    // 主音 + 高八度叠音（更明亮）
    for (const [base, mul, gain] of [
      [660, 1, 1],
      [660, 2, 0.4],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(base * mul, t0);
      for (let i = 1; i <= cycles; i++) {
        osc.frequency.linearRampToValueAtTime((i % 2 === 1 ? 1180 : 660) * mul, t0 + (dur * i) / cycles);
      }
      const og = ctx.createGain();
      og.gain.value = gain;
      osc.connect(og).connect(lp);
      osc.start(t0);
      this.track(osc, dur + 0.1);
    }
  }

  /** 终端打字机的按键嗒声（开场打字逐字调用）。短促、清脆；音频已解锁才出声。 */
  key(): void {
    if (!shouldPlayUiKey()) return;
    if (!this.ctx || !this.master || this.muted) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    // 噪声 click（机械键的"嗒"）
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2400;
    bp.Q.value = 1.1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.34, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.03);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t0);
    this.track(src, 0.05);
    // 高音短 tick（更像机械键，提高存在感）
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1600, t0);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.14, t0);
    og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.02);
    osc.connect(og).connect(this.master);
    osc.start(t0);
    this.track(osc, 0.03);
  }

  /** 由 16bit PCM 建并缓存 AudioBuffer 后播放（按 key 缓存）。 */
  private playPcmBuffer(key: string, pcm: { rate: number; samples: Int16Array }, gain: number): void {
    const ctx = this.ctx!;
    let buf = this.bufCache.get(key);
    if (!buf) {
      buf = ctx.createBuffer(1, pcm.samples.length, pcm.rate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < pcm.samples.length; i++) ch[i] = pcm.samples[i]! / 32768;
      this.bufCache.set(key, buf);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.dest());
    src.start();
    this.track(src, buf.duration);
  }

  private t(): number {
    return this.ctx!.currentTime;
  }

  private track(node: AudioScheduledSourceNode, dur: number): void {
    this.activeVoices++;
    node.onended = () => {
      this.activeVoices--;
    };
    node.stop(this.t() + dur);
  }

  private blip(freq: number, dur: number, type: OscillatorType, gain: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.t());
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.5), this.t() + dur);
    g.gain.setValueAtTime(gain, this.t());
    g.gain.exponentialRampToValueAtTime(0.001, this.t() + dur);
    osc.connect(g).connect(this.dest());
    osc.start();
    this.track(osc, dur + 0.02);
  }

  private playWeaponShot(kind: SyntheticWeaponSfx): void {
    const profile = SYNTHETIC_WEAPON_SFX[kind];
    this.filteredNoise(profile.crackMs / 1000, 'bandpass', profile.crackHz, profile.crackQ, profile.crackGain);
    if (profile.noiseLayers >= 2) {
      this.filteredNoise((profile.crackMs * 0.85) / 1000, 'bandpass', profile.crackHz * 0.52, Math.max(0.45, profile.crackQ * 0.75), profile.crackGain * 0.5, 0.006);
    }
    if (profile.noiseLayers >= 3) {
      this.filteredNoise((profile.crackMs * 1.25) / 1000, 'lowpass', profile.tailCutoffHz * 0.8, Math.max(0.4, profile.tailQ * 0.7), profile.tailGain * 0.7, 0.012);
    }
    if (profile.noiseLayers >= 4) {
      this.filteredNoise((profile.tailMs * 0.75) / 1000, 'lowpass', Math.max(90, profile.tailCutoffHz * 0.42), 0.5, profile.tailGain * 0.48, 0.04);
    }
    this.pitchDrop(profile.lowPunchHz, profile.lowPunchEndHz, profile.lowPunchMs / 1000, 'triangle', profile.lowPunchGain);
    this.filteredNoise(profile.tailMs / 1000, 'lowpass', profile.tailCutoffHz, profile.tailQ, profile.tailGain, profile.tailDelayMs / 1000);
    if (profile.shockMs && profile.shockCutoffHz && profile.shockGain) {
      this.filteredNoise(profile.shockMs / 1000, 'lowpass', profile.shockCutoffHz, 0.5, profile.shockGain, (profile.shockDelayMs ?? 0) / 1000);
    }
  }

  private playBombDrop(): void {
    const profile = SYNTHETIC_BOMB_SFX;
    const whistleDur = profile.whistleMs / 1000;
    for (let i = 0; i < profile.tonalLayers; i++) {
      const layerGain = profile.whistleGain / (i + 1);
      const detune = 1 + i * 0.035;
      this.pitchDrop(profile.whistleStartHz * detune, profile.whistleEndHz * (1 - i * 0.08), whistleDur, i === 0 ? 'sawtooth' : 'triangle', layerGain, i * 0.018);
    }
    this.filteredNoise(profile.airRushMs / 1000, 'lowpass', profile.airRushCutoffHz, 0.55, profile.airRushGain, 0.02);
  }

  private playBombImpact(): void {
    const profile = SYNTHETIC_BOMB_SFX;
    this.filteredNoise(profile.bodyMs / 1000, 'bandpass', 930, 0.78, profile.bodyGain);
    this.filteredNoise((profile.bodyMs + 210) / 1000, 'lowpass', 105, 0.46, profile.impactLowGain, 0.008);
    this.filteredNoise(profile.impactTailMs / 1000, 'lowpass', 235, 0.5, profile.impactTailGain, 0.04);
    this.pitchDrop(86, 23, Math.min(0.48, profile.impactTailMs / 1000), 'triangle', profile.impactLowGain * 0.5, 0.015);
  }

  private playInfantryScream(): void {
    this.pitchDrop(620, 230, 0.34, 'sawtooth', 0.1);
    this.pitchDrop(470, 180, 0.28, 'triangle', 0.055, 0.035);
    this.filteredNoise(0.22, 'bandpass', 1450, 1.2, 0.055, 0.015);
  }

  /** 爱国者 PAC-3 导弹发射音：高压气体喷出的"嗖"声 + 低频推力轰鸣。 */
  private playMissileLaunch(): void {
    // 主推力：宽带噪声快速下扫（燃气喷射的"嗖"）
    this.filteredNoise(0.42, 'bandpass', 1800, 0.6, 0.32);
    this.filteredNoise(0.38, 'lowpass', 800, 0.7, 0.22, 0.02);
    // 低频推力轰鸣（发射架共振）
    this.pitchDrop(180, 60, 0.5, 'sawtooth', 0.18);
    // 高频"嘶"声（燃气与空气摩擦）
    this.filteredNoise(0.6, 'highpass', 3500, 0.5, 0.12, 0.05);
  }

  /** 导弹飞行尾迹音：持续低频呼啸 + 间歇性燃气噪声。 */
  private playMissileFlight(): void {
    // 持续呼啸（低频呼吸感）
    this.pitchDrop(420, 280, 0.8, 'triangle', 0.08);
    this.filteredNoise(0.7, 'lowpass', 600, 0.4, 0.1);
    // 燃气噪声层
    this.filteredNoise(0.6, 'bandpass', 1200, 0.8, 0.06, 0.05);
  }

  /** 导弹命中爆炸音：高频破裂 + 中频爆炸体 + 低频冲击波。 */
  private playMissileImpact(): void {
    // 高频破裂（破片/金属碎裂）
    this.filteredNoise(0.12, 'bandpass', 2400, 0.8, 0.3);
    // 中频爆炸体
    this.filteredNoise(0.32, 'bandpass', 850, 0.7, 0.4);
    // 低频冲击（冲击波）
    this.filteredNoise(0.5, 'lowpass', 120, 0.5, 0.5, 0.005);
    // 低频下坠（余波）
    this.pitchDrop(120, 30, 0.45, 'triangle', 0.25, 0.01);
    // 次声尾音
    this.filteredNoise(0.7, 'lowpass', 200, 0.4, 0.15, 0.05);
  }

  private pitchDrop(startFreq: number, endFreq: number, dur: number, type: OscillatorType, gain: number, delay = 0): void {
    const ctx = this.ctx!;
    const start = this.t() + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), start + dur);
    g.gain.setValueAtTime(gain, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + dur);
    osc.connect(g).connect(this.dest());
    osc.start(start);
    this.track(osc, delay + dur + 0.02);
  }

  private filteredNoise(dur: number, filterType: BiquadFilterType, frequency: number, q: number, gain: number, delay = 0): void {
    const ctx = this.ctx!;
    const start = this.t() + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + dur);
    src.connect(filter).connect(g).connect(this.dest());
    src.start(start);
    this.track(src, delay + dur + 0.02);
  }

  private noise(dur: number, cutoff: number, gain: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, this.t());
    g.gain.exponentialRampToValueAtTime(0.001, this.t() + dur);
    src.connect(filter).connect(g).connect(this.dest());
    src.start();
    this.track(src, dur + 0.02);
  }

  private boom(dur: number, gain: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, this.t());
    filter.frequency.exponentialRampToValueAtTime(120, this.t() + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, this.t());
    g.gain.exponentialRampToValueAtTime(0.001, this.t() + dur);
    src.connect(filter).connect(g).connect(this.dest());
    src.start();
    this.track(src, dur + 0.02);
  }

  private ensureBattleAmbience(): void {
    if (!this.battleAmbienceWanted || !this.ctx || !this.master || !this.noiseBuffer || this.battleAmbience) return;
    const ctx = this.ctx;
    const bed = ctx.createGain();
    bed.gain.value = 0.075;
    bed.connect(this.master);

    const wind = ctx.createBufferSource();
    wind.buffer = this.noiseBuffer;
    wind.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 430;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.18;
    wind.connect(windFilter).connect(windGain).connect(bed);
    wind.start();

    const lowDrone = ctx.createOscillator();
    lowDrone.type = 'sine';
    lowDrone.frequency.value = 72;
    const lowGain = ctx.createGain();
    lowGain.gain.value = 0.09;
    lowDrone.connect(lowGain).connect(bed);
    lowDrone.start();

    const highDrone = ctx.createOscillator();
    highDrone.type = 'triangle';
    highDrone.frequency.value = 138;
    const highGain = ctx.createGain();
    highGain.gain.value = 0.025;
    highDrone.connect(highGain).connect(bed);
    highDrone.start();

    this.battleAmbience = { gain: bed, sources: [wind, lowDrone, highDrone] };
  }

  private stopBattleAmbienceNodes(): void {
    const ambience = this.battleAmbience;
    if (!ambience) return;
    for (const source of ambience.sources) {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
      source.disconnect();
    }
    ambience.gain.disconnect();
    this.battleAmbience = null;
  }

  private chime(freqs: number[], step: number): void {
    const ctx = this.ctx!;
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      const start = this.t() + i * step;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.22, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, start + step + 0.05);
      osc.connect(g).connect(this.dest());
      osc.start(start);
      this.activeVoices++;
      osc.onended = () => {
        this.activeVoices--;
      };
      osc.stop(start + step + 0.06);
    });
  }

  private radioTick(): void {
    const ctx = this.ctx!;
    const t0 = this.t();
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const start = t0 + i * 0.045;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(i === 0 ? 620 : 880, start);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.09, start + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.07);
      osc.connect(g).connect(this.dest());
      osc.start(start);
      this.activeVoices++;
      osc.onended = () => {
        this.activeVoices--;
      };
      osc.stop(start + 0.08);
    }
  }
}

/** 全局单例（一个标签页一份音频上下文）。 */
export const audioBus = new AudioBus();
