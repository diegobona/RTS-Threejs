import type { Sfx } from './audio-bus';
import type { WeaponRole } from '@ra2web/game';

type EntityDomain = 'building' | 'infantry' | 'vehicle' | 'aircraft';

export interface ThreeEntityAudioState {
  id: number;
  x: number;
  z: number;
  hp: number;
  cooldown: number;
  targetId: number | null;
  building: boolean;
  engineer: boolean;
  domain?: EntityDomain;
  projectileSpeed: number;
  weaponRole?: WeaponRole;
}

export interface ThreeProjectileAudioState {
  id: number;
  x: number;
  z: number;
  impactKind?: Extract<Sfx, 'hit' | 'explosion' | 'bombImpact'>;
}

export interface ThreeAudioSnapshot {
  entities: ThreeEntityAudioState[];
  projectiles: ThreeProjectileAudioState[];
}

export interface ThreeAudioEvent {
  kind: Extract<Sfx, 'fire' | 'cannon' | 'bomb' | 'bombImpact' | 'scream' | 'hit' | 'explosion' | 'bigExplosion'>;
  x: number;
  z: number;
  targetX?: number;
  targetZ?: number;
}

export class ThreeAudioEventTracker {
  private readonly entities = new Map<number, ThreeEntityAudioState>();
  private readonly projectiles = new Map<number, ThreeProjectileAudioState>();

  update(snapshot: ThreeAudioSnapshot): ThreeAudioEvent[] {
    const events: ThreeAudioEvent[] = [];
    const byId = new Map(snapshot.entities.map((entity) => [entity.id, entity]));
    const seenEntities = new Set<number>();
    for (const entity of snapshot.entities) {
      seenEntities.add(entity.id);
      const prev = this.entities.get(entity.id);
      if (prev) {
        if (entity.hp < prev.hp) events.push({ kind: entity.domain === 'infantry' ? 'scream' : 'hit', x: entity.x, z: entity.z });
        if (entity.targetId !== null && entity.cooldown > prev.cooldown + 1) {
          const target = byId.get(entity.targetId);
          events.push({
            kind: this.fireKind(entity),
            x: entity.x,
            z: entity.z,
            targetX: target?.x,
            targetZ: target?.z,
          });
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
      events.push({ kind: prev.impactKind ?? 'hit', x: prev.x, z: prev.z });
      this.projectiles.delete(id);
    }

    return events;
  }

  private fireKind(entity: ThreeEntityAudioState): ThreeAudioEvent['kind'] {
    if (entity.weaponRole === 'bomb') return 'bomb';
    if (entity.weaponRole === 'missile' || entity.weaponRole === 'cannon') return 'cannon';
    if (entity.projectileSpeed <= 0) return 'fire';
    return entity.domain === 'aircraft' ? 'bomb' : 'cannon';
  }
}
