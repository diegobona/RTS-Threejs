import { SIM_TICKS_PER_SECOND } from '@ra2web/game';
import { SimpleAI, type Difficulty } from '../ai';
import { audioBus } from '../audio-bus';
import { createMatchWorld, localSkirmishConfig, type MapSize } from '../match-setup';
import { MATCH_3D_STYLE, MatchView3D } from '../match-view-3d';

const TICK_MS = 1000 / SIM_TICKS_PER_SECOND;
const HUMAN = 1;
const AI_ID = 2;

const SETUP_3D_STYLE = `
.p3-setup { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
  background: #090d10; color: #d8e0e6; font: 14px/1.6 system-ui, 'PingFang SC', sans-serif; }
.p3-card { width: min(420px, 92vw); background: #121a20; border: 1px solid #25323c; border-radius: 10px; padding: 22px; }
.p3-card h1 { margin: 0 0 16px; font-size: 20px; }
.p3-label { font-size: 12px; color: #9aa7b0; margin: 12px 0 6px; }
.p3-opts { display: flex; gap: 8px; }
.p3-opts button { flex: 1; padding: 8px; background: #0d1318; color: #c8d2da; border: 1px solid #2a3a48;
  border-radius: 6px; cursor: pointer; }
.p3-opts button.on { background: #2d6fb0; color: #fff; border-color: #2d6fb0; }
.p3-start { margin-top: 18px; width: 100%; padding: 11px; border: none; border-radius: 6px;
  background: #3a9a4a; color: #fff; font-size: 16px; font-weight: 700; cursor: pointer; }
.p3-note { margin-top: 10px; color: #8d9aa4; font-size: 12px; }
.p3-back { display: block; text-align: center; margin-top: 12px; color: #6db3e8; }
`;

export async function renderPlay3D(root: HTMLElement): Promise<void> {
  document.title = '3D RTS Preview';
  const style = document.createElement('style');
  style.textContent = MATCH_3D_STYLE + SETUP_3D_STYLE;
  document.head.appendChild(style);

  let difficulty = (localStorage.getItem('ra2.diff') as Difficulty) || 'normal';
  let credits = Number(localStorage.getItem('ra2.cash') ?? 10000);
  let mapSize = (localStorage.getItem('ra2.map') as MapSize) || 'medium';

  function renderSetup(): void {
    root.innerHTML = `
      <div class="p3-setup"><div class="p3-card">
        <h1>Three.js 3D RTS Preview</h1>
        <div class="p3-label">AI difficulty</div>
        <div class="p3-opts" id="p3-diff">
          <button data-v="easy">Easy</button>
          <button data-v="normal">Normal</button>
          <button data-v="hard">Hard</button>
        </div>
        <div class="p3-label">Starting credits</div>
        <div class="p3-opts" id="p3-cash">
          <button data-v="3000">3000</button>
          <button data-v="5000">5000</button>
          <button data-v="10000">10000</button>
        </div>
        <div class="p3-label">Map size</div>
        <div class="p3-opts" id="p3-map">
          <button data-v="small">Small</button>
          <button data-v="medium">Medium</button>
          <button data-v="large">Large</button>
        </div>
        <button class="p3-start" id="p3-start">Start 3D Preview</button>
        <div class="p3-note">First slice: 3D terrain and placeholder units only. Controls come next.</div>
        <a class="p3-back" href="#">Back to home</a>
      </div></div>`;
    const sync = (): void => {
      for (const b of root.querySelectorAll('#p3-diff button')) b.classList.toggle('on', (b as HTMLElement).dataset.v === difficulty);
      for (const b of root.querySelectorAll('#p3-cash button')) b.classList.toggle('on', Number((b as HTMLElement).dataset.v) === credits);
      for (const b of root.querySelectorAll('#p3-map button')) b.classList.toggle('on', (b as HTMLElement).dataset.v === mapSize);
    };
    root.querySelector('#p3-diff')!.addEventListener('click', (e) => {
      const v = (e.target as HTMLElement).dataset.v as Difficulty;
      if (v) {
        difficulty = v;
        sync();
      }
    });
    root.querySelector('#p3-cash')!.addEventListener('click', (e) => {
      const v = (e.target as HTMLElement).dataset.v;
      if (v) {
        credits = Number(v);
        sync();
      }
    });
    root.querySelector('#p3-map')!.addEventListener('click', (e) => {
      const v = (e.target as HTMLElement).dataset.v as MapSize;
      if (v) {
        mapSize = v;
        sync();
      }
    });
    root.querySelector('#p3-start')!.addEventListener('click', () => {
      audioBus.resume();
      localStorage.setItem('ra2.diff', difficulty);
      localStorage.setItem('ra2.cash', String(credits));
      localStorage.setItem('ra2.map', mapSize);
      startMatch();
    });
    sync();
  }

  function startMatch(): void {
    const config = localSkirmishConfig(credits, mapSize);
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
