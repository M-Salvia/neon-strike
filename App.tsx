
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GameState, Vector2, Player, Bullet, Enemy, EnemyType, Particle, ExperienceOrb, HealthPack } from './types';
import { Target, Zap, Shield, Play, RotateCcw, Trophy, History, Clock, Trash2, ArrowUpCircle, Flame, Heart, Wind, PlusCircle } from 'lucide-react';

const CANVAS_WIDTH = window.innerWidth;
const CANVAS_HEIGHT = window.innerHeight;
const BULLET_SPEED = 14;
const INITIAL_PLAYER_FIRE_RATE = 140; 
const INITIAL_PLAYER_SPEED = 6; 
const INITIAL_SPAWN_INTERVAL = 1800; 
const MIN_SPAWN_INTERVAL = 500; 
const INITIAL_MAX_HEALTH = 200; // 再次提升初始生命值，从150提升至200
const HEALTH_PACK_DROP_CHANCE = 0.06; // 稍微提升掉落率至6%

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
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [gameHistory, setGameHistory] = useState<GameRecord[]>([]);
  const [level, setLevel] = useState(1);
  const [expProgress, setExpProgress] = useState(0);
  const [upgradeOptions, setUpgradeOptions] = useState<UpgradeOption[]>([]);

  const scoreRef = useRef<number>(0);
  
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
    moveSpeed: INITIAL_PLAYER_SPEED
  });

  const bulletsRef = useRef<Bullet[]>([]);
  const enemyBulletsRef = useRef<Bullet[]>([]);
  const enemiesRef = useRef<Enemy[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const experienceOrbsRef = useRef<ExperienceOrb[]>([]);
  const healthPacksRef = useRef<HealthPack[]>([]);
  const keysRef = useRef<Set<string>>(new Set());
  const mouseRef = useRef<Vector2>({ x: 0, y: 0 });
  
  const lastTimeRef = useRef<number>(0);
  const spawnTimerRef = useRef<number>(INITIAL_SPAWN_INTERVAL - 500);
  const startTimeRef = useRef<number>(0);
  const enemiesKilledRef = useRef<number>(0);
  const screenShakeRef = useRef<number>(0);
  const frameIdRef = useRef<number>(0);

  // 音效合成系统
  const initAudio = async () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') {
      await audioCtxRef.current.resume();
    }
  };

  const playSound = (type: 'shoot' | 'hit' | 'death' | 'playerHit' | 'pickup' | 'levelup') => {
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
        osc.start(now);
        osc.stop(now + 0.1);
        break;
      case 'hit':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, now);
        gain.gain.setValueAtTime(0.015, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
        break;
      case 'death':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.linearRampToValueAtTime(50, now + 0.2);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
        break;
      case 'playerHit':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.linearRampToValueAtTime(40, now + 0.3);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
        break;
      case 'pickup':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
        break;
      case 'levelup':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); 
        osc.frequency.setValueAtTime(659.25, now + 0.1); 
        osc.frequency.setValueAtTime(783.99, now + 0.2); 
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
        break;
    }
  };

  useEffect(() => {
    const savedHighScore = localStorage.getItem('neon-strike-highscore');
    if (savedHighScore) setHighScore(parseInt(savedHighScore, 10));

    const savedHistory = localStorage.getItem('neon-strike-history');
    if (savedHistory) {
      try {
        setGameHistory(JSON.parse(savedHistory));
      } catch (e) {
        setGameHistory([]);
      }
    }
  }, []);

  const resetGame = useCallback(() => {
    initAudio();
    playerRef.current = {
      ...playerRef.current,
      pos: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 },
      health: INITIAL_MAX_HEALTH,
      maxHealth: INITIAL_MAX_HEALTH,
      score: 0,
      level: 1,
      exp: 0,
      expToNextLevel: 100,
      fireRate: INITIAL_PLAYER_FIRE_RATE,
      damage: 35,
      moveSpeed: INITIAL_PLAYER_SPEED
    };
    bulletsRef.current = [];
    enemyBulletsRef.current = [];
    enemiesRef.current = [];
    particlesRef.current = [];
    experienceOrbsRef.current = [];
    healthPacksRef.current = [];
    scoreRef.current = 0;
    setScore(0);
    setLevel(1);
    setExpProgress(0);
    setElapsedTime(0);
    enemiesKilledRef.current = 0;
    startTimeRef.current = Date.now();
    spawnTimerRef.current = INITIAL_SPAWN_INTERVAL - 200;
    screenShakeRef.current = 0;
  }, []);

  const clearHistory = () => {
    if (confirm('确定要清除所有战绩历史吗？')) {
      localStorage.removeItem('neon-strike-history');
      setGameHistory([]);
    }
  };

  const createExplosion = (pos: Vector2, color: string, count = 15, speedMult = 1) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const force = Math.random() * 8 * speedMult + 2;
      const typeRand = Math.random();
      const type = typeRand > 0.7 ? 'rect' : (typeRand > 0.4 ? 'line' : 'circle');
      particlesRef.current.push({
        id: Math.random().toString(),
        pos: { ...pos },
        velocity: { 
          x: Math.cos(angle) * force, 
          y: Math.sin(angle) * force 
        },
        life: 1, 
        maxLife: Math.random() * 0.8 + 0.4, 
        color,
        type
      });
    }
  };

  const spawnExperience = (pos: Vector2, value: number) => {
    experienceOrbsRef.current.push({
      id: Math.random().toString(),
      pos: { ...pos },
      value,
      color: '#00f2ff',
      radius: 4 + Math.sqrt(value) * 0.5
    });
  };

  const spawnHealthPack = (pos: Vector2) => {
    healthPacksRef.current.push({
      id: Math.random().toString(),
      pos: { ...pos },
      value: 30, // 提升血包回复值
      color: '#22c55e',
      radius: 12
    });
  };

  const spawnEnemy = useCallback(() => {
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
      // 强化泰坦：生命值大幅增加，射击间隔缩短
      config = { 
        health: 350 * difficultyLevel, 
        color: '#bd00ff', 
        radius: 35, 
        score: 800, 
        fireRate: 3400 / Math.sqrt(difficultyLevel) 
      };
    } else if (rand > hunterThreshold) { 
      type = 'hunter';
      // 削弱猎手：生命值降低，射击间隔略长
      config = { 
        health: 55 * difficultyLevel, 
        color: '#ffcc00', 
        radius: 18, 
        score: 300, 
        fireRate: 3000 / Math.sqrt(difficultyLevel) 
      };
    } else {
      // 削弱先锋：生命值从25降至18
      config = { 
        health: 18 * difficultyLevel, 
        color: '#ff0055', 
        radius: 12, 
        score: 100, 
        fireRate: 0 
      };
    }

    enemiesRef.current.push({
      id: Math.random().toString(), pos: { x, y }, velocity: { x: 0, y: 0 },
      radius: config.radius, health: config.health, color: config.color,
      scoreValue: config.score, type, fireRate: config.fireRate, lastShot: now + Math.random() * 1000,
      lastHitTime: 0
    });
  }, []);

  const handleShoot = () => {
    if (gameState !== GameState.PLAYING) return;
    const now = Date.now();
    if (now - playerRef.current.lastShot < playerRef.current.fireRate) return;
    
    const angle = Math.atan2(mouseRef.current.y - playerRef.current.pos.y, mouseRef.current.x - playerRef.current.pos.x);
    bulletsRef.current.push({
      id: Math.random().toString(), 
      pos: { ...playerRef.current.pos },
      velocity: { x: Math.cos(angle) * BULLET_SPEED, y: Math.sin(angle) * BULLET_SPEED },
      radius: 4, health: 1, color: '#00f2ff', damage: playerRef.current.damage, ownerId: 'player'
    });
    playerRef.current.lastShot = now;
    playSound('shoot');
  };

  const triggerLevelUp = () => {
    playSound('levelup');
    const options: UpgradeOption[] = [
      {
        id: 'fire_rate',
        title: '超频模块',
        description: '射击间隔降低 15%',
        icon: <Zap className="text-yellow-400" />,
        action: () => { playerRef.current.fireRate *= 0.85; }
      },
      {
        id: 'damage',
        title: '高能核心',
        description: '子弹伤害提升 25%',
        icon: <Flame className="text-orange-500" />,
        action: () => { playerRef.current.damage *= 1.25; }
      },
      {
        id: 'health',
        title: '结构加固',
        description: '最大生命值 +60，并回复 100 点', 
        icon: <Heart className="text-red-500" />,
        action: () => { 
          playerRef.current.maxHealth += 60; 
          playerRef.current.health = Math.min(playerRef.current.maxHealth, playerRef.current.health + 100);
        }
      },
      {
        id: 'speed',
        title: '脉冲引擎',
        description: '移动速度提升 12%',
        icon: <Wind className="text-blue-400" />,
        action: () => { playerRef.current.moveSpeed *= 1.12; }
      }
    ];

    const shuffled = [...options].sort(() => 0.5 - Math.random()).slice(0, 3);
    setUpgradeOptions(shuffled);
    setGameState(GameState.LEVEL_UP);
  };

  const update = (dt: number) => {
    if (gameState !== GameState.PLAYING) return;
    
    const now = Date.now();
    const gameDuration = (now - startTimeRef.current) / 1000;
    setElapsedTime(Math.floor(gameDuration));
    
    const currentSpawnInterval = Math.max(MIN_SPAWN_INTERVAL, INITIAL_SPAWN_INTERVAL - (gameDuration * 8));

    if (screenShakeRef.current > 0) screenShakeRef.current *= 0.9;

    let vx = 0, vy = 0;
    if (keysRef.current.has('w')) vy -= 1;
    if (keysRef.current.has('s')) vy += 1;
    if (keysRef.current.has('a')) vx -= 1;
    if (keysRef.current.has('d')) vx += 1;

    if (vx !== 0 || vy !== 0) {
      const length = Math.sqrt(vx * vx + vy * vy);
      playerRef.current.pos.x += (vx / length) * playerRef.current.moveSpeed;
      playerRef.current.pos.y += (vy / length) * playerRef.current.moveSpeed;
    }
    playerRef.current.pos.x = Math.max(15, Math.min(CANVAS_WIDTH - 15, playerRef.current.pos.x));
    playerRef.current.pos.y = Math.max(15, Math.min(CANVAS_HEIGHT - 15, playerRef.current.pos.y));

    for (let i = experienceOrbsRef.current.length - 1; i >= 0; i--) {
      const orb = experienceOrbsRef.current[i];
      const dx = playerRef.current.pos.x - orb.pos.x;
      const dy = playerRef.current.pos.y - orb.pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 200) {
        const speed = 8.5;
        orb.pos.x += (dx / dist) * speed;
        orb.pos.y += (dy / dist) * speed;
      }

      if (dist < playerRef.current.radius + orb.radius) {
        playSound('pickup');
        playerRef.current.exp += orb.value;
        createExplosion(orb.pos, orb.color, 5, 0.4);
        experienceOrbsRef.current.splice(i, 1);
        
        if (playerRef.current.exp >= playerRef.current.expToNextLevel) {
          playerRef.current.exp -= playerRef.current.expToNextLevel;
          playerRef.current.level += 1;
          playerRef.current.expToNextLevel = Math.floor(playerRef.current.expToNextLevel * 1.3);
          setLevel(playerRef.current.level);
          triggerLevelUp();
        }
        setExpProgress(playerRef.current.exp / playerRef.current.expToNextLevel);
      }
    }

    for (let i = healthPacksRef.current.length - 1; i >= 0; i--) {
      const pack = healthPacksRef.current[i];
      const dx = playerRef.current.pos.x - pack.pos.x;
      const dy = playerRef.current.pos.y - pack.pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 150) {
        const speed = 7.0;
        pack.pos.x += (dx / dist) * speed;
        pack.pos.y += (dy / dist) * speed;
      }

      if (dist < playerRef.current.radius + pack.radius) {
        playSound('pickup');
        playerRef.current.health = Math.min(playerRef.current.maxHealth, playerRef.current.health + pack.value);
        createExplosion(pack.pos, pack.color, 12, 0.6);
        healthPacksRef.current.splice(i, 1);
      }
    }

    for (let i = bulletsRef.current.length - 1; i >= 0; i--) {
      const b = bulletsRef.current[i];
      b.pos.x += b.velocity.x; b.pos.y += b.velocity.y;
      if (b.pos.x < -100 || b.pos.x > CANVAS_WIDTH + 100 || b.pos.y < -100 || b.pos.y > CANVAS_HEIGHT + 100) {
        bulletsRef.current.splice(i, 1);
      }
    }

    for (let i = enemyBulletsRef.current.length - 1; i >= 0; i--) {
      const b = enemyBulletsRef.current[i];
      if (b.isHoming && b.lifeSpan && b.lifeSpan > 0) {
        const dx = playerRef.current.pos.x - b.pos.x;
        const dy = playerRef.current.pos.y - b.pos.y;
        const targetAngle = Math.atan2(dy, dx);
        const currentAngle = Math.atan2(b.velocity.y, b.velocity.x);
        let newAngle = currentAngle + (targetAngle - currentAngle) * 0.04; 
        const speed = Math.sqrt(b.velocity.x**2 + b.velocity.y**2);
        b.velocity.x = Math.cos(newAngle) * speed;
        b.velocity.y = Math.sin(newAngle) * speed;
        b.lifeSpan -= dt;
      }
      b.pos.x += b.velocity.x; b.pos.y += b.velocity.y;
      
      const dist = Math.sqrt((playerRef.current.pos.x - b.pos.x)**2 + (playerRef.current.pos.y - b.pos.y)**2);
      if (dist < playerRef.current.radius + b.radius) {
        playSound('playerHit');
        playerRef.current.health -= b.damage;
        screenShakeRef.current = 10;
        enemyBulletsRef.current.splice(i, 1);
        if (playerRef.current.health <= 0) endGame();
        continue;
      }
      if (b.pos.x < -100 || b.pos.x > CANVAS_WIDTH + 100 || b.pos.y < -100 || b.pos.y > CANVAS_HEIGHT + 100) {
        enemyBulletsRef.current.splice(i, 1);
      }
    }

    for (let i = enemiesRef.current.length - 1; i >= 0; i--) {
      const e = enemiesRef.current[i];
      const dx = playerRef.current.pos.x - e.pos.x;
      const dy = playerRef.current.pos.y - e.pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const moveSpeed = e.type === 'vanguard' ? 2.0 : (e.type === 'titan' ? 0.6 : 1.4);

      if (e.type === 'vanguard') e.velocity = { x: (dx / dist) * moveSpeed, y: (dy / dist) * moveSpeed };
      else if (e.type === 'titan') {
        e.velocity = { x: (dx / dist) * moveSpeed, y: (dy / dist) * moveSpeed };
        if (now - e.lastShot > e.fireRate) {
          for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
            enemyBulletsRef.current.push({
              id: Math.random().toString(), pos: { ...e.pos }, velocity: { x: Math.cos(a) * 3.2, y: Math.sin(a) * 3.2 },
              radius: 6, health: 1, color: e.color, damage: 18, ownerId: e.id
            });
          }
          e.lastShot = now;
        }
      } else if (e.type === 'hunter') {
        const factor = dist > 400 ? 1.2 : -0.7; 
        e.velocity = { x: (dx / dist) * moveSpeed * factor, y: (dy / dist) * moveSpeed * factor };
        if (now - e.lastShot > e.fireRate) {
          enemyBulletsRef.current.push({
            id: Math.random().toString(), pos: { ...e.pos }, velocity: { x: (dx / dist) * 5.0, y: (dy / dist) * 5.0 },
            radius: 5, health: 1, color: e.color, damage: 12, ownerId: e.id, isHoming: true, homingStrength: 0.08, lifeSpan: 2200
          });
          e.lastShot = now;
        }
      }

      e.pos.x += e.velocity.x; e.pos.y += e.velocity.y;

      if (dist < playerRef.current.radius + e.radius) {
        playSound('playerHit');
        playerRef.current.health -= e.type === 'titan' ? 2.0 : 1.0;
        screenShakeRef.current = 8;
        if (playerRef.current.health <= 0) endGame();
      }

      for (let bi = bulletsRef.current.length - 1; bi >= 0; bi--) {
        const b = bulletsRef.current[bi];
        const bdx = e.pos.x - b.pos.x;
        const bdy = e.pos.y - b.pos.y;
        const bdist = Math.sqrt(bdx*bdx + bdy*bdy);
        
        if (bdist < e.radius + b.radius) {
          e.health -= b.damage;
          e.lastHitTime = now; 
          bulletsRef.current.splice(bi, 1);
          createExplosion(b.pos, '#ffffff', 3, 0.5);
          playSound('hit');

          if (e.health <= 0) {
            playSound('death');
            enemiesKilledRef.current++;
            const newScore = scoreRef.current + e.scoreValue;
            scoreRef.current = newScore;
            setScore(newScore);
            if (newScore > highScore) setHighScore(newScore);
            
            const expVal = e.type === 'titan' ? 80 : (e.type === 'hunter' ? 35 : 15);
            spawnExperience(e.pos, expVal);

            if (Math.random() < HEALTH_PACK_DROP_CHANCE) {
              spawnHealthPack(e.pos);
            }

            const shakeAmt = e.type === 'titan' ? 18 : 5;
            screenShakeRef.current = Math.max(screenShakeRef.current, shakeAmt);
            createExplosion(e.pos, e.color, e.type === 'titan' ? 50 : 20, e.type === 'titan' ? 1.8 : 0.9);
            enemiesRef.current.splice(i, 1);
            break; 
          }
        }
      }
    }

    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
      const p = particlesRef.current[i];
      p.pos.x += p.velocity.x; p.pos.y += p.velocity.y;
      p.velocity.x *= 0.96; p.velocity.y *= 0.96;
      p.life -= dt / 1000;
      if (p.life <= 0) particlesRef.current.splice(i, 1);
    }

    spawnTimerRef.current += dt;
    if (spawnTimerRef.current > currentSpawnInterval) {
      spawnEnemy(); 
      spawnTimerRef.current = 0;
    }
  };

  const drawEntity = (ctx: CanvasRenderingContext2D, e: Enemy) => {
    ctx.save();
    ctx.translate(e.pos.x, e.pos.y);
    
    const now = Date.now();
    const isFlashing = e.lastHitTime && now - e.lastHitTime < 50;
    
    ctx.strokeStyle = isFlashing ? '#ffffff' : e.color;
    ctx.shadowBlur = isFlashing ? 30 : 15;
    ctx.shadowColor = isFlashing ? '#ffffff' : e.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    
    if (e.type === 'vanguard') {
      const angle = Math.atan2(e.velocity.y, e.velocity.x);
      ctx.rotate(angle);
      ctx.moveTo(e.radius, 0); ctx.lineTo(-e.radius, -e.radius/1.5); ctx.lineTo(-e.radius, e.radius/1.5);
    } else if (e.type === 'titan') {
      ctx.rotate(Date.now() * 0.0008);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const x = Math.cos(a) * e.radius; const y = Math.sin(a) * e.radius;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
    } else if (e.type === 'hunter') {
      ctx.rotate(Math.atan2(playerRef.current.pos.y - e.pos.y, playerRef.current.pos.x - e.pos.x));
      ctx.moveTo(0, -e.radius); ctx.lineTo(e.radius, 0); ctx.lineTo(0, e.radius); ctx.lineTo(-e.radius, 0);
    }
    
    ctx.closePath(); 
    ctx.stroke(); 
    
    if (isFlashing) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fill();
    }
    
    ctx.restore();
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    ctx.save();
    const sx = (Math.random() - 0.5) * screenShakeRef.current;
    const sy = (Math.random() - 0.5) * screenShakeRef.current;
    ctx.translate(sx, sy);

    ctx.fillStyle = '#060606'; 
    ctx.fillRect(-50, -50, CANVAS_WIDTH + 100, CANVAS_HEIGHT + 100);

    const parallaxX = (playerRef.current.pos.x / CANVAS_WIDTH) * 20;
    const parallaxY = (playerRef.current.pos.y / CANVAS_HEIGHT) * 20;
    
    ctx.strokeStyle = 'rgba(0, 242, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let i = -60; i < CANVAS_WIDTH + 60; i += 60) { 
        ctx.beginPath(); ctx.moveTo(i - parallaxX, 0); ctx.lineTo(i - parallaxX, CANVAS_HEIGHT); ctx.stroke(); 
    }
    for (let i = -60; i < CANVAS_HEIGHT + 60; i += 60) { 
        ctx.beginPath(); ctx.moveTo(0, i - parallaxY); ctx.lineTo(CANVAS_WIDTH, i - parallaxY); ctx.stroke(); 
    }

    if (![GameState.PLAYING, GameState.GAMEOVER, GameState.LEVEL_UP].includes(gameState)) {
      ctx.restore();
      return;
    }

    experienceOrbsRef.current.forEach(orb => {
      ctx.fillStyle = orb.color;
      ctx.shadowBlur = 15;
      ctx.shadowColor = orb.color;
      ctx.beginPath();
      ctx.arc(orb.pos.x, orb.pos.y, orb.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(orb.pos.x, orb.pos.y, orb.radius * 0.4, 0, Math.PI * 2);
      ctx.fill();
    });

    healthPacksRef.current.forEach(pack => {
      ctx.save();
      ctx.translate(pack.pos.x, pack.pos.y);
      ctx.rotate(Date.now() * 0.002);
      ctx.fillStyle = pack.color;
      ctx.shadowBlur = 20;
      ctx.shadowColor = pack.color;
      
      const r = pack.radius;
      const w = r * 0.4;
      ctx.fillRect(-r, -w, r * 2, w * 2);
      ctx.fillRect(-w, -r, w * 2, r * 2);
      
      ctx.fillStyle = 'white';
      ctx.shadowBlur = 0;
      ctx.fillRect(-r * 0.7, -w * 0.4, r * 1.4, w * 0.8);
      ctx.fillRect(-w * 0.4, -r * 0.7, w * 0.8, r * 1.4);
      ctx.restore();
    });

    particlesRef.current.forEach(p => {
      ctx.fillStyle = p.color; 
      ctx.globalAlpha = p.life;
      ctx.shadowBlur = 10 * p.life;
      ctx.shadowColor = p.color;
      
      if (p.type === 'rect') {
          ctx.fillRect(p.pos.x, p.pos.y, 4 * p.life, 4 * p.life);
      } else if (p.type === 'line') {
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(p.pos.x, p.pos.y);
          ctx.lineTo(p.pos.x - p.velocity.x * 2, p.pos.y - p.velocity.y * 2);
          ctx.stroke();
      } else {
          ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y, Math.max(0.5, 3 * p.life), 0, Math.PI*2); ctx.fill();
      }
    });
    ctx.globalAlpha = 1;

    const pl = playerRef.current;
    ctx.save();
    ctx.translate(pl.pos.x, pl.pos.y);
    const playerAngle = Math.atan2(mouseRef.current.y - pl.pos.y, mouseRef.current.x - pl.pos.x);
    ctx.rotate(playerAngle);
    
    ctx.strokeStyle = pl.color;
    ctx.shadowBlur = 25;
    ctx.shadowColor = pl.color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(18, 0); ctx.lineTo(-12, -12); ctx.lineTo(-12, 12);
    ctx.closePath();
    ctx.stroke();
    
    ctx.fillStyle = 'rgba(0, 242, 255, 0.2)';
    ctx.fill();
    ctx.restore();

    bulletsRef.current.forEach(b => {
      ctx.strokeStyle = b.color;
      ctx.lineWidth = b.radius * 1.5;
      ctx.lineCap = 'round';
      ctx.shadowBlur = 15;
      ctx.shadowColor = b.color;
      ctx.beginPath();
      ctx.moveTo(b.pos.x, b.pos.y);
      ctx.lineTo(b.pos.x - b.velocity.x * 1.5, b.pos.y - b.velocity.y * 1.5);
      ctx.stroke();
      
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y, b.radius * 0.7, 0, Math.PI*2); ctx.fill();
    });

    enemyBulletsRef.current.forEach(b => {
      ctx.fillStyle = b.color;
      ctx.shadowBlur = 12;
      ctx.shadowColor = b.color;
      ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y, b.isHoming ? b.radius * 1.5 : b.radius, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = 'white';
      ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y, b.radius * 0.4, 0, Math.PI*2); ctx.fill();
    });

    enemiesRef.current.forEach(e => drawEntity(ctx, e));
    
    ctx.restore();
  };

  const loop = (time: number) => {
    if (lastTimeRef.current === 0) lastTimeRef.current = time;
    const dt = time - lastTimeRef.current;
    lastTimeRef.current = time;

    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      update(Math.min(dt, 32));
      draw(ctx);
    }
    frameIdRef.current = requestAnimationFrame(loop);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => keysRef.current.add(e.key.toLowerCase());
    const handleKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());
    const handleMouseMove = (e: MouseEvent) => { mouseRef.current = { x: e.clientX, y: e.clientY }; };
    const handleMouseDown = () => handleShoot();

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);

    frameIdRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      cancelAnimationFrame(frameIdRef.current);
    };
  }, [gameState]);

  const startGame = async () => { 
    await initAudio(); 
    resetGame(); 
    setGameState(GameState.PLAYING); 
  };
  
  const endGame = () => {
    const finalScore = scoreRef.current;
    const finalKills = enemiesKilledRef.current;
    const finalTime = Math.floor((Date.now() - startTimeRef.current) / 1000);
    const dateStr = new Date().toLocaleDateString();

    const savedHighScore = parseInt(localStorage.getItem('neon-strike-highscore') || '0', 10);
    if (finalScore > savedHighScore) {
      setHighScore(finalScore);
      localStorage.setItem('neon-strike-highscore', finalScore.toString());
    }

    const newRecord: GameRecord = { score: finalScore, kills: finalKills, time: finalTime, date: dateStr };
    const savedHistoryStr = localStorage.getItem('neon-strike-history');
    let currentHistory: GameRecord[] = [];
    try {
      currentHistory = savedHistoryStr ? JSON.parse(savedHistoryStr) : [];
    } catch(e) {}
    
    const updatedHistory = [newRecord, ...currentHistory].slice(0, 5);
    setGameHistory(updatedHistory);
    localStorage.setItem('neon-strike-history', JSON.stringify(updatedHistory));

    setGameState(GameState.GAMEOVER);
  };

  const applyUpgrade = (upgrade: UpgradeOption) => {
    upgrade.action();
    setGameState(GameState.PLAYING);
    createExplosion(playerRef.current.pos, '#ffffff', 40, 2);
    screenShakeRef.current = 20;
    playSound('pickup');
  };

  const isLowHealth = playerRef.current.health < playerRef.current.maxHealth * 0.3;

  return (
    <div className="relative w-full h-screen bg-[#060606] overflow-hidden text-white select-none font-sans">
      <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="absolute inset-0 cursor-crosshair" />

      {gameState === GameState.PLAYING && (
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gray-900/50 z-20 overflow-hidden">
          <div 
            className="h-full bg-[#00f2ff] shadow-[0_0_20px_#00f2ff] transition-all duration-500 ease-out" 
            style={{ width: `${expProgress * 100}%` }}
          />
        </div>
      )}

      {gameState === GameState.PLAYING && (
        <div className="absolute top-0 left-0 w-full p-6 pointer-events-none flex justify-between items-start z-10 mt-2">
          <div className="space-y-3">
            <div className={`bg-black/60 backdrop-blur-xl border ${isLowHealth ? 'border-red-500/50 animate-pulse' : 'border-[#00f2ff]/30'} p-4 rounded-2xl flex items-center gap-4 transition-colors duration-500`}>
              <Shield className={`${isLowHealth ? 'text-red-500' : 'text-[#00f2ff]'} w-5 h-5`} />
              <div className="flex-1">
                <div className="flex justify-between items-end mb-1">
                   <div className={`text-[10px] uppercase tracking-[0.2em] ${isLowHealth ? 'text-red-400' : 'text-[#00f2ff]/60'} font-bold`}>机体完整性</div>
                   <div className="text-[10px] font-mono text-white/40">{Math.ceil(playerRef.current.health)}/{playerRef.current.maxHealth}</div>
                </div>
                <div className="w-40 h-2 bg-gray-800/50 rounded-full overflow-hidden">
                  <div className={`h-full ${isLowHealth ? 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.8)]' : 'bg-[#00f2ff] shadow-[0_0_15px_#00f2ff]'} transition-all duration-300`} style={{ width: `${(playerRef.current.health / playerRef.current.maxHealth) * 100}%` }} />
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="bg-black/40 backdrop-blur-md border border-[#ff0055]/20 p-4 rounded-2xl flex items-center gap-4">
                <Target className="text-[#ff0055] w-5 h-5" />
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[#ff0055]/60 font-bold">累计载荷</div>
                  <div className="text-xl font-mono font-bold text-[#ff0055] leading-none">{score.toLocaleString()}</div>
                </div>
              </div>
              <div className="bg-black/40 backdrop-blur-md border border-yellow-500/20 p-4 rounded-2xl flex items-center gap-4">
                <ArrowUpCircle className="text-yellow-500 w-5 h-5" />
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-yellow-500/60 font-bold">同步等级</div>
                  <div className="text-xl font-mono font-bold text-yellow-500 leading-none">LV.{level}</div>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-3 pointer-events-auto">
            <div className="bg-black/40 backdrop-blur-md border border-white/5 px-4 py-2 rounded-xl text-right">
              <div className="text-[9px] uppercase tracking-widest text-white/30">RUNTIME</div>
              <div className="text-sm font-mono text-white/70">{elapsedTime}s</div>
            </div>
          </div>
        </div>
      )}

      {gameState === GameState.START && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-lg z-50">
          <div className="max-w-md w-full p-12 border border-[#00f2ff]/20 bg-black/90 rounded-[3rem] text-center space-y-10 shadow-[0_0_100px_rgba(0,242,255,0.1)] relative overflow-hidden">
            <div className="absolute -top-24 -left-24 w-48 h-48 bg-[#00f2ff]/10 blur-[80px]"></div>
            <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-[#ff0055]/10 blur-[80px]"></div>
            
            <div className="relative inline-block p-4 bg-[#00f2ff]/5 rounded-3xl border border-[#00f2ff]/20 animate-pulse">
               <Zap className="text-[#00f2ff] w-10 h-10" />
            </div>
            
            <div className="space-y-2">
                <h1 className="text-6xl font-black tracking-tighter italic text-white uppercase leading-none">
                    Neon<br/><span className="text-[#ff0055]">Strike</span>
                </h1>
                <p className="text-[10px] uppercase tracking-[0.5em] text-[#00f2ff]/60 font-bold">Cybernetic Protocol v2.0</p>
            </div>
            
            <div className="text-white/40 text-xs leading-relaxed font-medium px-4">
              收集 <span className="text-[#00f2ff]">经验核心</span> 进化机能。<br/>
              收集 <span className="text-[#22c55e]">紧急修复包</span> 恢复生命。
            </div>

            <button onClick={startGame} className="group relative w-full bg-white text-black font-black py-5 rounded-2xl flex items-center justify-center gap-3 transition-all transform active:scale-95 overflow-hidden uppercase">
              <div className="absolute inset-0 bg-[#00f2ff] translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
              <span className="relative z-10 flex items-center gap-3 group-hover:text-white transition-colors">
                <Play className="fill-current" size={20} /> 建立神经链接
              </span>
            </button>

            <div className="text-[9px] font-bold text-white/20 flex justify-center gap-6 uppercase tracking-widest">
                <span>Move: WASD</span>
                <span>Fire: Mouse-1</span>
            </div>
          </div>
        </div>
      )}

      {gameState === GameState.LEVEL_UP && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-2xl z-[60]">
          <div className="max-w-4xl w-full p-8 text-center space-y-12">
            <div className="space-y-3">
              <h2 className="text-6xl font-black italic tracking-tighter uppercase text-[#00f2ff] drop-shadow-[0_0_20px_rgba(0,242,255,0.5)]">
                Upgrade Detected
              </h2>
              <p className="text-white/30 uppercase tracking-[0.4em] text-[10px] font-bold">机体性能阈值突破，请选择同步模块</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {upgradeOptions.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => applyUpgrade(opt)}
                  className="group relative bg-white/5 border border-white/10 p-10 rounded-[2.5rem] hover:border-[#00f2ff]/50 hover:bg-[#00f2ff]/10 transition-all flex flex-col items-center gap-6 transform hover:-translate-y-3"
                >
                  <div className="p-5 bg-white/5 rounded-3xl group-hover:scale-125 group-hover:bg-[#00f2ff]/20 transition-all duration-300">
                    {opt.icon}
                  </div>
                  <div className="space-y-2">
                    <div className="font-black uppercase tracking-wider text-xl">{opt.title}</div>
                    <div className="text-xs text-white/40 font-medium leading-relaxed">{opt.description}</div>
                  </div>
                  <div className="mt-4 py-2 px-6 rounded-full border border-white/10 text-[9px] uppercase font-black text-white/30 group-hover:text-[#00f2ff] group-hover:border-[#00f2ff]/30 transition-all">
                    Load Module
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {gameState === GameState.GAMEOVER && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#060606]/95 backdrop-blur-xl z-50 p-6 overflow-y-auto">
          <div className="max-w-5xl w-full flex flex-col md:flex-row gap-10 items-center">
            <div className="flex-1 w-full bg-black/40 border border-[#ff0055]/30 p-10 md:p-14 rounded-[3.5rem] shadow-[0_0_120px_rgba(255,0,85,0.15)] relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#ff0055]/5 blur-3xl"></div>
              
              <div className="flex justify-between items-start mb-12">
                <div className="space-y-1">
                    <h2 className="text-5xl font-black text-[#ff0055] tracking-tighter uppercase italic leading-none">Connection<br/>Severed</h2>
                    <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest mt-2">神经链路已强制断开</p>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase text-yellow-500/60 font-bold tracking-widest mb-1">Peak Load</div>
                  <div className="text-3xl font-mono text-yellow-500 font-bold leading-none">{highScore.toLocaleString()}</div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-6 mb-12">
                <div className="bg-white/5 p-8 rounded-3xl border border-white/5 text-center group hover:border-[#00f2ff]/20 transition-colors">
                  <div className="text-[10px] uppercase text-white/30 mb-2 font-black tracking-widest">Final Score</div>
                  <div className="text-5xl font-bold text-[#00f2ff] font-mono leading-none group-hover:scale-105 transition-transform">{score.toLocaleString()}</div>
                </div>
                <div className="bg-white/5 p-8 rounded-3xl border border-white/5 text-center group hover:border-yellow-500/20 transition-colors">
                  <div className="text-[10px] uppercase text-white/30 mb-2 font-black tracking-widest">System Level</div>
                  <div className="text-5xl font-bold text-yellow-500 font-mono leading-none group-hover:scale-105 transition-transform">LV.{level}</div>
                </div>
              </div>

              <button onClick={startGame} className="w-full bg-white hover:bg-[#00f2ff] hover:text-white text-black font-black py-6 rounded-2xl flex items-center justify-center gap-4 transition-all transform active:scale-95 shadow-xl uppercase text-lg group">
                <RotateCcw size={24} className="group-hover:rotate-180 transition-transform duration-500" /> 
                Re-initialize Link
              </button>
            </div>

            <div className="w-full md:w-96 bg-black/40 border border-white/5 p-10 rounded-[3rem] backdrop-blur-2xl">
              <div className="flex items-center justify-between mb-8 text-white/60 font-black uppercase tracking-[0.2em] text-xs border-b border-white/5 pb-6">
                <div className="flex items-center gap-3">
                  <History size={18} className="text-[#00f2ff]" /> Memory Logs
                </div>
                <button onClick={clearHistory} className="p-2 hover:bg-white/10 rounded-xl text-white/20 hover:text-red-500 transition-colors">
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="space-y-5">
                {gameHistory.length > 0 ? gameHistory.map((record, i) => (
                  <div key={i} className="group p-5 bg-white/5 rounded-2xl border border-white/5 hover:border-[#00f2ff]/30 transition-all transform hover:scale-[1.02]">
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-xl font-mono font-bold text-[#00f2ff] leading-none">{record.score.toLocaleString()}</span>
                      <span className="text-[9px] text-white/20 font-bold uppercase">{record.date}</span>
                    </div>
                    <div className="flex gap-5 text-[10px] font-bold text-white/40 uppercase tracking-wider">
                      <span className="flex items-center gap-2"><Target size={12} className="text-[#ff0055]" /> {record.kills}</span>
                      <span className="flex items-center gap-2"><Clock size={12} className="text-yellow-500" /> {record.time}S</span>
                    </div>
                  </div>
                )) : (
                  <div className="text-center py-16 text-white/10 italic text-sm font-bold uppercase tracking-widest underline decoration-[#ff0055]/30 underline-offset-8">No Logs Found</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
