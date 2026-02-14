
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
  // 增强因子状态
  activePowerUps: {
    overclock: number; // 剩余毫秒
    shield: boolean;   // 是否持有护盾
    sensor: number;    // 剩余毫秒
    vectorCore: number; // 剩余子弹数
  };
}

export interface PowerUp {
  id: string;
  pos: Vector2;
  type: 'overclock' | 'shield' | 'sensor' | 'vectorCore';
  color: string;
  radius: number;
  spawnTime: number;
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
  bounceCount?: number;
  noDecay?: boolean; // 新增：反弹不衰减伤害
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

export interface PlayerPart {
    pos: Vector2;
    color: string;
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

export enum GameMode {
  SURVIVAL = 'SURVIVAL',
  NEONLINK = 'NEONLINK',
  TRAINING = 'TRAINING'
}
