
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GameState, GameMode, Vector2, Player, Bullet, Enemy, EnemyType, Particle, ExperienceOrb, HealthPack, PowerUp } from './types';
import { Target, Zap, Shield, Play, RotateCcw, Trophy, History, Clock, Trash2, ArrowUpCircle, Flame, Heart, Wind, PlusCircle, Globe, Copy, Check, Link as LinkIcon, User, GraduationCap, Swords, Eye, Layers, Info, X } from 'lucide-react';

declare const Peer: any;

const CANVAS_WIDTH = window.innerWidth;
const CANVAS_HEIGHT = window.innerHeight;
const BULLET_SPEED = 14;
const INITIAL_PLAYER_FIRE_RATE = 140; 
const INITIAL_PLAYER_SPEED = 6; 
const INITIAL_SPAWN_INTERVAL = 1800; 
const MIN_SPAWN_INTERVAL = 500; 
const INITIAL_MAX_HEALTH = 200; 
const HEALTH_PACK_DROP_CHANCE = 0.06; 
const MAX_BOUNCES = 2; 

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface GameRecord {
  score: number;
  time: number;
  kills: number;
  date: string;
}

interface UpgradeOption {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  action: () => void;
}

const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [gameState, setGameState] = useState<GameState>(GameState.START);
  const [gameMode, setGameMode] = useState<GameMode | null>(null);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [gameHistory, setGameHistory] = useState<GameRecord[]>([]);
  const [level, setLevel] = useState(1);
  const [expProgress, setExpProgress] = useState(0);
  const [upgradeOptions, setUpgradeOptions] = useState<UpgradeOption[]>([]);
  const [showTrainingInfo, setShowTrainingInfo] = useState(false);

  const [peerId, setPeerId] = useState<string>('');
  const [targetId, setTargetId] = useState<string>('');
  const [connStatus, setConnStatus] = useState<'idle' | 'connecting' | 'connected'>('idle');
  const [copyFeedback, setCopyFeedback] = useState(false);
  const peerRef = useRef<any>(null);
  const connectionRef = useRef<any>(null);

  const scoreRef = useRef<number>(0);
  
  const initialPowerUps = {
    overclock: 0,
    shield: false,
    sensor: 0,
    vectorCore: 0
  };

  const playerRef = useRef<Player>({
    id: 'player',
    pos: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 },
    velocity: { x: 0, y: 0 },
    radius: 15,
    health: INITIAL_MAX_HEALTH,
    maxHealth: INITIAL_MAX_HEALTH,
    color: '#00f2ff',
    score: 0,
    lastShot: 0,
    level: 1,
    exp: 0,
    expToNextLevel: 100,
    fireRate: INITIAL_PLAYER_FIRE_RATE,
    damage: 35,
    moveSpeed: INITIAL_PLAYER_SPEED,
    activePowerUps: { ...initialPowerUps }
  });

  const opponentRef = useRef<Player>({
    id: 'opponent',
    pos: { x: CANVAS_WIDTH - 100, y: CANVAS_HEIGHT / 2 },
    velocity: { x: 0, y: 0 },
    radius: 15,
    health: INITIAL_MAX_HEALTH,
    maxHealth: INITIAL_MAX_HEALTH,
    color: '#bd00ff',
    score: 0,
    lastShot: 0,
    level: 1,
    exp: 0,
    expToNextLevel: 100,
    fireRate: 400,
    damage: 25,
    moveSpeed: 4,
    activePowerUps: { ...initialPowerUps }
  });

  const mazeWallsRef = useRef<Rect[]>([]);
  const bulletsRef = useRef<Bullet[]>([]);
  const enemyBulletsRef = useRef<Bullet[]>([]);
  const opponentsBulletsRef = useRef<Bullet[]>([]); 
  const enemiesRef = useRef<Enemy[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const experienceOrbsRef = useRef<ExperienceOrb[]>([]);
  const healthPacksRef = useRef<HealthPack[]>([]);
  const powerUpsRef = useRef<PowerUp[]>([]);
  const keysRef = useRef<Set<string>>(new Set());
  const mouseRef = useRef<Vector2>({ x: 0, y: 0 });
  
  const lastTimeRef = useRef<number>(0);
  const spawnTimerRef = useRef<number>(INITIAL_SPAWN_INTERVAL - 500);
  const powerUpSpawnTimerRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const enemiesKilledRef = useRef<number>(0);
  const screenShakeRef = useRef<number>(0);
  const frameIdRef = useRef<number>(0);

  const initAudio = async () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') {
      await audioCtxRef.current.resume();
    }
  };

  const playSound = (type: 'shoot' | 'hit' | 'death' | 'playerHit' | 'pickup' | 'levelup' | 'powerup') => {
    if (!audioCtxRef.current || audioCtxRef.current.state !== 'running') return;
    const ctx = audioCtxRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;

    switch (type) {
      case 'shoot':
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
        gain.gain.setValueAtTime(0.04, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
        break;
      case 'hit':
        osc.type = 'sine'; osc.frequency.setValueAtTime(1200, now);
        gain.gain.setValueAtTime(0.015, now); gain.gain.linearRampToValueAtTime(0, now + 0.05);
        osc.start(now); osc.stop(now + 0.05);
        break;
      case 'death':
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(200, now);
        osc.frequency.linearRampToValueAtTime(50, now + 0.2);
        gain.gain.setValueAtTime(0.08, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now); osc.stop(now + 0.2);
        break;
      case 'playerHit':
        osc.type = 'triangle'; osc.frequency.setValueAtTime(150, now);
        osc.frequency.linearRampToValueAtTime(40, now + 0.3);
        gain.gain.setValueAtTime(0.2, now); gain.gain.linearRampToValueAtTime(0, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
        break;
      case 'pickup':
        osc.type = 'sine'; osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
        gain.gain.setValueAtTime(0.08, now); gain.gain.linearRampToValueAtTime(0, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
        break;
      case 'levelup':
        osc.type = 'sine'; osc.frequency.setValueAtTime(523.25, now); 
        osc.frequency.setValueAtTime(659.25, now + 0.1); 
        osc.frequency.setValueAtTime(783.99, now + 0.2); 
        gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now + 0.4);
        osc.start(now); osc.stop(now + 0.4);
        break;
      case 'powerup':
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.2);
        gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now + 0.2);
        osc.start(now); osc.stop(now + 0.2);
        break;
    }
  };

  const setupPeerCallbacks = (conn: any) => {
    conn.on('data', (data: any) => {
      if (data.type === 'maze') {
        mazeWallsRef.current = data.walls;
      } else if (data.type === 'state') {
        opponentRef.current.pos = data.pos;
        opponentRef.current.health = data.health;
        opponentRef.current.maxHealth = data.maxHealth;
        opponentRef.current.activePowerUps = data.activePowerUps;
      } else if (data.type === 'bullet') {
        opponentsBulletsRef.current.push(data.bullet);
        playSound('shoot');
      } else if (data.type === 'powerup_spawn') {
        powerUpsRef.current.push(data.powerUp);
        createExplosion(data.powerUp.pos, data.powerUp.color, 10, 0.5);
      } else if (data.type === 'powerup_collect') {
        const idx = powerUpsRef.current.findIndex(p => p.id === data.id);
        if (idx !== -1) {
            const p = powerUpsRef.current[idx];
            createExplosion(p.pos, p.color, 25, 1.2);
            powerUpsRef.current.splice(idx, 1);
        }
      }
    });
    conn.on('close', () => {
      setConnStatus('idle');
      if (gameState === GameState.PLAYING) setGameState(GameState.GAMEOVER);
    });
  };

  const generateMaze = (mode: GameMode) => {
    if (mode === GameMode.SURVIVAL) {
      mazeWallsRef.current = [];
      return;
    }

    const walls: Rect[] = [];
    const cellSize = 130; 
    const wallThickness = 12;
    const cols = Math.max(1, Math.floor(CANVAS_WIDTH / cellSize));
    const rows = Math.max(1, Math.floor(CANVAS_HEIGHT / cellSize));
    
    const grid: boolean[][] = Array(rows).fill(0).map(() => Array(cols).fill(false));
    const hWalls: boolean[][] = Array(rows + 1).fill(0).map(() => Array(cols).fill(true));
    const vWalls: boolean[][] = Array(rows).fill(0).map(() => Array(cols + 1).fill(true));

    const stack: [number, number][] = [[0, 0]];
    grid[0][0] = true;

    while (stack.length > 0) {
      const [r, c] = stack[stack.length - 1];
      const neighbors = [
        [r - 1, c, 'h', r, c], [r + 1, c, 'h', r + 1, c], [r, c - 1, 'v', r, c], [r, c + 1, 'v', r, c + 1]
      ].filter(([nr, nc]) => 
        (nr as number) >= 0 && (nr as number) < rows && (nc as number) >= 0 && (nc as number) < cols && !grid[nr as number][nc as number]
      );

      if (neighbors.length > 0) {
        const [nr, nc, type, wr, wc] = neighbors[Math.floor(Math.random() * neighbors.length)];
        grid[nr as number][nc as number] = true;
        if (type === 'h') hWalls[wr as number][wc as number] = false;
        else vWalls[wr as number][wc as number] = false;
        stack.push([nr as number, nc as number]);
      } else { stack.pop(); }
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (Math.random() < 0.18) {
           if (r < rows - 1 && Math.random() > 0.5) hWalls[r+1][c] = false;
           else if (c < cols - 1) vWalls[r][c+1] = false;
        }
      }
    }

    const xOffset = (CANVAS_WIDTH - cols * cellSize) / 2;
    const yOffset = (CANVAS_HEIGHT - rows * cellSize) / 2;

    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (hWalls[r][c]) {
          walls.push({ x: xOffset + c * cellSize, y: yOffset + r * cellSize - wallThickness / 2, w: cellSize + wallThickness / 2, h: wallThickness });
        }
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c <= cols; c++) {
        if (vWalls[r][c]) {
          walls.push({ x: xOffset + c * cellSize - wallThickness / 2, y: yOffset + r * cellSize, w: wallThickness, h: cellSize + wallThickness / 2 });
        }
      }
    }

    mazeWallsRef.current = walls;
    playerRef.current.pos = { x: xOffset + cellSize / 2, y: yOffset + cellSize / 2 };
    opponentRef.current.pos = { x: xOffset + (cols - 0.5) * cellSize, y: yOffset + (rows - 0.5) * cellSize };

    if (gameMode === GameMode.NEONLINK && connectionRef.current) {
        connectionRef.current.send({ type: 'maze', walls });
    }
  };

  useEffect(() => {
    const savedHighScore = localStorage.getItem('neon-strike-highscore');
    if (savedHighScore) setHighScore(parseInt(savedHighScore, 10));
    const savedHistory = localStorage.getItem('neon-strike-history');
    if (savedHistory) { try { setGameHistory(JSON.parse(savedHistory)); } catch (e) { setGameHistory([]); } }
    
    if (typeof Peer !== 'undefined') {
      const peer = new Peer();
      peer.on('open', (id: string) => setPeerId(id));
      peer.on('connection', (conn: any) => {
        connectionRef.current = conn;
        setupPeerCallbacks(conn);
        setConnStatus('connected');
        setGameMode(GameMode.NEONLINK);
        setGameState(GameState.PLAYING);
        // 被叫方等待主叫方发送迷宫数据
        resetGame(GameMode.NEONLINK);
      });
      peerRef.current = peer;
    }
    return () => { if (peerRef.current) peerRef.current.destroy(); };
  }, []);

  const connectToPeer = () => {
    if (!peerRef.current || !targetId) return;
    setConnStatus('connecting');
    const conn = peerRef.current.connect(targetId);
    conn.on('open', () => {
      connectionRef.current = conn;
      setupPeerCallbacks(conn);
      setConnStatus('connected');
      setGameMode(GameMode.NEONLINK);
      setGameState(GameState.PLAYING);
      resetGame(GameMode.NEONLINK);
      // 主叫方负责生成迷宫
      generateMaze(GameMode.NEONLINK);
    });
    conn.on('error', () => { setConnStatus('idle'); alert('无法建立连接，请检查 ID 是否正确。'); });
  };

  const copyId = () => {
    navigator.clipboard.writeText(peerId); setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  const resetGame = useCallback((mode?: GameMode) => {
    initAudio();
    const currentMode = mode || gameMode;
    if (!currentMode) return;
    const isSpecial = currentMode === GameMode.TRAINING || currentMode === GameMode.NEONLINK;
    
    playerRef.current = {
      ...playerRef.current,
      health: INITIAL_MAX_HEALTH,
      maxHealth: INITIAL_MAX_HEALTH,
      score: 0, level: 1, exp: 0, expToNextLevel: 100,
      fireRate: isSpecial ? 450 : INITIAL_PLAYER_FIRE_RATE, 
      damage: isSpecial ? 8 : 35,
      moveSpeed: isSpecial ? 3.8 : INITIAL_PLAYER_SPEED,
      activePowerUps: { ...initialPowerUps }
    };
    
    if (currentMode === GameMode.SURVIVAL) { 
        playerRef.current.pos = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 }; 
    }
    
    opponentRef.current = {
      ...opponentRef.current,
      health: INITIAL_MAX_HEALTH, maxHealth: INITIAL_MAX_HEALTH,
      fireRate: isSpecial ? 800 : 400, color: '#bd00ff', 
      damage: isSpecial ? 6 : 25,
      moveSpeed: isSpecial ? 2.5 : 4,
      activePowerUps: { ...initialPowerUps }
    };
    
    // 多人模式下 generateMaze 由 Host 发起
    if (currentMode !== GameMode.NEONLINK) {
        generateMaze(currentMode);
    }
    
    bulletsRef.current = []; enemyBulletsRef.current = []; opponentsBulletsRef.current = []; enemiesRef.current = [];
    particlesRef.current = []; experienceOrbsRef.current = []; healthPacksRef.current = []; powerUpsRef.current = [];
    scoreRef.current = 0; setScore(0); setLevel(1); setExpProgress(0); setElapsedTime(0);
    enemiesKilledRef.current = 0; startTimeRef.current = Date.now(); spawnTimerRef.current = INITIAL_SPAWN_INTERVAL - 200;
    powerUpSpawnTimerRef.current = 0; screenShakeRef.current = 0;
  }, [gameMode]);

  const handleShoot = () => {
    if (gameState !== GameState.PLAYING) return;
    const now = Date.now();
    const pl = playerRef.current;
    const effectiveFireRate = pl.activePowerUps.overclock > 0 ? pl.fireRate * 0.4 : pl.fireRate;
    if (now - pl.lastShot < effectiveFireRate) return;
    const angle = Math.atan2(mouseRef.current.y - pl.pos.y, mouseRef.current.x - pl.pos.x);
    const speed = pl.activePowerUps.overclock > 0 ? BULLET_SPEED * 1.3 : BULLET_SPEED;
    let bounceCount = (gameMode === GameMode.TRAINING || gameMode === GameMode.NEONLINK) ? MAX_BOUNCES : 0;
    let noDecay = false;
    if (pl.activePowerUps.vectorCore > 0) { bounceCount += 2; noDecay = true; pl.activePowerUps.vectorCore--; }
    
    const bullet = {
      id: Math.random().toString(), pos: { ...pl.pos },
      velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
      radius: 4, health: 1, color: pl.activePowerUps.overclock > 0 ? '#f59e0b' : '#00f2ff', 
      damage: pl.damage, ownerId: 'player', bounceCount, noDecay
    };
    
    bulletsRef.current.push(bullet);
    pl.lastShot = now; 
    playSound('shoot');

    if (gameMode === GameMode.NEONLINK && connectionRef.current) {
      connectionRef.current.send({ type: 'bullet', bullet });
    }
  };

  const clearHistory = () => { if (confirm('确定要清除所有战绩历史吗？')) { localStorage.removeItem('neon-strike-history'); setGameHistory([]); } };

  const createExplosion = (pos: Vector2, color: string, count = 15, speedMult = 1) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const force = Math.random() * 8 * speedMult + 2;
      const typeRand = Math.random();
      const type = typeRand > 0.7 ? 'rect' : (typeRand > 0.4 ? 'line' : 'circle');
      particlesRef.current.push({
        id: Math.random().toString(), pos: { ...pos },
        velocity: { x: Math.cos(angle) * force, y: Math.sin(angle) * force },
        life: 1, maxLife: Math.random() * 0.8 + 0.4, color, type
      });
    }
  };

  const spawnPowerUp = () => {
    if (gameMode === GameMode.SURVIVAL) return;
    // 多人对战只由发起方触发生成
    if (gameMode === GameMode.NEONLINK && connectionRef.current && connectionRef.current.peer !== targetId) {
        // 简单逻辑：如果是主叫方则生成
    }

    const types: ('overclock' | 'shield' | 'sensor' | 'vectorCore')[] = ['overclock', 'shield', 'sensor', 'vectorCore'];
    const type = types[Math.floor(Math.random() * types.length)];
    const colors = { overclock: '#f59e0b', shield: '#22c55e', sensor: '#00f2ff', vectorCore: '#bd00ff' };
    
    let x = 0, y = 0, attempts = 0;
    while(attempts < 50) {
      x = 100 + Math.random() * (CANVAS_WIDTH - 200);
      y = 100 + Math.random() * (CANVAS_HEIGHT - 200);
      if (!checkWallCollision({x, y}, 30)) break;
      attempts++;
    }

    const newPowerUp: PowerUp = { id: Math.random().toString(), pos: {x, y}, type, color: colors[type], radius: 18, spawnTime: Date.now() };
    powerUpsRef.current.push(newPowerUp);
    createExplosion({x, y}, colors[type], 10, 0.5);

    if (gameMode === GameMode.NEONLINK && connectionRef.current) {
        connectionRef.current.send({ type: 'powerup_spawn', powerUp: newPowerUp });
    }
  };

  const spawnExperience = (pos: Vector2, value: number) => {
    experienceOrbsRef.current.push({ id: Math.random().toString(), pos: { ...pos }, value, color: '#00f2ff', radius: 4 + Math.sqrt(value) * 0.5 });
  };

  const spawnHealthPack = (pos: Vector2) => {
    healthPacksRef.current.push({ id: Math.random().toString(), pos: { ...pos }, value: 30, color: '#22c55e', radius: 12 });
  };

  const spawnEnemy = useCallback(() => {
    if (gameMode !== GameMode.SURVIVAL) return;
    const side = Math.floor(Math.random() * 4);
    let x, y;
    if (side === 0) { x = Math.random() * CANVAS_WIDTH; y = -50; }
    else if (side === 1) { x = CANVAS_WIDTH + 50; y = Math.random() * CANVAS_HEIGHT; }
    else if (side === 2) { x = Math.random() * CANVAS_WIDTH; y = CANVAS_HEIGHT + 50; }
    else { x = -50; y = Math.random() * CANVAS_HEIGHT; }
    const now = Date.now();
    const gameDuration = (now - startTimeRef.current) / 1000;
    const difficultyLevel = Math.min(4.0, 1 + gameDuration / 100); 
    const rand = Math.random();
    let type: EnemyType = 'vanguard';
    const titanThreshold = Math.max(0.85, 0.98 - gameDuration / 200);
    const hunterThreshold = Math.max(0.6, 0.90 - gameDuration / 150);
    let config;
    if (rand > titanThreshold) { 
      type = 'titan';
      config = { health: 350 * difficultyLevel, color: '#bd00ff', radius: 35, score: 800, fireRate: 3400 / Math.sqrt(difficultyLevel) };
    } else if (rand > hunterThreshold) { 
      type = 'hunter';
      config = { health: 55 * difficultyLevel, color: '#ffcc00', radius: 18, score: 300, fireRate: 3000 / Math.sqrt(difficultyLevel) };
    } else { config = { health: 18 * difficultyLevel, color: '#ff0055', radius: 12, score: 100, fireRate: 0 }; }
    enemiesRef.current.push({
      id: Math.random().toString(), pos: { x, y }, velocity: { x: 0, y: 0 },
      radius: config.radius, health: config.health, color: config.color,
      scoreValue: config.score, type, fireRate: config.fireRate, lastShot: now + Math.random() * 1000,
      lastHitTime: 0
    });
  }, [gameMode]);

  const checkWallCollision = (pos: Vector2, radius: number): boolean => {
    if (gameMode === GameMode.SURVIVAL || !mazeWallsRef.current) return false;
    for (const wall of mazeWallsRef.current) {
      const closestX = Math.max(wall.x, Math.min(pos.x, wall.x + wall.w));
      const closestY = Math.max(wall.y, Math.min(pos.y, wall.y + wall.h));
      const distanceX = pos.x - closestX; const distanceY = pos.y - closestY;
      const distanceSquared = (distanceX * distanceX) + (distanceY * distanceY);
      if (distanceSquared < radius * radius) return true;
    }
    return false;
  };

  const triggerLevelUp = () => {
    playSound('levelup');
    const options: UpgradeOption[] = [
      { id: 'fire_rate', title: '超频模块', description: '射击间隔降低 15%', icon: <Zap className="text-yellow-400" />, action: () => { playerRef.current.fireRate *= 0.85; } },
      { id: 'damage', title: '高能核心', description: '子弹伤害提升 25%', icon: <Flame className="text-orange-500" />, action: () => { playerRef.current.damage *= 1.25; } },
      { id: 'health', title: '结构加固', description: '最大生命值 +60，并回复 100 点', icon: <Heart className="text-red-500" />, action: () => { playerRef.current.maxHealth += 60; playerRef.current.health = Math.min(playerRef.current.maxHealth, playerRef.current.health + 100); } },
      { id: 'speed', title: '脉冲引擎', description: '移动速度提升 12%', icon: <Wind className="text-blue-400" />, action: () => { playerRef.current.moveSpeed *= 1.12; } }
    ];
    const shuffled = [...options].sort(() => 0.5 - Math.random()).slice(0, 3);
    setUpgradeOptions(shuffled); setGameState(GameState.LEVEL_UP);
  };

  const updateTrainingAI = (dt: number) => {
    if (gameMode !== GameMode.TRAINING) return;
    const now = Date.now();
    const ai = opponentRef.current;
    const player = playerRef.current;
    const dx = player.pos.x - ai.pos.x, dy = player.pos.y - ai.pos.y, dist = Math.sqrt(dx * dx + dy * dy);
    let moveX = 0, moveY = 0; const idealDist = 400, distMargin = 50;
    if (dist > idealDist + distMargin) { moveX = dx / dist; moveY = dy / dist; }
    else if (dist < idealDist - distMargin) { moveX = -dx / dist; moveY = -dy / dist; }
    const strafeFreq = 0.002, strafeX = Math.cos(now * strafeFreq) * 0.5, strafeY = Math.sin(now * strafeFreq) * 0.5;
    const nextX = ai.pos.x + (moveX + strafeX) * ai.moveSpeed, nextY = ai.pos.y + (moveY + strafeY) * ai.moveSpeed;
    if (!checkWallCollision({ x: nextX, y: ai.pos.y }, ai.radius)) ai.pos.x = nextX;
    if (!checkWallCollision({ x: ai.pos.x, y: nextY }, ai.radius)) ai.pos.y = nextY;
    ai.pos.x = Math.max(25, Math.min(CANVAS_WIDTH - 25, ai.pos.x)); ai.pos.y = Math.max(25, Math.min(CANVAS_HEIGHT - 25, ai.pos.y));
    if (now - ai.lastShot > ai.fireRate) {
      const jitter = (Math.random() - 0.5) * 0.15, angle = Math.atan2(dy, dx) + jitter;
      opponentsBulletsRef.current.push({
        id: Math.random().toString(), pos: { ...ai.pos },
        velocity: { x: Math.cos(angle) * BULLET_SPEED, y: Math.sin(angle) * BULLET_SPEED },
        radius: 4, health: 1, color: ai.color, damage: ai.damage, ownerId: 'ai', bounceCount: MAX_BOUNCES
      });
      ai.lastShot = now; playSound('shoot');
    }
  };

  const processBulletBounce = (b: Bullet) => {
    if (!mazeWallsRef.current) return null;
    for (const wall of mazeWallsRef.current) {
        if (b.pos.x + b.radius > wall.x && b.pos.x - b.radius < wall.x + wall.w && b.pos.y + b.radius > wall.y && b.pos.y - b.radius < wall.y + wall.h) {
            const isReflectMode = gameMode === GameMode.TRAINING || gameMode === GameMode.NEONLINK;
            if (isReflectMode && b.bounceCount && b.bounceCount > 0) {
                const overlapX = Math.min(b.pos.x + b.radius - wall.x, wall.x + wall.w - (b.pos.x - b.radius));
                const overlapY = Math.min(b.pos.y + b.radius - wall.y, wall.y + wall.h - (b.pos.y - b.radius));
                if (overlapX < overlapY) { b.velocity.x *= -1; b.pos.x += b.velocity.x > 0 ? overlapX : -overlapX; }
                else { b.velocity.y *= -1; b.pos.y += b.velocity.y > 0 ? overlapY : -overlapY; }
                b.bounceCount--;
                if (!b.noDecay) b.damage *= 0.8; 
                createExplosion(b.pos, '#f59e0b', 8, 0.4); return true; 
            } else { return false; }
        }
    }
    return null; 
  };

  const update = (dt: number) => {
    if (gameState !== GameState.PLAYING) return;
    const now = Date.now();
    const gameDuration = (now - startTimeRef.current) / 1000;
    setElapsedTime(Math.floor(gameDuration));
    if (screenShakeRef.current > 0) screenShakeRef.current *= 0.9;
    const pl = playerRef.current;
    if (pl.activePowerUps.overclock > 0) pl.activePowerUps.overclock -= dt;
    if (pl.activePowerUps.sensor > 0) pl.activePowerUps.sensor -= dt;
    
    let vx = 0, vy = 0;
    if (keysRef.current.has('w')) vy -= 1; if (keysRef.current.has('s')) vy += 1;
    if (keysRef.current.has('a')) vx -= 1; if (keysRef.current.has('d')) vx += 1;
    if (vx !== 0 || vy !== 0) {
      const length = Math.sqrt(vx * vx + vy * vy);
      const stepX = (vx / length) * pl.moveSpeed, stepY = (vy / length) * pl.moveSpeed;
      const nextX = pl.pos.x + stepX, nextY = pl.pos.y + stepY;
      if (!checkWallCollision({ x: nextX, y: pl.pos.y }, pl.radius)) pl.pos.x = nextX;
      if (!checkWallCollision({ x: pl.pos.x, y: nextY }, pl.radius)) pl.pos.y = nextY;
    }
    pl.pos.x = Math.max(25, Math.min(CANVAS_WIDTH - 25, pl.pos.x));
    pl.pos.y = Math.max(25, Math.min(CANVAS_HEIGHT - 25, pl.pos.y));

    if (gameMode === GameMode.NEONLINK && connectionRef.current) {
      connectionRef.current.send({
        type: 'state',
        pos: pl.pos,
        health: pl.health,
        maxHealth: pl.maxHealth,
        activePowerUps: pl.activePowerUps
      });
    }

    if (gameMode === GameMode.TRAINING) {
      updateTrainingAI(dt);
    }
    
    if (gameMode !== GameMode.SURVIVAL) {
      for (let i = powerUpsRef.current.length - 1; i >= 0; i--) {
        const p = powerUpsRef.current[i];
        const dist = Math.sqrt((pl.pos.x - p.pos.x)**2 + (pl.pos.y - p.pos.y)**2);
        if (dist < pl.radius + p.radius) {
          playSound('powerup');
          if (p.type === 'overclock') pl.activePowerUps.overclock = 6000;
          else if (p.type === 'shield') pl.activePowerUps.shield = true;
          else if (p.type === 'sensor') pl.activePowerUps.sensor = 11000;
          else if (p.type === 'vectorCore') pl.activePowerUps.vectorCore = 5;
          createExplosion(p.pos, p.color, 25, 1.2);
          
          if (gameMode === GameMode.NEONLINK && connectionRef.current) {
            connectionRef.current.send({ type: 'powerup_collect', id: p.id });
          }
          powerUpsRef.current.splice(i, 1);
        }
      }
      // 只有 Host 发起因子生成
      const isHost = gameMode === GameMode.NEONLINK ? (connectionRef.current && connectionRef.current.peer === targetId) : true;
      if (isHost || gameMode === GameMode.TRAINING) {
          powerUpSpawnTimerRef.current += dt;
          if (powerUpSpawnTimerRef.current > 12000) { spawnPowerUp(); powerUpSpawnTimerRef.current = 0; }
      }
    }

    if (gameMode === GameMode.SURVIVAL) {
      for (let i = experienceOrbsRef.current.length - 1; i >= 0; i--) {
        const orb = experienceOrbsRef.current[i];
        const dx = pl.pos.x - orb.pos.x, dy = pl.pos.y - orb.pos.y, dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 200) { orb.pos.x += (dx / dist) * 8.5; orb.pos.y += (dy / dist) * 8.5; }
        if (dist < pl.radius + orb.radius) {
          playSound('pickup'); pl.exp += orb.value; createExplosion(orb.pos, orb.color, 5, 0.4); experienceOrbsRef.current.splice(i, 1);
          if (pl.exp >= pl.expToNextLevel) {
            pl.exp -= pl.expToNextLevel; pl.level += 1; pl.expToNextLevel = Math.floor(pl.expToNextLevel * 1.3); setLevel(pl.level); triggerLevelUp();
          }
          setExpProgress(pl.exp / pl.expToNextLevel);
        }
      }
      for (let i = healthPacksRef.current.length - 1; i >= 0; i--) {
        const pack = healthPacksRef.current[i];
        const dx = pl.pos.x - pack.pos.x, dy = pl.pos.y - pack.pos.y, dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 150) { pack.pos.x += (dx / dist) * 7.0; pack.pos.y += (dy / dist) * 7.0; }
        if (dist < pl.radius + pack.radius) {
          playSound('pickup'); pl.health = Math.min(pl.maxHealth, pl.health + pack.value); createExplosion(pack.pos, pack.color, 12, 0.6); healthPacksRef.current.splice(i, 1);
        }
      }
      const currentSpawnInterval = Math.max(MIN_SPAWN_INTERVAL, INITIAL_SPAWN_INTERVAL - (gameDuration * 8));
      spawnTimerRef.current += dt; if (spawnTimerRef.current > currentSpawnInterval) { spawnEnemy(); spawnTimerRef.current = 0; }
    }

    const handleBulletHitPlayer = (bullet: Bullet, container: Bullet[], idx: number) => {
        if (pl.activePowerUps.shield) {
            pl.activePowerUps.shield = false; playSound('powerup'); createExplosion(pl.pos, '#22c55e', 20, 1.5); container.splice(idx, 1); return true;
        }
        pl.health -= bullet.damage; playSound('playerHit'); screenShakeRef.current = 10; container.splice(idx, 1); if (pl.health <= 0) endGame(); return true;
    };

    for (let i = bulletsRef.current.length - 1; i >= 0; i--) {
      const b = bulletsRef.current[i]; b.pos.x += b.velocity.x; b.pos.y += b.velocity.y;
      const bounceResult = processBulletBounce(b);
      if (bounceResult === false) { createExplosion(b.pos, '#f59e0b', 5, 0.3); bulletsRef.current.splice(i, 1); continue; }
      const isDuelMode = gameMode === GameMode.TRAINING || gameMode === GameMode.NEONLINK;
      if (isDuelMode) {
        const ai = opponentRef.current; const dAi = Math.sqrt((b.pos.x - ai.pos.x)**2 + (b.pos.y - ai.pos.y)**2);
        if (dAi < ai.radius + b.radius) { 
            if (gameMode === GameMode.TRAINING) ai.health -= b.damage; 
            playSound('hit'); createExplosion(b.pos, ai.color, 5, 0.5); bulletsRef.current.splice(i, 1); 
            if (gameMode === GameMode.TRAINING && ai.health <= 0) endGame(); continue; 
        }
        const dPl = Math.sqrt((b.pos.x - pl.pos.x)**2 + (b.pos.y - pl.pos.y)**2);
        if (b.bounceCount < MAX_BOUNCES && dPl < pl.radius + b.radius) { handleBulletHitPlayer(b, bulletsRef.current, i); continue; }
      }
      if (b.pos.x < -100 || b.pos.x > CANVAS_WIDTH + 100 || b.pos.y < -100 || b.pos.y > CANVAS_HEIGHT + 100) bulletsRef.current.splice(i, 1);
    }
    for (let i = opponentsBulletsRef.current.length - 1; i >= 0; i--) {
      const b = opponentsBulletsRef.current[i]; b.pos.x += b.velocity.x; b.pos.y += b.velocity.y;
      const bounceResult = processBulletBounce(b);
      if (bounceResult === false) { createExplosion(b.pos, '#f59e0b', 5, 0.3); opponentsBulletsRef.current.splice(i, 1); continue; }
      const dPl = Math.sqrt((b.pos.x - pl.pos.x)**2 + (b.pos.y - pl.pos.y)**2);
      if (dPl < pl.radius + b.radius) { handleBulletHitPlayer(b, opponentsBulletsRef.current, i); continue; }
      if (b.pos.x < -100 || b.pos.x > CANVAS_WIDTH + 100 || b.pos.y < -100 || b.pos.y > CANVAS_HEIGHT + 100) opponentsBulletsRef.current.splice(i, 1);
    }
    for (let i = enemyBulletsRef.current.length - 1; i >= 0; i--) {
      const b = enemyBulletsRef.current[i];
      if (b.isHoming && b.lifeSpan && b.lifeSpan > 0) {
        const dx = pl.pos.x - b.pos.x, dy = pl.pos.y - b.pos.y, targetAngle = Math.atan2(dy, dx), currentAngle = Math.atan2(b.velocity.y, b.velocity.x);
        let newAngle = currentAngle + (targetAngle - currentAngle) * 0.04; const speed = Math.sqrt(b.velocity.x**2 + b.velocity.y**2);
        b.velocity.x = Math.cos(newAngle) * speed; b.velocity.y = Math.sin(newAngle) * speed; b.lifeSpan -= dt;
      }
      b.pos.x += b.velocity.x; b.pos.y += b.velocity.y;
      const dist = Math.sqrt((pl.pos.x - b.pos.x)**2 + (pl.pos.y - b.pos.y)**2);
      if (dist < pl.radius + b.radius) { handleBulletHitPlayer(b, enemyBulletsRef.current, i); continue; }
      if (b.pos.x < -100 || b.pos.x > CANVAS_WIDTH + 100 || b.pos.y < -100 || b.pos.y > CANVAS_HEIGHT + 100) enemyBulletsRef.current.splice(i, 1);
    }
    
    if (gameMode === GameMode.SURVIVAL) {
      for (let i = enemiesRef.current.length - 1; i >= 0; i--) {
        const e = enemiesRef.current[i]; const dx = pl.pos.x - e.pos.x, dy = pl.pos.y - e.pos.y, dist = Math.sqrt(dx * dx + dy * dy);
        const moveSpeed = e.type === 'vanguard' ? 2.0 : (e.type === 'titan' ? 0.6 : 1.4);
        if (e.type === 'vanguard') e.velocity = { x: (dx / dist) * moveSpeed, y: (dy / dist) * moveSpeed };
        else if (e.type === 'titan') {
          e.velocity = { x: (dx / dist) * moveSpeed, y: (dy / dist) * moveSpeed };
          if (now - e.lastShot > e.fireRate) {
            for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) { enemyBulletsRef.current.push({ id: Math.random().toString(), pos: { ...e.pos }, velocity: { x: Math.cos(a) * 3.2, y: Math.sin(a) * 3.2 }, radius: 6, health: 1, color: e.color, damage: 18, ownerId: e.id }); }
            e.lastShot = now;
          }
        } else if (e.type === 'hunter') {
          const factor = dist > 400 ? 1.2 : -0.7; e.velocity = { x: (dx / dist) * moveSpeed * factor, y: (dy / dist) * moveSpeed * factor };
          if (now - e.lastShot > e.fireRate) {
            enemyBulletsRef.current.push({ id: Math.random().toString(), pos: { ...e.pos }, velocity: { x: (dx / dist) * 5.0, y: (dy / dist) * 5.0 }, radius: 5, health: 1, color: e.color, damage: 12, ownerId: e.id, isHoming: true, homingStrength: 0.08, lifeSpan: 2200 });
            e.lastShot = now;
          }
        }
        e.pos.x += e.velocity.x; e.pos.y += e.velocity.y;
        if (dist < pl.radius + e.radius) { pl.health -= e.type === 'titan' ? 2.0 : 1.0; screenShakeRef.current = 8; if (pl.health <= 0) endGame(); }
        for (let bi = bulletsRef.current.length - 1; bi >= 0; bi--) {
          const b = bulletsRef.current[bi]; const bdx = e.pos.x - b.pos.x, bdy = e.pos.y - b.pos.y;
          if (Math.sqrt(bdx*bdx + bdy*bdy) < e.radius + b.radius) {
            e.health -= b.damage; e.lastHitTime = now; bulletsRef.current.splice(bi, 1); createExplosion(b.pos, '#ffffff', 3, 0.5); playSound('hit');
            if (e.health <= 0) {
              playSound('death'); enemiesKilledRef.current++; const newScore = scoreRef.current + e.scoreValue; scoreRef.current = newScore; setScore(newScore); if (newScore > highScore) setHighScore(newScore);
              spawnExperience(e.pos, e.type === 'titan' ? 80 : (e.type === 'hunter' ? 35 : 15));
              if (Math.random() < HEALTH_PACK_DROP_CHANCE) spawnHealthPack(e.pos);
              screenShakeRef.current = Math.max(screenShakeRef.current, e.type === 'titan' ? 18 : 5);
              createExplosion(e.pos, e.color, e.type === 'titan' ? 50 : 20, e.type === 'titan' ? 1.8 : 0.9); enemiesRef.current.splice(i, 1); break; 
            }
          }
        }
      }
    }
    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
      const p = particlesRef.current[i]; p.pos.x += p.velocity.x; p.pos.y += p.velocity.y; p.velocity.x *= 0.96; p.velocity.y *= 0.96;
      p.life -= dt / 1000; if (p.life <= 0) particlesRef.current.splice(i, 1);
    }
  };

  const drawEntity = (ctx: CanvasRenderingContext2D, e: Enemy) => {
    ctx.save(); ctx.translate(e.pos.x, e.pos.y);
    const now = Date.now(), isFlashing = e.lastHitTime && now - e.lastHitTime < 50;
    ctx.strokeStyle = isFlashing ? '#ffffff' : e.color; ctx.shadowBlur = isFlashing ? 30 : 15; ctx.shadowColor = isFlashing ? '#ffffff' : e.color; ctx.lineWidth = 3; ctx.beginPath();
    if (e.type === 'vanguard') { const angle = Math.atan2(e.velocity.y, e.velocity.x); ctx.rotate(angle); ctx.moveTo(e.radius, 0); ctx.lineTo(-e.radius, -e.radius/1.5); ctx.lineTo(-e.radius, e.radius/1.5); }
    else if (e.type === 'titan') { ctx.rotate(Date.now() * 0.0008); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const x = Math.cos(a) * e.radius, y = Math.sin(a) * e.radius; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } }
    else if (e.type === 'hunter') { ctx.rotate(Math.atan2(playerRef.current.pos.y - e.pos.y, playerRef.current.pos.x - e.pos.x)); ctx.moveTo(0, -e.radius); ctx.lineTo(e.radius, 0); ctx.lineTo(0, e.radius); ctx.lineTo(-e.radius, 0); }
    ctx.closePath(); ctx.stroke(); if (isFlashing) { ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'; ctx.fill(); }
    ctx.restore();
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    ctx.save(); const sx = (Math.random() - 0.5) * screenShakeRef.current, sy = (Math.random() - 0.5) * screenShakeRef.current; ctx.translate(sx, sy);
    ctx.fillStyle = '#060606'; ctx.fillRect(-50, -50, CANVAS_WIDTH + 100, CANVAS_HEIGHT + 100);
    const parallaxX = (playerRef.current.pos.x / CANVAS_WIDTH) * 20, parallaxY = (playerRef.current.pos.y / CANVAS_HEIGHT) * 20;
    ctx.strokeStyle = 'rgba(0, 242, 255, 0.05)'; ctx.lineWidth = 1;
    for (let i = -60; i < CANVAS_WIDTH + 60; i += 60) { ctx.beginPath(); ctx.moveTo(i - parallaxX, 0); ctx.lineTo(i - parallaxX, CANVAS_HEIGHT); ctx.stroke(); }
    for (let i = -60; i < CANVAS_HEIGHT + 60; i += 60) { ctx.beginPath(); ctx.moveTo(0, i - parallaxY); ctx.lineTo(CANVAS_WIDTH, i - parallaxY); ctx.stroke(); }
    if (![GameState.PLAYING, GameState.GAMEOVER, GameState.LEVEL_UP].includes(gameState)) { ctx.restore(); return; }
    
    const pl = playerRef.current;
    
    if (gameMode !== GameMode.SURVIVAL && mazeWallsRef.current) {
      mazeWallsRef.current.forEach(w => {
        ctx.save(); ctx.shadowBlur = 10; ctx.shadowColor = 'rgba(245, 158, 11, 0.5)'; ctx.fillStyle = 'rgba(245, 158, 11, 0.1)'; ctx.fillRect(w.x, w.y, w.w, w.h);
        ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2; ctx.strokeRect(w.x, w.y, w.w, w.h); ctx.restore();
      });
      
      const opp = opponentRef.current;
      ctx.save(); ctx.translate(opp.pos.x, opp.pos.y);
      ctx.strokeStyle = opp.color; ctx.shadowBlur = 15; ctx.shadowColor = opp.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, opp.radius, 0, Math.PI * 2); ctx.stroke();
      if (opp.activePowerUps.shield) {
          ctx.save(); ctx.rotate(Date.now() * 0.002);
          ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 2; ctx.shadowBlur = 15; ctx.shadowColor = '#22c55e';
          ctx.beginPath(); for(let i=0; i<6; i++) { const a = (i/6)*Math.PI*2; const x = Math.cos(a)*30, y = Math.sin(a)*30; if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }
          ctx.closePath(); ctx.stroke(); ctx.restore();
      }
      ctx.restore();

      powerUpsRef.current.forEach(p => {
          ctx.save(); ctx.translate(p.pos.x, p.pos.y);
          const bounce = Math.sin(Date.now() * 0.005) * 5; ctx.translate(0, bounce);
          ctx.strokeStyle = p.color; ctx.shadowBlur = 20; ctx.shadowColor = p.color; ctx.lineWidth = 2;
          ctx.strokeRect(-p.radius, -p.radius, p.radius*2, p.radius*2);
          ctx.fillStyle = p.color; ctx.globalAlpha = 0.2; ctx.fillRect(-p.radius, -p.radius, p.radius*2, p.radius*2);
          ctx.globalAlpha = 1.0; ctx.restore();
      });
    }

    experienceOrbsRef.current.forEach(orb => {
      ctx.fillStyle = orb.color; ctx.shadowBlur = 15; ctx.shadowColor = orb.color; ctx.beginPath(); ctx.arc(orb.pos.x, orb.pos.y, orb.radius, 0, Math.PI * 2); ctx.fill();
    });
    healthPacksRef.current.forEach(pack => {
      ctx.save(); ctx.translate(pack.pos.x, pack.pos.y); ctx.fillStyle = pack.color; ctx.shadowBlur = 20; ctx.shadowColor = pack.color; ctx.fillRect(-pack.radius, -pack.radius/3, pack.radius*2, pack.radius/1.5); ctx.fillRect(-pack.radius/3, -pack.radius, pack.radius/1.5, pack.radius*2); ctx.restore();
    });
    particlesRef.current.forEach(p => { ctx.fillStyle = p.color; ctx.globalAlpha = p.life; ctx.fillRect(p.pos.x, p.pos.y, 3 * p.life, 3 * p.life); });
    ctx.globalAlpha = 1;
    
    if (gameMode !== GameMode.SURVIVAL) {
      ctx.save();
      const isScanning = pl.activePowerUps.sensor > 8000;
      const baseFogRadius = pl.activePowerUps.sensor > 0 ? 650 : 420;
      const fogGradient = ctx.createRadialGradient(pl.pos.x, pl.pos.y, 0, pl.pos.x, pl.pos.y, isScanning ? CANVAS_WIDTH * 1.5 : baseFogRadius);
      fogGradient.addColorStop(0, 'rgba(255, 253, 240, 0.1)'); 
      fogGradient.addColorStop(0.15, 'rgba(6, 6, 6, 0)');
      fogGradient.addColorStop(0.6, isScanning ? 'rgba(6, 6, 6, 0)' : 'rgba(6, 6, 6, 0.85)');
      fogGradient.addColorStop(1, isScanning ? 'rgba(6, 6, 6, 0)' : 'rgba(6, 6, 6, 1)');
      ctx.fillStyle = fogGradient; ctx.fillRect(-500, -500, CANVAS_WIDTH + 1000, CANVAS_HEIGHT + 1000);
      if (isScanning) {
          const scanProgress = (11000 - pl.activePowerUps.sensor) / 3000;
          ctx.strokeStyle = '#00f2ff'; ctx.lineWidth = 2; ctx.globalAlpha = 1 - scanProgress;
          ctx.beginPath(); ctx.arc(pl.pos.x, pl.pos.y, scanProgress * CANVAS_WIDTH, 0, Math.PI*2); ctx.stroke();
          ctx.globalAlpha = 1.0;
      }
      ctx.restore();
      if (pl.activePowerUps.shield) {
          ctx.save(); ctx.translate(pl.pos.x, pl.pos.y); ctx.rotate(Date.now() * 0.002);
          ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 2; ctx.shadowBlur = 15; ctx.shadowColor = '#22c55e';
          ctx.beginPath(); for(let i=0; i<6; i++) { const a = (i/6)*Math.PI*2; const x = Math.cos(a)*35, y = Math.sin(a)*35; if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }
          ctx.closePath(); ctx.stroke(); ctx.restore();
      }
    }
    
    ctx.save(); ctx.translate(pl.pos.x, pl.pos.y);
    ctx.rotate(Math.atan2(mouseRef.current.y - pl.pos.y, mouseRef.current.x - pl.pos.x));
    const gunColor = pl.activePowerUps.overclock > 0 ? '#f59e0b' : pl.color;
    ctx.strokeStyle = gunColor; ctx.shadowBlur = 25; ctx.shadowColor = gunColor; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-12, -12); ctx.lineTo(-12, 12); ctx.closePath(); ctx.stroke();
    if (pl.activePowerUps.vectorCore > 0) { ctx.fillStyle = '#bd00ff'; ctx.beginPath(); ctx.arc(22, 0, 4, 0, Math.PI*2); ctx.fill(); }
    ctx.restore();

    bulletsRef.current.forEach(b => {
      ctx.strokeStyle = b.color; ctx.lineWidth = b.radius * 1.5; ctx.beginPath(); ctx.moveTo(b.pos.x, b.pos.y); ctx.lineTo(b.pos.x - b.velocity.x * 1.5, b.pos.y - b.velocity.y * 1.5); ctx.stroke();
      if (b.noDecay) { ctx.fillStyle = '#bd00ff'; ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y, 2, 0, Math.PI*2); ctx.fill(); }
    });
    opponentsBulletsRef.current.forEach(b => {
      ctx.strokeStyle = b.color; ctx.lineWidth = b.radius * 1.5; ctx.beginPath(); ctx.moveTo(b.pos.x, b.pos.y); ctx.lineTo(b.pos.x - b.velocity.x * 1.5, b.pos.y - b.velocity.y * 1.5); ctx.stroke();
      if (b.noDecay) { ctx.fillStyle = '#bd00ff'; ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y, 2, 0, Math.PI*2); ctx.fill(); }
    });
    enemyBulletsRef.current.forEach(b => { ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y, b.radius, 0, Math.PI * 2); ctx.fill(); });
    if (gameMode === GameMode.SURVIVAL) { enemiesRef.current.forEach(e => drawEntity(ctx, e)); }
    ctx.restore();
  };

  const loop = (time: number) => {
    if (lastTimeRef.current === 0) lastTimeRef.current = time;
    const dt = time - lastTimeRef.current; lastTimeRef.current = time;
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) { update(Math.min(dt, 32)); draw(ctx); }
    frameIdRef.current = requestAnimationFrame(loop);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => keysRef.current.add(e.key.toLowerCase());
    const handleKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());
    const handleMouseMove = (e: MouseEvent) => { mouseRef.current = { x: e.clientX, y: e.clientY }; };
    const handleMouseDown = () => handleShoot();
    window.addEventListener('keydown', handleKeyDown); window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mousedown', handleMouseDown);
    frameIdRef.current = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mousedown', handleMouseDown);
      cancelAnimationFrame(frameIdRef.current);
    };
  }, [gameState]);

  const startSurvival = async () => { await initAudio(); setGameMode(GameMode.SURVIVAL); setGameState(GameState.PLAYING); resetGame(GameMode.SURVIVAL); };
  const startTraining = async () => { await initAudio(); setGameMode(GameMode.TRAINING); setGameState(GameState.PLAYING); resetGame(GameMode.TRAINING); };
  
  const endGame = () => {
    const finalScore = scoreRef.current, finalKills = enemiesKilledRef.current, finalTime = Math.floor((Date.now() - startTimeRef.current) / 1000);
    const dateStr = new Date().toLocaleDateString();
    const savedHighScore = parseInt(localStorage.getItem('neon-strike-highscore') || '0', 10);
    if (finalScore > savedHighScore) { setHighScore(finalScore); localStorage.setItem('neon-strike-highscore', finalScore.toString()); }
    if (gameMode === GameMode.SURVIVAL) {
      const savedHistoryStr = localStorage.getItem('neon-strike-history'); let currentHistory: GameRecord[] = [];
      try { currentHistory = savedHistoryStr ? JSON.parse(savedHistoryStr) : []; } catch(e) {}
      const updatedHistory = [{ score: finalScore, kills: finalKills, time: finalTime, date: dateStr }, ...currentHistory].slice(0, 5);
      setGameHistory(updatedHistory); localStorage.setItem('neon-strike-history', JSON.stringify(updatedHistory));
    }
    setGameState(GameState.GAMEOVER);
  };

  const applyUpgrade = (upgrade: UpgradeOption) => { upgrade.action(); setGameState(GameState.PLAYING); createExplosion(playerRef.current.pos, '#ffffff', 40, 2); screenShakeRef.current = 20; playSound('pickup'); };

  return (
    <div className="relative w-full h-screen bg-[#060606] overflow-hidden text-white select-none font-sans">
      <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="absolute inset-0 cursor-crosshair" />
      {gameState === GameState.PLAYING && gameMode === GameMode.SURVIVAL && (
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gray-900/50 z-20 overflow-hidden"><div className="h-full bg-[#00f2ff] shadow-[0_0_20px_#00f2ff] transition-all duration-500 ease-out" style={{ width: `${expProgress * 100}%` }} /></div>
      )}
      {gameState === GameState.PLAYING && (gameMode === GameMode.TRAINING || gameMode === GameMode.NEONLINK) && (
        <div className="absolute top-10 left-1/2 -translate-x-1/2 w-full max-w-4xl px-12 flex justify-between items-center z-50 pointer-events-none">
            <div className="flex flex-col items-start gap-1">
                <div className="text-[10px] font-bold text-[#00f2ff] tracking-[0.2em] uppercase">本机单元</div>
                <div className="w-72 h-3 bg-gray-900/80 rounded-full border border-white/10 overflow-hidden backdrop-blur-md"><div className="h-full bg-[#00f2ff] shadow-[0_0_15px_#00f2ff] transition-all duration-300" style={{ width: `${(playerRef.current.health / playerRef.current.maxHealth) * 100}%` }} /></div>
            </div>
            <Swords className="text-white/20 animate-pulse" size={32} />
            <div className="flex flex-col items-end gap-1">
                <div className="text-[10px] font-bold text-[#bd00ff] tracking-[0.2em] uppercase">{gameMode === GameMode.TRAINING ? '模拟协议' : '远程操纵者'}</div>
                <div className="w-72 h-3 bg-gray-900/80 rounded-full border border-white/10 overflow-hidden backdrop-blur-md"><div className="h-full bg-[#bd00ff] shadow-[0_0_15px_#bd00ff] transition-all duration-300" style={{ width: `${(opponentRef.current.health / opponentRef.current.maxHealth) * 100}%` }} /></div>
            </div>
        </div>
      )}
      {gameState === GameState.START && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-lg z-50 p-4 gap-8">
          <div className="space-y-2 text-center"><h1 className="text-6xl md:text-8xl font-black tracking-tighter italic text-white uppercase leading-none">Neon<span className="text-[#ff0055]">Strike</span></h1><p className="text-[10px] uppercase tracking-[0.5em] text-[#00f2ff]/60 font-bold">Neural Protocol v2.5</p></div>
          <div className="max-w-7xl w-full grid grid-cols-1 md:grid-cols-3 gap-6">
            <div onClick={startSurvival} className="group relative overflow-hidden bg-white/5 border border-white/10 rounded-[2.5rem] p-10 cursor-pointer hover:border-[#00f2ff] hover:bg-[#00f2ff]/5 transition-all duration-300 transform hover:-translate-y-2 flex flex-col items-center text-center shadow-[0_0_40px_rgba(0,0,0,0.5)]">
              <div className="p-5 bg-[#00f2ff]/10 rounded-2xl group-hover:scale-110 transition-transform mb-6"><User className="text-[#00f2ff]" size={40} /></div>
              <div className="space-y-4 flex-1"><h3 className="text-3xl font-black uppercase italic tracking-tight">单人生存</h3><p className="text-white/40 text-xs font-medium leading-relaxed">单机对垒进化病毒。<br/>收集经验核心，无限进化机体。你能撑多久？</p><div className="pt-4 mt-auto"><div className="text-[10px] uppercase text-yellow-500/50 font-bold mb-1">本机最高载荷</div><div className="text-2xl font-mono text-yellow-500 font-bold">{highScore.toLocaleString()}</div></div></div>
              <button className="mt-8 w-full py-4 bg-[#00f2ff] text-black font-black italic rounded-xl group-hover:brightness-125 transition-all uppercase">接入生存链路</button>
            </div>
            
            <div className="group relative overflow-hidden bg-white/5 border border-white/10 rounded-[2.5rem] p-10 cursor-pointer hover:border-[#f59e0b] hover:bg-[#f59e0b]/5 transition-all duration-300 transform hover:-translate-y-2 flex flex-col items-center text-center shadow-[0_0_40px_rgba(0,0,0,0.5)]">
              <div onClick={() => setShowTrainingInfo(true)} className="absolute top-6 right-6 p-2 text-white/20 hover:text-[#f59e0b] hover:bg-white/5 rounded-xl transition-all z-10"><Info size={20} /></div>
              <div onClick={startTraining} className="flex flex-col items-center w-full h-full">
                <div className="p-5 bg-[#f59e0b]/10 rounded-2xl group-hover:scale-110 transition-transform mb-6"><GraduationCap className="text-[#f59e0b]" size={40} /></div>
                <div className="space-y-4 flex-1 flex flex-col items-center"><h3 className="text-3xl font-black uppercase italic tracking-tight text-white group-hover:text-[#f59e0b]">训练模式</h3><p className="text-white/40 text-xs font-medium leading-relaxed">琥珀迷宫战术演习。<br/>在视野遮蔽的动态迷宫中，对抗高精度 AI 模拟协议。</p></div>
                <button onClick={(e) => { e.stopPropagation(); startTraining(); }} className="mt-8 w-full py-4 bg-[#f59e0b] text-black font-black italic rounded-xl group-hover:brightness-125 transition-all uppercase">启动战术演练</button>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-10 flex flex-col items-center text-center group hover:border-[#ff0055]/50 transition-all shadow-[0_0_40px_rgba(0,0,0,0.5)]">
              <div className="p-5 bg-[#ff0055]/10 rounded-2xl group-hover:scale-110 transition-transform mb-6"><Globe className="text-[#ff0055]" size={40} /></div>
              <div className="space-y-4 flex-1 w-full"><h3 className="text-3xl font-black uppercase italic tracking-tight">多人对战</h3><p className="text-white/40 text-xs font-medium leading-relaxed">P2P 实时琥珀迷宫对决。<br/>通过对等网络直接连接，在同步迷宫中与另一位操纵者进行博弈。</p>
                <div className="w-full space-y-4 pt-4"><div className="flex flex-col gap-2"><div className="flex items-center justify-between bg-black/50 px-4 py-3 rounded-xl border border-white/5"><div className="text-left overflow-hidden"><div className="text-[8px] uppercase text-white/30 font-bold tracking-widest mb-1">Local ID</div><div className="font-mono text-sm text-[#ff0055] font-bold truncate">{peerId || '...'}</div></div><button onClick={copyId} className="p-2 hover:bg-white/10 rounded-lg text-white/40 transition-colors">{copyFeedback ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}</button></div>
                    <div className="flex gap-2"><input type="text" placeholder="目标操纵者 ID..." value={targetId} onChange={(e) => setTargetId(e.target.value)} className="flex-1 bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono focus:border-[#ff0055] outline-none transition-colors" /><button onClick={connectToPeer} disabled={connStatus === 'connecting' || !targetId} className="bg-white text-black font-black px-6 rounded-xl text-sm hover:bg-[#ff0055] hover:text-white transition-all disabled:opacity-50"><LinkIcon size={18} /></button></div>
                </div></div></div>
              <button disabled={!targetId} onClick={connectToPeer} className="mt-8 w-full py-4 bg-[#ff0055] text-white font-black italic rounded-xl group-hover:brightness-125 transition-all uppercase disabled:opacity-50">建立多人对战</button>
            </div>
          </div>
          <div className="text-[9px] font-bold text-white/20 flex justify-center gap-6 uppercase tracking-widest mt-4"><span>WASD: 移动</span><span>Mouse-1: 发射高能脉冲</span></div>

          {showTrainingInfo && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-3xl z-[100] animate-in fade-in zoom-in duration-300 p-6 overflow-y-auto">
              <div className="max-w-3xl w-full bg-[#121212] border border-[#f59e0b]/30 rounded-[3rem] p-10 md:p-14 shadow-[0_0_100px_rgba(245,158,11,0.1)] relative my-auto">
                <button onClick={() => setShowTrainingInfo(false)} className="absolute top-8 right-8 p-3 text-white/20 hover:text-white hover:bg-white/5 rounded-2xl transition-all"><X size={24} /></button>
                <div className="flex flex-col gap-10">
                  <div className="flex flex-col items-center gap-4 text-center">
                    <div className="p-6 bg-[#f59e0b]/10 rounded-3xl mb-2"><GraduationCap size={48} className="text-[#f59e0b]" /></div>
                    <h2 className="text-4xl font-black italic uppercase tracking-tighter text-white">训练协议: 琥珀格栅</h2>
                    <div className="w-16 h-1 bg-[#f59e0b] rounded-full"></div>
                    <p className="text-white/60 text-sm leading-relaxed font-medium max-w-lg">该协议通过模拟复杂的随机回溯迷宫，测试操纵者在极端遮蔽环境下的空间博弈与因子调度能力。在这里，视野即生命，位置即优势。</p>
                  </div>

                  <div className="space-y-6">
                    <div className="text-[#f59e0b] text-[10px] font-black uppercase tracking-[0.3em] flex items-center gap-4">
                      <div className="flex-1 h-px bg-[#f59e0b]/20"></div>
                      增强因子核心档案
                      <div className="flex-1 h-px bg-[#f59e0b]/20"></div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex gap-5 bg-white/5 p-5 rounded-3xl border border-white/5 hover:border-[#f59e0b]/30 transition-colors group">
                        <div className="p-3 bg-[#f59e0b]/10 rounded-2xl h-fit group-hover:scale-110 transition-transform"><Zap size={24} className="text-[#f59e0b]" /></div>
                        <div>
                          <div className="text-sm font-black uppercase italic mb-1">超频模块 (Overclock)</div>
                          <p className="text-[11px] text-white/40 leading-relaxed">强制移除机体射击限制，射击间隔降低 60%，且子弹初速大幅提升。持续 6 秒。在遭遇战中可瞬间形成火力压制。</p>
                        </div>
                      </div>

                      <div className="flex gap-5 bg-white/5 p-5 rounded-3xl border border-white/5 hover:border-[#22c55e]/30 transition-colors group">
                        <div className="p-3 bg-[#22c55e]/10 rounded-2xl h-fit group-hover:scale-110 transition-transform"><Shield size={24} className="text-[#22c55e]" /></div>
                        <div>
                          <div className="text-sm font-black uppercase italic mb-1">核心护盾 (Kinetic Shield)</div>
                          <p className="text-[11px] text-white/40 leading-relaxed">在机体外围部署一次性动能护盾，可 100% 抵消下一次受到的任意伤害。护盾激活期间机体将伴随绿色六边形视觉标识。</p>
                        </div>
                      </div>

                      <div className="flex gap-5 bg-white/5 p-5 rounded-3xl border border-white/5 hover:border-[#00f2ff]/30 transition-colors group">
                        <div className="p-3 bg-[#00f2ff]/10 rounded-2xl h-fit group-hover:scale-110 transition-transform"><Eye size={24} className="text-[#00f2ff]" /></div>
                        <div>
                          <div className="text-sm font-black uppercase italic mb-1">扫描阵列 (Sensor Array)</div>
                          <p className="text-[11px] text-white/40 leading-relaxed">突破模拟环境的迷宫迷雾。拾取瞬间向全场发射广域脉冲，彻底揭示所有单位位置。在随后的 11 秒内维持极大范围的强化视野。</p>
                        </div>
                      </div>

                      <div className="flex gap-5 bg-white/5 p-5 rounded-3xl border border-white/5 hover:border-[#bd00ff]/30 transition-colors group">
                        <div className="p-3 bg-[#bd00ff]/10 rounded-2xl h-fit group-hover:scale-110 transition-transform"><Layers size={24} className="text-[#bd00ff]" /></div>
                        <div>
                          <div className="text-sm font-black uppercase italic mb-1">矢量核心 (Vector Core)</div>
                          <p className="text-[11px] text-white/40 leading-relaxed">注入 5 发实验性矢量弹。这种子弹在碰撞墙壁时不仅不会消失，反而会获得额外 2 次反弹机会，且反弹后的伤害完全不衰减。极适合在走廊地形作战。</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-6">
                    <div className="bg-[#f59e0b]/5 border border-[#f59e0b]/10 p-6 rounded-3xl">
                      <div className="flex items-center gap-3 mb-3">
                         <Info size={16} className="text-[#f59e0b]" />
                         <span className="text-xs font-black uppercase tracking-widest">操纵者建议</span>
                      </div>
                      <p className="text-[11px] text-white/50 leading-relaxed italic">由于训练模式中移速较低且单发伤害较弱，请务必利用迷宫拐角进行 Peeking（闪身射击）。不要在没有视野的情况下鲁莽推进，合理利用扫描阵列锁定 AI 位置是获胜的关键。</p>
                    </div>
                    <button onClick={() => { setShowTrainingInfo(false); startTraining(); }} className="w-full py-5 bg-[#f59e0b] text-black font-black italic rounded-2xl hover:brightness-125 transition-all uppercase tracking-[0.2em] text-sm shadow-[0_0_20px_rgba(245,158,11,0.3)]">初始化训练协议</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {gameState === GameState.LEVEL_UP && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-2xl z-[60]"><div className="max-w-4xl w-full p-8 text-center space-y-12"><div className="space-y-3"><h2 className="text-6xl font-black italic tracking-tighter uppercase text-[#00f2ff] drop-shadow-[0_0_20px_rgba(0,242,255,0.5)]">检测到进化序列</h2><p className="text-white/30 uppercase tracking-[0.4em] text-[10px] font-bold">机体性能阈值突破，请选择同步模块</p></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">{upgradeOptions.map((opt) => (<button key={opt.id} onClick={() => applyUpgrade(opt)} className="group relative bg-white/5 border border-white/10 p-10 rounded-[2.5rem] hover:border-[#00f2ff]/50 hover:bg-[#00f2ff]/10 transition-all flex flex-col items-center gap-6 transform hover:-translate-y-3"><div className="p-5 bg-white/5 rounded-3xl group-hover:scale-125 group-hover:bg-[#00f2ff]/20 transition-all duration-300">{opt.icon}</div><div className="space-y-2"><div className="font-black uppercase tracking-wider text-xl">{opt.title}</div><div className="text-xs text-white/40 font-medium leading-relaxed">{opt.description}</div></div><div className="mt-4 py-2 px-6 rounded-full border border-white/10 text-[9px] uppercase font-black text-white/30 group-hover:text-[#00f2ff] group-hover:border-[#00f2ff]/30 transition-all">载入模块</div></button>))}</div>
          </div></div>
      )}
      {gameState === GameState.GAMEOVER && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#060606]/95 backdrop-blur-xl z-50 p-6 overflow-y-auto"><div className="max-w-5xl w-full flex flex-col md:flex-row gap-10 items-center"><div className="flex-1 w-full bg-black/40 border border-[#ff0055]/30 p-10 md:p-14 rounded-[3.5rem] shadow-[0_0_120px_rgba(255,0,85,0.15)] relative overflow-hidden"><div className="absolute top-0 right-0 w-32 h-32 bg-[#ff0055]/5 blur-3xl"></div><div className="flex justify-between items-start mb-12"><div className="space-y-1"><h2 className="text-5xl font-black text-[#ff0055] tracking-tighter uppercase italic leading-none">{gameMode === GameMode.TRAINING ? 'Simulation\nComplete' : (playerRef.current.health > 0 ? 'Protocol\nVictory' : 'Combat\nOver')}</h2><p className="text-[10px] font-bold text-white/20 uppercase tracking-widest mt-2">{gameMode === GameMode.TRAINING ? '模拟作战流程已结束' : '神经链路同步已中断'}</p></div>
                {gameMode === GameMode.SURVIVAL && (<div className="text-right"><div className="text-[10px] uppercase text-yellow-500/60 font-bold tracking-widest mb-1">峰值载荷记录</div><div className="text-3xl font-mono text-yellow-500 font-bold leading-none">{highScore.toLocaleString()}</div></div>)}
              </div>
              <div className="grid grid-cols-2 gap-6 mb-12"><div className="bg-white/5 p-8 rounded-3xl border border-white/5 text-center group hover:border-[#00f2ff]/20 transition-colors"><div className="text-[10px] uppercase text-white/30 mb-2 font-black tracking-widest">最终状态</div><div className="text-5xl font-bold text-[#00f2ff] font-mono leading-none group-hover:scale-105 transition-transform">{gameMode !== GameMode.SURVIVAL ? (playerRef.current.health > 0 ? 'WIN' : 'FAIL') : score.toLocaleString()}</div></div>
                <div className="bg-white/5 p-8 rounded-3xl border border-white/5 text-center group hover:border-yellow-500/20 transition-colors"><div className="text-[10px] uppercase text-white/30 mb-2 font-black tracking-widest">同步等级</div><div className="text-5xl font-bold text-yellow-500 font-mono leading-none group-hover:scale-105 transition-transform">LV.{level}</div></div>
              </div>
              <button onClick={() => setGameState(GameState.START)} className="w-full bg-white hover:bg-[#00f2ff] hover:text-white text-black font-black py-6 rounded-2xl flex items-center justify-center gap-4 transition-all transform active:scale-95 shadow-xl uppercase text-lg group"><RotateCcw size={24} className="group-hover:rotate-180 transition-transform duration-500" /> 返回主终端</button>
            </div>
            {gameMode === GameMode.SURVIVAL && (<div className="w-full md:w-96 bg-black/40 border border-white/5 p-10 rounded-[3rem] backdrop-blur-2xl"><div className="flex items-center justify-between mb-8 text-white/60 font-black uppercase tracking-[0.2em] text-xs border-b border-white/5 pb-6"><div className="flex items-center gap-3"><History size={18} className="text-[#00f2ff]" /> 历史记录</div><button onClick={clearHistory} className="p-2 hover:bg-white/10 rounded-xl text-white/20 hover:text-red-500 transition-colors"><Trash2 size={16} /></button></div>
                <div className="space-y-5">{gameHistory.length > 0 ? gameHistory.map((record, i) => (<div key={i} className="group p-5 bg-white/5 rounded-2xl border border-white/5 hover:border-[#00f2ff]/30 transition-all transform hover:scale-[1.02]"><div className="flex justify-between items-start mb-3"><span className="text-xl font-mono font-bold text-[#00f2ff] leading-none">{record.score.toLocaleString()}</span><span className="text-[9px] text-white/20 font-bold uppercase">{record.date}</span></div><div className="flex gap-5 text-[10px] font-bold text-white/40 uppercase tracking-wider"><span className="flex items-center gap-2"><Target size={12} className="text-[#ff0055]" /> {record.kills}</span><span className="flex items-center gap-2"><Clock size={12} className="text-yellow-500" /> {record.time}S</span></div></div>)) : (<div className="text-center py-16 text-white/10 italic text-sm font-bold uppercase tracking-widest underline decoration-[#ff0055]/30 underline-offset-8">暂无数据</div>)}</div>
              </div>)}
          </div></div>
      )}
    </div>
  );
};

export default App;
