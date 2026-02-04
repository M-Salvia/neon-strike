
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GameState, Vector2, Player, Bullet, Enemy, EnemyType, Particle } from './types';
import { Target, Zap, Shield, Play, RotateCcw, Trophy, History, Clock, Trash2 } from 'lucide-react';

const CANVAS_WIDTH = window.innerWidth;
const CANVAS_HEIGHT = window.innerHeight;
const PLAYER_SPEED = 5;
const BULLET_SPEED = 14;
const PLAYER_FIRE_RATE = 120; // 稍微提升射速 (原 140)
const INITIAL_SPAWN_INTERVAL = 1600; // 初始更慢 (原 1400)
const MIN_SPAWN_INTERVAL = 400; // 最终下限提高 (原 250)

interface GameRecord {
  score: number;
  time: number;
  kills: number;
  date: string;
}

const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>(GameState.START);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [gameHistory, setGameHistory] = useState<GameRecord[]>([]);

  const scoreRef = useRef<number>(0);
  
  const playerRef = useRef<Player>({
    id: 'player',
    pos: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 },
    velocity: { x: 0, y: 0 },
    radius: 15,
    health: 100,
    maxHealth: 100,
    color: '#00f2ff',
    score: 0,
    lastShot: 0
  });
  const bulletsRef = useRef<Bullet[]>([]);
  const enemyBulletsRef = useRef<Bullet[]>([]);
  const enemiesRef = useRef<Enemy[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const keysRef = useRef<Set<string>>(new Set());
  const mouseRef = useRef<Vector2>({ x: 0, y: 0 });
  
  const lastTimeRef = useRef<number>(0);
  const spawnTimerRef = useRef<number>(INITIAL_SPAWN_INTERVAL - 500);
  const startTimeRef = useRef<number>(0);
  const enemiesKilledRef = useRef<number>(0);
  const screenShakeRef = useRef<number>(0);
  const frameIdRef = useRef<number>(0);

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
    playerRef.current = {
      ...playerRef.current,
      pos: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 },
      health: 100,
      score: 0
    };
    bulletsRef.current = [];
    enemyBulletsRef.current = [];
    enemiesRef.current = [];
    particlesRef.current = [];
    scoreRef.current = 0;
    setScore(0);
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
      particlesRef.current.push({
        id: Math.random().toString(),
        pos: { ...pos },
        velocity: { 
          x: Math.cos(angle) * force, 
          y: Math.sin(angle) * force 
        },
        life: 1, 
        maxLife: Math.random() * 0.8 + 0.4, 
        color
      });
    }
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
    // 难度增长变慢: 每 70 秒提升一个台阶 (原 40)
    const difficultyLevel = Math.min(3.0, 1 + gameDuration / 70); 
    const rand = Math.random();
    
    let type: EnemyType = 'vanguard';
    const titanThreshold = Math.max(0.75, 0.96 - gameDuration / 120);
    const hunterThreshold = Math.max(0.45, 0.85 - gameDuration / 100);

    let config = { health: 30 * difficultyLevel, color: '#ff0055', radius: 12, score: 100, fireRate: 0 };
    if (rand > titanThreshold) { 
      type = 'titan';
      config = { health: 250 * difficultyLevel, color: '#bd00ff', radius: 28, score: 500, fireRate: 3500 / Math.sqrt(difficultyLevel) };
    } else if (rand > hunterThreshold) { 
      type = 'hunter';
      config = { health: 70 * difficultyLevel, color: '#ffcc00', radius: 18, score: 300, fireRate: 2500 / Math.sqrt(difficultyLevel) };
    }

    enemiesRef.current.push({
      id: Math.random().toString(), pos: { x, y }, velocity: { x: 0, y: 0 },
      radius: config.radius, health: config.health, color: config.color,
      scoreValue: config.score, type, fireRate: config.fireRate, lastShot: now + Math.random() * 1000
    });
  }, []);

  const handleShoot = () => {
    if (gameState !== GameState.PLAYING) return;
    const now = Date.now();
    if (now - playerRef.current.lastShot < PLAYER_FIRE_RATE) return;
    
    const angle = Math.atan2(mouseRef.current.y - playerRef.current.pos.y, mouseRef.current.x - playerRef.current.pos.x);
    bulletsRef.current.push({
      id: Math.random().toString(), 
      pos: { ...playerRef.current.pos },
      velocity: { x: Math.cos(angle) * BULLET_SPEED, y: Math.sin(angle) * BULLET_SPEED },
      radius: 4, health: 1, color: '#00f2ff', damage: 35, ownerId: 'player'
    });
    playerRef.current.lastShot = now;
  };

  const update = (dt: number) => {
    if (gameState !== GameState.PLAYING) return;
    
    const now = Date.now();
    const gameDuration = (now - startTimeRef.current) / 1000;
    setElapsedTime(Math.floor(gameDuration));
    
    // 生成速度增长变慢 (原 * 25 改为 * 15)
    const currentSpawnInterval = Math.max(MIN_SPAWN_INTERVAL, INITIAL_SPAWN_INTERVAL - (gameDuration * 15));

    if (screenShakeRef.current > 0) screenShakeRef.current *= 0.9;

    let vx = 0, vy = 0;
    if (keysRef.current.has('w')) vy -= 1;
    if (keysRef.current.has('s')) vy += 1;
    if (keysRef.current.has('a')) vx -= 1;
    if (keysRef.current.has('d')) vx += 1;

    if (vx !== 0 || vy !== 0) {
      const length = Math.sqrt(vx * vx + vy * vy);
      playerRef.current.pos.x += (vx / length) * PLAYER_SPEED;
      playerRef.current.pos.y += (vy / length) * PLAYER_SPEED;
    }
    playerRef.current.pos.x = Math.max(15, Math.min(CANVAS_WIDTH - 15, playerRef.current.pos.x));
    playerRef.current.pos.y = Math.max(15, Math.min(CANVAS_HEIGHT - 15, playerRef.current.pos.y));

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
        let newAngle = currentAngle + (targetAngle - currentAngle) * 0.05; // 转向变迟钝
        const speed = Math.sqrt(b.velocity.x**2 + b.velocity.y**2);
        b.velocity.x = Math.cos(newAngle) * speed;
        b.velocity.y = Math.sin(newAngle) * speed;
        b.lifeSpan -= dt;
      }
      b.pos.x += b.velocity.x; b.pos.y += b.velocity.y;
      
      const dist = Math.sqrt((playerRef.current.pos.x - b.pos.x)**2 + (playerRef.current.pos.y - b.pos.y)**2);
      if (dist < playerRef.current.radius + b.radius) {
        playerRef.current.health -= b.damage;
        screenShakeRef.current = 8;
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
      // 敌人速度削减: 红色(2.5), 泰坦(0.7), 猎手(1.8)
      const moveSpeed = e.type === 'vanguard' ? 2.5 : (e.type === 'titan' ? 0.7 : 1.8);

      if (e.type === 'vanguard') e.velocity = { x: (dx / dist) * moveSpeed, y: (dy / dist) * moveSpeed };
      else if (e.type === 'titan') {
        e.velocity = { x: (dx / dist) * moveSpeed, y: (dy / dist) * moveSpeed };
        if (now - e.lastShot > e.fireRate) {
          for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
            enemyBulletsRef.current.push({
              id: Math.random().toString(), pos: { ...e.pos }, velocity: { x: Math.cos(a) * 3, y: Math.sin(a) * 3 }, // 弹速降低 (原 4)
              radius: 6, health: 1, color: e.color, damage: 15, ownerId: e.id
            });
          }
          e.lastShot = now;
        }
      } else if (e.type === 'hunter') {
        const factor = dist > 400 ? 1.2 : -0.7; // 保持更远的距离
        e.velocity = { x: (dx / dist) * moveSpeed * factor, y: (dy / dist) * moveSpeed * factor };
        if (now - e.lastShot > e.fireRate) {
          enemyBulletsRef.current.push({
            id: Math.random().toString(), pos: { ...e.pos }, velocity: { x: (dx / dist) * 5, y: (dy / dist) * 5 }, // 弹速降低 (原 7)
            radius: 5, health: 1, color: e.color, damage: 10, ownerId: e.id, isHoming: true, homingStrength: 0.08, lifeSpan: 2000
          });
          e.lastShot = now;
        }
      }

      e.pos.x += e.velocity.x; e.pos.y += e.velocity.y;

      if (dist < playerRef.current.radius + e.radius) {
        playerRef.current.health -= e.type === 'titan' ? 1.5 : 0.8; // 碰撞伤害降低
        screenShakeRef.current = 5;
        if (playerRef.current.health <= 0) endGame();
      }

      for (let bi = bulletsRef.current.length - 1; bi >= 0; bi--) {
        const b = bulletsRef.current[bi];
        const bdx = e.pos.x - b.pos.x;
        const bdy = e.pos.y - b.pos.y;
        const bdist = Math.sqrt(bdx*bdx + bdy*bdy);
        
        if (bdist < e.radius + b.radius) {
          e.health -= b.damage;
          bulletsRef.current.splice(bi, 1);
          createExplosion(b.pos, '#ffffff', 3, 0.5);

          if (e.health <= 0) {
            enemiesKilledRef.current++;
            const newScore = scoreRef.current + e.scoreValue;
            scoreRef.current = newScore;
            setScore(newScore);
            if (newScore > highScore) setHighScore(newScore);
            const shakeAmt = e.type === 'titan' ? 15 : 5;
            screenShakeRef.current = Math.max(screenShakeRef.current, shakeAmt);
            createExplosion(e.pos, e.color, e.type === 'titan' ? 40 : 15, e.type === 'titan' ? 1.5 : 0.8);
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
    ctx.strokeStyle = e.color;
    ctx.shadowBlur = 15;
    ctx.shadowColor = e.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    
    if (e.type === 'vanguard') {
      const angle = Math.atan2(e.velocity.y, e.velocity.x);
      ctx.rotate(angle);
      ctx.moveTo(e.radius, 0); ctx.lineTo(-e.radius, -e.radius/1.5); ctx.lineTo(-e.radius, e.radius/1.5);
    } else if (e.type === 'titan') {
      ctx.rotate(Date.now() * 0.001);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const x = Math.cos(a) * e.radius; const y = Math.sin(a) * e.radius;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
    } else if (e.type === 'hunter') {
      ctx.rotate(Math.atan2(playerRef.current.pos.y - e.pos.y, playerRef.current.pos.x - e.pos.x));
      ctx.moveTo(0, -e.radius); ctx.lineTo(e.radius, 0); ctx.lineTo(0, e.radius); ctx.lineTo(-e.radius, 0);
    }
    
    ctx.closePath(); ctx.stroke(); ctx.restore();
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    ctx.save();
    const sx = (Math.random() - 0.5) * screenShakeRef.current;
    const sy = (Math.random() - 0.5) * screenShakeRef.current;
    ctx.translate(sx, sy);

    ctx.fillStyle = '#0a0a0a'; 
    ctx.fillRect(-50, -50, CANVAS_WIDTH + 100, CANVAS_HEIGHT + 100);

    ctx.strokeStyle = 'rgba(0, 242, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let i = 0; i < CANVAS_WIDTH; i += 60) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, CANVAS_HEIGHT); ctx.stroke(); }
    for (let i = 0; i < CANVAS_HEIGHT; i += 60) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(CANVAS_WIDTH, i); ctx.stroke(); }

    if (![GameState.PLAYING, GameState.GAMEOVER].includes(gameState)) {
      ctx.restore();
      return;
    }

    particlesRef.current.forEach(p => {
      ctx.fillStyle = p.color; 
      ctx.globalAlpha = p.life;
      const size = Math.max(0.5, 3 * p.life);
      ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y, size, 0, Math.PI*2); ctx.fill();
    });
    ctx.globalAlpha = 1;

    const pl = playerRef.current;
    ctx.save();
    ctx.translate(pl.pos.x, pl.pos.y);
    ctx.rotate(Math.atan2(mouseRef.current.y - pl.pos.y, mouseRef.current.x - pl.pos.x));
    ctx.strokeStyle = pl.color;
    ctx.shadowBlur = 20;
    ctx.shadowColor = pl.color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(18, 0); ctx.lineTo(-12, -12); ctx.lineTo(-12, 12);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    bulletsRef.current.forEach(b => {
      ctx.fillStyle = b.color;
      ctx.shadowBlur = 12;
      ctx.shadowColor = b.color;
      ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y, b.radius, 0, Math.PI*2); ctx.fill();
    });

    enemyBulletsRef.current.forEach(b => {
      ctx.fillStyle = b.color;
      ctx.shadowBlur = 10;
      ctx.shadowColor = b.color;
      ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y, b.isHoming ? b.radius * 1.5 : b.radius, 0, Math.PI*2); ctx.fill();
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

  const startGame = () => { resetGame(); setGameState(GameState.PLAYING); };
  
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

  return (
    <div className="relative w-full h-screen bg-[#0a0a0a] overflow-hidden text-white select-none font-sans">
      <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="absolute inset-0 cursor-crosshair" />

      {gameState === GameState.PLAYING && (
        <div className="absolute top-0 left-0 w-full p-6 pointer-events-none flex justify-between items-start z-10">
          <div className="space-y-3">
            <div className="bg-black/60 backdrop-blur-xl border border-[#00f2ff]/30 p-4 rounded-2xl flex items-center gap-4">
              <Shield className="text-[#00f2ff] w-5 h-5" />
              <div className="flex-1">
                <div className="text-[10px] uppercase tracking-[0.2em] text-[#00f2ff]/60 font-bold mb-1">机体完整性</div>
                <div className="w-40 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-[#00f2ff] shadow-[0_0_10px_#00f2ff] transition-all duration-300" style={{ width: `${playerRef.current.health}%` }} />
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="bg-black/60 backdrop-blur-xl border border-[#ff0055]/30 p-4 rounded-2xl flex items-center gap-4">
                <Target className="text-[#ff0055] w-5 h-5" />
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[#ff0055]/60 font-bold">当前载荷</div>
                  <div className="text-xl font-mono font-bold text-[#ff0055]">{score.toLocaleString()}</div>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-3 pointer-events-auto">
            <div className="bg-black/60 backdrop-blur-xl border border-white/10 px-4 py-2 rounded-xl text-right">
              <div className="text-[9px] uppercase tracking-widest text-white/40">存活时间</div>
              <div className="text-sm font-mono text-white/80">{elapsedTime}s</div>
            </div>
          </div>
        </div>
      )}

      {gameState === GameState.START && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-md z-50">
          <div className="max-w-md w-full p-12 border border-[#00f2ff]/40 bg-black/80 rounded-[2rem] text-center space-y-8 shadow-[0_0_80px_rgba(0,242,255,0.15)]">
            <div className="inline-block p-3 bg-[#00f2ff]/10 rounded-2xl border border-[#00f2ff]/20 mb-4 animate-pulse">
               <Zap className="text-[#00f2ff] w-8 h-8" />
            </div>
            <h1 className="text-5xl font-black tracking-tighter italic text-white uppercase">Neon <span className="text-[#ff0055]">Strike</span></h1>
            
            {highScore > 0 && (
              <div className="bg-yellow-500/5 border border-yellow-500/20 p-4 rounded-xl">
                <div className="text-[10px] uppercase font-bold text-yellow-500/60 mb-1 flex items-center justify-center gap-2">
                  <Trophy size={12} /> 历史最高记录
                </div>
                <div className="text-2xl font-mono text-yellow-500 font-bold">{highScore.toLocaleString()}</div>
              </div>
            )}

            <button onClick={startGame} className="w-full bg-[#00f2ff] hover:brightness-110 text-black font-black py-4 rounded-xl flex items-center justify-center gap-3 transition-all transform active:scale-95 shadow-[0_0_20px_rgba(0,242,255,0.4)] uppercase">
              <Play className="fill-black" size={20} /> 初始化链路
            </button>

            <div className="text-[10px] font-mono text-white/30 space-y-1">
              <div className="flex justify-center gap-4 mt-2">
                <span>[WASD] 移动</span>
                <span>[左键] 开火</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {gameState === GameState.GAMEOVER && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 backdrop-blur-lg z-50 p-6 overflow-y-auto">
          <div className="max-w-4xl w-full flex flex-col md:flex-row gap-8">
            <div className="flex-1 bg-[#0a0a0a] border border-[#ff0055]/40 p-8 md:p-10 rounded-[2.5rem] shadow-[0_0_100px_rgba(255,0,85,0.1)] h-fit">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-4xl font-black text-[#ff0055] tracking-tighter">连接中断</h2>
                <div className="text-right">
                  <div className="text-[10px] uppercase text-yellow-500/60 font-bold tracking-widest">最高纪录</div>
                  <div className="text-2xl font-mono text-yellow-500">{highScore.toLocaleString()}</div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="bg-white/5 p-6 rounded-2xl border border-white/10 text-center">
                  <div className="text-[10px] uppercase text-white/40 mb-1 font-black tracking-widest">本次得分</div>
                  <div className="text-4xl font-bold text-[#00f2ff] font-mono">{score.toLocaleString()}</div>
                </div>
                <div className="bg-white/5 p-6 rounded-2xl border border-white/10 text-center">
                  <div className="text-[10px] uppercase text-white/40 mb-1 font-black tracking-widest">肃清数</div>
                  <div className="text-4xl font-bold text-[#ff0055] font-mono">{enemiesKilledRef.current}</div>
                </div>
              </div>

              <button onClick={startGame} className="w-full bg-white hover:bg-gray-200 text-black font-black py-5 rounded-xl flex items-center justify-center gap-3 transition-all transform active:scale-95 shadow-[0_10px_30px_rgba(255,255,255,0.1)] uppercase">
                <RotateCcw size={24} /> 重连神经链路
              </button>
            </div>

            <div className="w-full md:w-80 bg-black/60 border border-white/10 p-8 rounded-[2.5rem] backdrop-blur-xl relative">
              <div className="flex items-center justify-between mb-6 text-white/80 font-bold uppercase tracking-widest text-sm border-b border-white/10 pb-4">
                <div className="flex items-center gap-2">
                  <History size={18} className="text-[#00f2ff]" /> 战绩历史
                </div>
                <button onClick={clearHistory} className="p-2 hover:bg-white/10 rounded-lg text-white/30 hover:text-red-500 transition-colors" title="清除历史记录">
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="space-y-4">
                {gameHistory.length > 0 ? gameHistory.map((record, i) => (
                  <div key={i} className="group p-4 bg-white/5 rounded-xl border border-white/5 hover:border-[#00f2ff]/40 transition-colors">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-lg font-mono font-bold text-[#00f2ff]">{record.score.toLocaleString()}</span>
                      <span className="text-[9px] text-white/30 font-mono mt-1">{record.date}</span>
                    </div>
                    <div className="flex gap-4 text-[10px] font-mono text-white/50 uppercase">
                      <span className="flex items-center gap-1"><Target size={10} /> {record.kills}</span>
                      <span className="flex items-center gap-1"><Clock size={10} /> {record.time}S</span>
                    </div>
                  </div>
                )) : (
                  <div className="text-center py-10 text-white/20 italic text-sm">暂无数据记录</div>
                )}
              </div>
              <div className="mt-6 text-[9px] text-center text-white/20 uppercase tracking-widest">
                数据加密存储在本地浏览器中
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
