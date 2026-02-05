
export interface Vector2 {
  x: number;
  y: number;
}

export interface Entity {
  id: string;
  pos: Vector2;
  velocity: Vector2;
  radius: number;
  health: number;
  color: string;
}

export interface Player extends Entity {
  score: number;
  lastShot: number;
  maxHealth: number;
}

export interface Bullet extends Entity {
  damage: number;
  ownerId: string;
  isHoming?: boolean;
  homingStrength?: number;
  lifeSpan?: number; // for homing duration
}

export type EnemyType = 'vanguard' | 'titan' | 'hunter';

export interface Enemy extends Entity {
  type: EnemyType;
  scoreValue: number;
  lastShot: number;
  fireRate: number;
  angle?: number; // for visual rotation or movement
}

export interface Particle {
  id: string;
  pos: Vector2;
  velocity: Vector2;
  life: number;
  maxLife: number;
  color: string;
}

export enum GameState {
  START = 'START',
  PLAYING = 'PLAYING',
  GAMEOVER = 'GAMEOVER'
}
