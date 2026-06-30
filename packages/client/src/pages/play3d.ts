import { SIM_TICKS_PER_SECOND } from '@ra2web/game';
import { SimpleAI, type Difficulty } from '../ai';
import { audioBus } from '../audio-bus';
import { difficultyLabel, skirmishMapText, uiText } from '../i18n';
import { createMatchWorld, localSkirmishConfig, SKIRMISH_MAP_PRESETS, skirmishMapPreset, type SkirmishMapId } from '../match-setup';
import { MATCH_3D_STYLE, MatchView3D } from '../match-view-3d';

const TICK_MS = 1000 / SIM_TICKS_PER_SECOND;
const HUMAN = 1;
const AI_ID = 2;
const DISABLED_MAP_IDS = new Set<SkirmishMapId>(['highlands', 'badlands', 'delta']);

const SETUP_3D_STYLE = `
.p3-setup { position: fixed; inset: 0; overflow: auto; display: flex; align-items: flex-start; justify-content: center;
  --panel: rgba(12, 19, 24, .86); --panel-2: rgba(17, 29, 36, .92); --line: rgba(120, 156, 178, .28);
  --cyan: #62e7d6; --blue: #46a7ff; --gold: #f1cf5d; --green: #39b960;
  background:
    radial-gradient(circle at 18% 12%, rgba(70, 167, 255, .18), transparent 28%),
    radial-gradient(circle at 76% 18%, rgba(98, 231, 214, .12), transparent 28%),
    linear-gradient(180deg, #071014 0%, #0a1115 48%, #060a0d 100%);
  color: #d8e0e6; font: 14px/1.6 Inter, system-ui, 'PingFang SC', sans-serif; }
.p3-card { width: min(1180px, calc(100vw - 40px)); margin: clamp(18px, 4vh, 42px) auto; padding: clamp(22px, 3vw, 36px);
  border: 1px solid var(--line); border-radius: 16px; background: linear-gradient(180deg, rgba(17, 27, 33, .96), rgba(8, 13, 17, .96));
  box-shadow: 0 26px 90px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.04); }
.p3-hero { display: grid; grid-template-columns: minmax(540px, .95fr) minmax(420px, 1.05fr); gap: clamp(24px, 4vw, 46px);
  align-items: center; padding: 4px 0 28px; }
.p3-card h1 { margin: 0; color: #f6fbff; font-size: clamp(44px, 4.8vw, 62px); line-height: .95;
  letter-spacing: .025em; text-transform: uppercase; white-space: nowrap; text-shadow: 0 18px 52px rgba(98,231,214,.16); }
.p3-subtitle { margin: 0 0 14px; color: var(--cyan); font-size: 14px; font-weight: 900; letter-spacing: .16em; text-transform: uppercase; }
.p3-hero-lines { counter-reset: hero-line; display: grid; gap: 10px; margin-top: 26px; max-width: 620px;
  color: #d8e8ef; font-size: clamp(15px, 1.45vw, 18px); }
.p3-hero-lines span { counter-increment: hero-line; position: relative; display: flex; align-items: center; gap: 12px;
  min-height: 46px; padding: 9px 14px 9px 12px; border: 1px solid rgba(98,231,214,.22); border-left-color: var(--cyan);
  border-radius: 8px; background: linear-gradient(90deg, rgba(98,231,214,.12), rgba(18,29,36,.28) 62%, transparent);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.04); }
.p3-hero-lines span::before { content: "0" counter(hero-line); flex: 0 0 auto; min-width: 38px; color: var(--gold);
  font-size: 11px; font-weight: 950; letter-spacing: .14em; }
.p3-hero-lines span::after { content: ""; position: absolute; left: 0; top: 10px; bottom: 10px; width: 3px;
  border-radius: 999px; background: var(--cyan); box-shadow: 0 0 18px rgba(98,231,214,.6); }
.p3-browser-note { display: inline-flex; align-items: center; gap: 9px; margin: 18px 0 0; padding: 8px 12px;
  border: 1px solid rgba(241,207,93,.22); border-radius: 999px; background: rgba(241,207,93,.08);
  color: #fff4bc; font-size: 13px; font-weight: 900; letter-spacing: .04em; }
.p3-browser-note::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--gold);
  box-shadow: 0 0 16px rgba(241,207,93,.8); }
.p3-showcase { position: relative; min-height: 386px; perspective: 1100px; }
.p3-shot { position: absolute; overflow: hidden; border: 1px solid rgba(129, 178, 201, .34); border-radius: 12px;
  background: #8fbf7f; box-shadow: 0 24px 70px rgba(0,0,0,.42); }
.p3-shot.has-image { background: #071014; }
.p3-shot-main { inset: 16px 34px 74px 0; transform: rotateX(2deg) rotateY(-8deg); }
.p3-shot-small { width: 46%; aspect-ratio: 16 / 9; right: 0; bottom: 0; transform: rotateX(2deg) rotateY(-10deg); }
.p3-shot-air { width: 40%; aspect-ratio: 16 / 10; right: 26px; top: 0; transform: rotateX(1deg) rotateY(-10deg) translateY(-4px); }
.p3-shot::before { content: ""; position: absolute; inset: 0; opacity: .78; background:
  linear-gradient(26deg, transparent 0 36%, rgba(225, 214, 176, .9) 37% 40%, transparent 41%),
  repeating-linear-gradient(0deg, rgba(255,255,255,.055) 0 1px, transparent 1px 34px),
  repeating-linear-gradient(90deg, rgba(255,255,255,.045) 0 1px, transparent 1px 34px),
  radial-gradient(circle at 70% 34%, rgba(77, 143, 191, .85) 0 11%, transparent 12%),
  linear-gradient(180deg, #99ca86, #78af6d); }
.p3-shot::after { content: ""; position: absolute; width: 8px; height: 8px; border-radius: 2px; left: 36%; top: 54%;
  background: #23333a; box-shadow:
    -70px 12px 0 #23333a, -52px 24px 0 #23333a, -34px 36px 0 #23333a, -16px 48px 0 #23333a,
    34px -22px 0 #315766, 52px -30px 0 #315766, 70px -38px 0 #315766, 88px -46px 0 #315766,
    120px 18px 0 var(--gold), 136px 26px 0 var(--gold), 152px 34px 0 var(--gold),
    168px 42px 0 var(--gold), 184px 50px 0 var(--gold), 200px 58px 0 var(--gold),
    -110px -58px 0 #41667a, -92px -66px 0 #41667a, -74px -74px 0 #41667a; }
.p3-shot-small::before { background:
  radial-gradient(circle at 54% 48%, rgba(255, 173, 69, .7) 0 13%, transparent 14%),
  linear-gradient(95deg, transparent 0 48%, rgba(225, 214, 176, .85) 49% 52%, transparent 53%),
  repeating-linear-gradient(0deg, rgba(255,255,255,.055) 0 1px, transparent 1px 28px),
  repeating-linear-gradient(90deg, rgba(255,255,255,.045) 0 1px, transparent 1px 28px),
  linear-gradient(180deg, #a6d294, #87bd77); }
.p3-shot-air::before { background:
  radial-gradient(circle at 78% 42%, rgba(92, 177, 219, .72) 0 16%, transparent 17%),
  linear-gradient(22deg, transparent 0 47%, rgba(225, 214, 176, .82) 48% 51%, transparent 52%),
  repeating-linear-gradient(0deg, rgba(255,255,255,.055) 0 1px, transparent 1px 26px),
  repeating-linear-gradient(90deg, rgba(255,255,255,.045) 0 1px, transparent 1px 26px),
  linear-gradient(180deg, #a4d492, #82b974); }
.p3-shot.has-image::before, .p3-shot.has-image::after { content: none; }
.p3-shot-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center;
  display: block; }
.p3-shot-label { position: absolute; left: 12px; bottom: 10px; z-index: 1; padding: 5px 9px; border-radius: 999px;
  background: rgba(5, 10, 13, .72); color: #f2fbff; font-size: 11px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
.p3-section { scroll-margin-top: 18px; }
.p3-controls { display: grid; gap: 16px; padding: 20px; border: 1px solid var(--line); border-radius: 14px;
  background: rgba(8, 14, 18, .72); }
.p3-label { font-size: 12px; color: #8bd8f5; margin: 0 0 8px; text-transform: uppercase; letter-spacing: .16em; font-weight: 900; }
.p3-opts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.p3-opts button { min-height: 44px; background: rgba(3, 8, 11, .74); color: #c8d2da; border: 1px solid #2a3a48;
  border-radius: 8px; cursor: pointer; font-weight: 800; }
.p3-opts button.on { background: linear-gradient(180deg, #2f80c9, #23639e); color: #fff; border-color: #58b6ff; }
.p3-maps { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
.p3-map-card { min-height: 138px; padding: 12px; background: rgba(3, 8, 11, .74); color: #c8d2da;
  border: 1px solid #2a3a48; border-radius: 10px; cursor: pointer; text-align: left; transition: transform .16s ease, border-color .16s ease; }
.p3-map-card:hover:not(:disabled) { transform: translateY(-1px); border-color: rgba(98,231,214,.7); }
.p3-map-card.on { border-color: var(--cyan); box-shadow: inset 0 0 0 1px var(--cyan), 0 0 34px rgba(98,231,214,.14); color: #efffff; }
.p3-map-card:disabled { cursor: not-allowed; opacity: .46; filter: grayscale(.35); }
.p3-map-card:disabled.on { border-color: #2a3a48; box-shadow: none; color: #c8d2da; }
.p3-map-preview { height: 64px; margin-bottom: 10px; border-radius: 7px; border: 1px solid #263946; overflow: hidden;
  background: repeating-linear-gradient(0deg, rgba(255,255,255,.05) 0 2px, transparent 2px 6px), #789b68; }
.p3-map-card[data-v="lakeland"] .p3-map-preview { background:
  linear-gradient(24deg, transparent 0 36%, #b7aa83 37% 39%, #b9aa90 40% 42%, transparent 43% 100%),
  radial-gradient(ellipse at 48% 50%, transparent 0 10%, #367fa5 11% 28%, transparent 29%),
  radial-gradient(ellipse at 34% 43%, #367fa5 0 20%, transparent 21%),
  radial-gradient(ellipse at 64% 40%, #367fa5 0 18%, transparent 19%),
  linear-gradient(65deg, transparent 0 18%, #367fa5 19% 22%, transparent 23% 100%),
  linear-gradient(105deg, transparent 0 72%, #367fa5 73% 77%, transparent 78% 100%),
  repeating-linear-gradient(0deg, rgba(255,255,255,.05) 0 2px, transparent 2px 6px), #789b68; }
.p3-map-card[data-v="highlands"] .p3-map-preview { background:
  linear-gradient(55deg, transparent 0 34%, #79827b 35% 41%, transparent 42% 100%),
  linear-gradient(55deg, transparent 0 62%, #79827b 63% 68%, transparent 69% 100%),
  repeating-linear-gradient(0deg, rgba(255,255,255,.05) 0 2px, transparent 2px 6px), #6f8a66; }
.p3-map-card[data-v="badlands"] .p3-map-preview { background:
  radial-gradient(ellipse at 38% 45%, #a89b62 0 34%, transparent 35%),
  radial-gradient(ellipse at 75% 70%, #8a7d53 0 20%, transparent 21%),
  repeating-linear-gradient(0deg, rgba(255,255,255,.05) 0 2px, transparent 2px 6px), #867f5f; }
.p3-map-card[data-v="delta"] .p3-map-preview { background:
  linear-gradient(75deg, transparent 0 44%, #367fa5 45% 49%, transparent 50% 100%),
  linear-gradient(20deg, transparent 0 46%, #367fa5 47% 50%, transparent 51% 100%),
  repeating-linear-gradient(0deg, rgba(255,255,255,.05) 0 2px, transparent 2px 6px), #759f67; }
.p3-map-name { display: block; font-weight: 900; font-size: 16px; }
.p3-map-hint { display: block; color: #9aa7b0; font-size: 12px; margin-top: 2px; }
.p3-map-soon { display: inline-block; margin-top: 8px; padding: 2px 7px; border-radius: 999px;
  background: rgba(94, 216, 203, .12); border: 1px solid rgba(94, 216, 203, .35); color: #8debe2;
  font-size: 10px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
.p3-start { width: 100%; min-height: 54px; border: none; border-radius: 10px; background: linear-gradient(180deg, #4edf70, #2ca84f);
  color: #041108; font-size: 18px; font-weight: 950; cursor: pointer; box-shadow: 0 16px 38px rgba(54,203,101,.18); }
@media (max-width: 980px) {
  .p3-hero { grid-template-columns: 1fr; }
  .p3-showcase { min-height: 320px; }
  .p3-maps { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  .p3-card { width: min(100vw - 24px, 1180px); padding: 18px; }
  .p3-card h1 { font-size: clamp(28px, 10vw, 40px); }
  .p3-opts, .p3-maps { grid-template-columns: 1fr; }
  .p3-showcase { min-height: 260px; }
  .p3-shot-main { inset: 18px 0 50px 0; }
  .p3-shot-air { right: 6px; }
  .p3-shot-small { width: 58%; }
}
`;

