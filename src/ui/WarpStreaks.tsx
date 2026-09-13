/**
 * Time-warp streak overlay (ASSET08).
 *
 * Radial speed-lines that fade in past 1,000× acceleration — the harder
 * time burns, the deeper the streak field. Pure canvas 2D, pointer-dead,
 * and fully suppressed under reduced motion.
 */

import React, { useEffect, useRef } from 'react';

interface WarpStreaksProps {
  timeScale: number;
  paused: boolean;
  reducedMotion: boolean;
}

export const WarpStreaks: React.FC<WarpStreaksProps> = ({ timeScale, paused, reducedMotion }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ timeScale, paused, reducedMotion });
  stateRef.current = { timeScale, paused, reducedMotion };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let streaks: Array<{ angle: number; radius: number; speed: number }> = [];

    const resize = (): void => {
      const parent = canvas.parentElement;
      canvas.width = parent?.clientWidth ?? window.innerWidth;
      canvas.height = parent?.clientHeight ?? window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const tick = (): void => {
      raf = requestAnimationFrame(tick);
      const { timeScale: scale, paused: isPaused, reducedMotion: rm } = stateRef.current;
      const intensity = rm || isPaused || scale < 1000 ? 0 : Math.min(1, Math.log10(scale / 1000) / 2 + 0.25);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (intensity <= 0) {
        streaks = [];
        return;
      }
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const maxR = Math.hypot(cx, cy);
      const target = Math.floor(40 * intensity);
      while (streaks.length < target) {
        streaks.push({
          angle: Math.random() * Math.PI * 2,
          radius: Math.random() * maxR,
          speed: (0.6 + Math.random() * 1.4) * (0.5 + intensity),
        });
      }
      ctx.lineWidth = 1.5;
      for (const s of streaks) {
        s.radius += s.speed * maxR * 0.004;
        if (s.radius > maxR) {
          s.radius = maxR * 0.15;
          s.angle = Math.random() * Math.PI * 2;
        }
        const tail = Math.max(2, s.radius * 0.06 * intensity);
        const x1 = cx + Math.cos(s.angle) * s.radius;
        const y1 = cy + Math.sin(s.angle) * s.radius;
        const x0 = cx + Math.cos(s.angle) * (s.radius - tail);
        const y0 = cy + Math.sin(s.angle) * (s.radius - tail);
        ctx.strokeStyle = `rgba(12, 198, 255, ${(0.05 + intensity * 0.22).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="warp-streaks" aria-hidden="true" />;
};
