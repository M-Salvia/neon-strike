
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
  level: number;
  exp: number;
  expToNextLevel: number;
  fireRate: number;
  damage: number;
  moveSpeed: number;
}

export interface ExperienceOrb {
  id: string;
  pos: Vector2;
  value: number;
  color: string;
  radius: number;
}

export interface HealthPack {
  id: string;
  pos: Vector2;
  value: number;
  color: string;
  radius: number;
}

export interface Bullet extends Entity {
  damage: number;
  ownerId: string;
  isHoming?: boolean;
  homingStrength?: number;
  lifeSpan?: number; 
}

export type EnemyType = 'vanguard' | 'titan' | 'hunter';

export interface Enemy extends Entity {
  type: EnemyType;
  scoreValue: number;
  lastShot: number;
  fireRate: number;
  angle?: number;
  lastHitTime?: number;
}

export interface Particle {
  id: string;
  pos: Vector2;
  velocity: Vector2;
  life: number;
  maxLife: number;
  color: string;
  type?: 'circle' | 'rect' | 'line';
}

export enum GameState {
  START = 'START',
  PLAYING = 'PLAYING',
  LEVEL_UP = 'LEVEL_UP',
  GAMEOVER = 'GAMEOVER'
}
