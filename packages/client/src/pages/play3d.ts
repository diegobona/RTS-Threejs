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
.p3-setup { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
  background: #090d10; color: #d8e0e6; font: 14px/1.6 system-ui, 'PingFang SC', sans-serif; }
.p3-card { width: min(780px, 92vw); background: #121a20; border: 1px solid #25323c; border-radius: 10px; padding: 22px; }
.p3-card h1 { margin: 0 0 16px; font-size: 20px; }
.p3-label { font-size: 12px; color: #9aa7b0; margin: 12px 0 6px; }
.p3-opts { display: flex; gap: 8px; }
.p3-opts button { flex: 1; padding: 8px; background: #0d1318; color: #c8d2da; border: 1px solid #2a3a48;
  border-radius: 6px; cursor: pointer; }
.p3-opts button.on { background: #2d6fb0; color: #fff; border-color: #2d6fb0; }
.p3-maps { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
.p3-map-card { min-height: 112px; padding: 10px; background: #0d1318; color: #c8d2da; border: 1px solid #2a3a48;
  border-radius: 8px; cursor: pointer; text-align: left; }
.p3-map-card.on { border-color: #5ed8cb; box-shadow: inset 0 0 0 1px #5ed8cb; color: #efffff; }
.p3-map-card:disabled { cursor: not-allowed; opacity: .48; filter: grayscale(.35); }
.p3-map-card:disabled.on { border-color: #2a3a48; box-shadow: none; color: #c8d2da; }
.p3-map-preview { height: 52px; margin-bottom: 8px; border-radius: 5px; border: 1px solid #263946; overflow: hidden;
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
.p3-map-name { display: block; font-weight: 800; font-size: 14px; }
.p3-map-hint { display: block; color: #9aa7b0; font-size: 11px; margin-top: 2px; }
.p3-map-soon { display: inline-block; margin-top: 8px; padding: 2px 7px; border-radius: 999px;
  background: rgba(94, 216, 203, .12); border: 1px solid rgba(94, 216, 203, .35); color: #8debe2;
  font-size: 10px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
.p3-start { margin-top: 18px; width: 100%; padding: 11px; border: none; border-radius: 6px;
  background: #3a9a4a; color: #fff; font-size: 16px; font-weight: 700; cursor: pointer; }
`;

export async function renderPlay3D(root: HTMLElement): Promise<void> {
  document.title = uiText().appTitle;
  const style = document.createElement('style');
  style.textContent = MATCH_3D_STYLE + SETUP_3D_STYLE;
  document.head.appendChild(style);

  let difficulty = (localStorage.getItem('ra2.diff') as Difficulty) || 'normal';
  let mapId = skirmishMapPreset(localStorage.getItem('ra2.map')).id;
  if (DISABLED_MAP_IDS.has(mapId)) mapId = 'lakeland';

  function renderSetup(): void {
    const text = uiText();
    root.innerHTML = `
      <div class="p3-setup"><div class="p3-card">
        <h1>${text.appTitle}</h1>
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
        <button class="p3-start" id="p3-start">${text.setup.startGame}</button>
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
    root.querySelector('#p3-start')!.addEventListener('click', () => {
      audioBus.resume();
      localStorage.setItem('ra2.diff', difficulty);
      localStorage.setItem('ra2.map', mapId);
      startMatch();
    });
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