export async function renderPlay3D(root: HTMLElement): Promise<void> {
  document.title = uiText().seoTitle;
  const style = document.createElement('style');
  style.textContent = MATCH_3D_STYLE + SETUP_3D_STYLE;
  document.head.appendChild(style);

  let difficulty = (localStorage.getItem('ra2.diff') as Difficulty) || 'normal';
  let mapId = skirmishMapPreset(localStorage.getItem('ra2.map')).id;
  if (DISABLED_MAP_IDS.has(mapId)) mapId = 'lakeland';

  function renderSetup(): void {
    const text = uiText();
    const hero = text.setup.seoHero;
    root.innerHTML = `
      <div class="p3-setup"><div class="p3-card">
        <section class="p3-hero">
          <div>
            <p class="p3-subtitle">${hero.subtitle}</p>
            <h1>${hero.brand}</h1>
            <div class="p3-hero-lines">
              ${hero.bullets.map((line) => `<span>${line}</span>`).join('')}
            </div>
            <p class="p3-browser-note">${hero.browserNote}</p>
          </div>
          <div class="p3-showcase" aria-label="Gameplay screenshots">
            <div class="p3-shot p3-shot-main has-image">
              <img class="p3-shot-img" src="/landing/mass-tactics.webp" alt="${hero.showcaseLabels.mass}" />
              <span class="p3-shot-label">${hero.showcaseLabels.mass}</span>
            </div>
            <div class="p3-shot p3-shot-air has-image">
              <img class="p3-shot-img" src="/landing/air-combat.webp" alt="${hero.showcaseLabels.air}" />
              <span class="p3-shot-label">${hero.showcaseLabels.air}</span>
            </div>
            <div class="p3-shot p3-shot-small has-image">
              <img class="p3-shot-img" src="/landing/missiles.webp" alt="${hero.showcaseLabels.missile}" />
              <span class="p3-shot-label">${hero.showcaseLabels.missile}</span>
            </div>
          </div>
        </section>
        <section class="p3-section p3-controls" id="choose-map">
          <div class="p3-label">${text.setup.aiDifficulty}</div>
          <div class="p3-opts" id="p3-diff">
            <button data-v="easy">${difficultyLabel('easy')}</button>
            <button data-v="normal">${difficultyLabel('normal')}</button>
            <button data-v="hard">${difficultyLabel('hard')}</button>
          </div>
          <div class="p3-label">${text.setup.battlefield}</div>
          <div class="p3-maps" id="p3-map">
            ${SKIRMISH_MAP_PRESETS.map((preset) => {
              const disabled = DISABLED_MAP_IDS.has(preset.id);
              const mapText = skirmishMapText(preset.id);
              return `
              <button class="p3-map-card" data-v="${preset.id}"${disabled ? ' disabled aria-disabled="true"' : ''}>
                <span class="p3-map-preview"></span>
                <span class="p3-map-name">${mapText.name}</span>
                <span class="p3-map-hint">${mapText.hint}</span>
                ${disabled ? `<span class="p3-map-soon">${text.setup.comingSoon}</span>` : ''}
              </button>
            `;
            }).join('')}
          </div>
          <button class="p3-start p3-play-now" id="p3-start">${text.setup.startGame}</button>
        </section>
      </div></div>`;
    const sync = (): void => {
      for (const b of root.querySelectorAll('#p3-diff button')) b.classList.toggle('on', (b as HTMLElement).dataset.v === difficulty);
      for (const b of root.querySelectorAll('#p3-map button')) b.classList.toggle('on', (b as HTMLElement).dataset.v === mapId);
    };
    root.querySelector('#p3-diff')!.addEventListener('click', (e) => {
      const v = (e.target as HTMLElement).dataset.v as Difficulty;
      if (v) {
        difficulty = v;
        sync();
      }
    });
    root.querySelector('#p3-map')!.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('.p3-map-card');
      const v = button?.dataset.v as SkirmishMapId | undefined;
      if (v && !button?.disabled && !DISABLED_MAP_IDS.has(v)) {
        mapId = skirmishMapPreset(v).id;
        sync();
      }
    });
    const start = (): void => {
      audioBus.resume();
      localStorage.setItem('ra2.diff', difficulty);
      localStorage.setItem('ra2.map', mapId);
      startMatch();
    };
    for (const button of root.querySelectorAll('.p3-play-now')) {
      button.addEventListener('click', start);
    }
    sync();
  }

  function startMatch(): void {
    const config = localSkirmishConfig(0, mapId);
    const world = createMatchWorld(config);
    const view = new MatchView3D(root, world, HUMAN, config.mapWidth, config.mapHeight);
    const ai = new SimpleAI(AI_ID, difficulty, (Date.now() ^ (AI_ID * 2654435761)) >>> 0);
    void view.init().then(() => {
      let aiTimer = 0;
      let acc = 0;
      let prev = performance.now();
      let running = true;
      const clock = setInterval(() => {
        const now = performance.now();
        acc += now - prev;
        prev = now;
        let steps = 0;
        while (acc >= TICK_MS && steps < 6) {
          const cmds = view.takeLocalCommands();
          if (++aiTimer >= 15) {
            aiTimer = 0;
            cmds.push(...ai.emit(world));
          }
          view.stepWith(cmds);
          acc -= TICK_MS;
          steps++;
        }
        if (acc > TICK_MS * 6) acc = 0;
      }, TICK_MS);
      const frame = (): void => {
        if (!running) return;
        view.render();
        requestAnimationFrame(frame);
      };
      frame();
      window.addEventListener('hashchange', () => {
        running = false;
        clearInterval(clock);
        view.dispose();
      }, { once: true });
    });
  }

  renderSetup();
}
