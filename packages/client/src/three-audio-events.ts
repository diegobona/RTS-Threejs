import type { Sfx } from './audio-bus';

export interface ThreeEntityAudioState {
  id: number;
  x: number;
  z: number;
  hp: number;
  cooldown: number;
  targetId: number | null;
  building: boolean;
  engineer: boolean;
  projectileSpeed: number;
}

export interface ThreeProjectileAudioState {
  id: number;
  x: number;
  z: number;
}

export interface ThreeAudioSnapshot {
  entities: ThreeEntityAudioState[];
  projectiles: ThreeProjectileAudioState[];
}

export interface ThreeAudioEvent {
  kind: Extract<Sfx, 'fire' | 'cannon' | 'hit' | 'explosion' | 'bigExplosion'>;
  x: number;
  z: number;
}

export class ThreeAudioEventTracker {
  private readonly entities = new Map<number, ThreeEntityAudioState>();
  private readonly projectiles = new Map<number, ThreeProjectileAudioState>();

  update(snapshot: ThreeAudioSnapshot): ThreeAudioEvent[] {
    const events: ThreeAudioEvent[] = [];
    const seenEntities = new Set<number>();
    for (const entity of snapshot.entities) {
      seenEntities.add(entity.id);
      const prev = this.entities.get(entity.id);
      if (prev) {
        if (entity.hp < prev.hp) events.push({ kind: 'hit', x: entity.x, z: entity.z });
        if (entity.targetId !== null && entity.cooldown > prev.cooldown + 1) {
          events.push({ kind: entity.projectileSpeed > 0 ? 'cannon' : 'fire', x: entity.x, z: entity.z });
        }
      }
      this.entities.set(entity.id, entity);
    }

    for (const [id, prev] of this.entities) {
      if (seenEntities.has(id)) continue;
      if (!prev.engineer) events.push({ kind: prev.building ? 'bigExplosion' : 'explosion', x: prev.x, z: prev.z });
      this.entities.delete(id);
    }

    const seenProjectiles = new Set<number>();
    for (const projectile of snapshot.projectiles) {
      seenProjectiles.add(projectile.id);
      this.projectiles.set(projectile.id, projectile);
    }
    for (const [id, prev] of this.projectiles) {
      if (seenProjectiles.has(id)) continue;
      events.push({ kind: 'hit', x: prev.x, z: prev.z });
      this.projectiles.delete(id);
    }

    return events;
  }
}
