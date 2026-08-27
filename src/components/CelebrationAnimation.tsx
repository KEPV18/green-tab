import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  size: number;
  speedX: number;
  speedY: number;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
  shape: "circle" | "square" | "star";
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "#FFD700",
  "#FF6B6B",
  "#4ECDC4",
  "#A855F7",
  "#F97316",
];

const SHAPES = ["circle", "square", "star"] as const;

interface CelebrationAnimationProps {
  trigger: boolean;
  onComplete?: () => void;
  type?: "confetti" | "firework";
  duration?: number;
}

export const CelebrationAnimation = ({
  trigger,
  onComplete,
  type = "confetti",
  duration = 3000,
}: CelebrationAnimationProps) => {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [active, setActive] = useState(false);

  const createParticles = useCallback(() => {
    const count = type === "firework" ? 40 : 60;
    const newParticles: Particle[] = [];

    for (let i = 0; i < count; i++) {
      const isFirework = type === "firework";
      newParticles.push({
        id: i,
        x: isFirework ? 50 : Math.random() * 100,
        y: isFirework ? 50 : -10,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        size: Math.random() * 8 + 4,
        speedX: (Math.random() - 0.5) * (isFirework ? 8 : 4),
        speedY: isFirework ? (Math.random() - 0.5) * 8 : Math.random() * 3 + 2,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 10,
        opacity: 1,
        shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
      });
    }

    return newParticles;
  }, [type]);

  useEffect(() => {
    if (!trigger) return;

    setActive(true);
    setParticles(createParticles());

    // Vibrate if supported
    try {
      if (navigator.vibrate) {
        navigator.vibrate([100, 50, 100, 50, 200]);
      }
    } catch {}

    const fadeInterval = setInterval(() => {
      setParticles((prev) =>
        prev
          .map((p) => ({
            ...p,
            x: p.x + p.speedX * 0.3,
            y: p.y + p.speedY * 0.3,
            speedY: p.speedY + 0.1, // gravity
            rotation: p.rotation + p.rotationSpeed,
            opacity: Math.max(0, p.opacity - 0.015),
          }))
          .filter((p) => p.opacity > 0)
      );
    }, 30);

    const timeout = setTimeout(() => {
      setActive(false);
      setParticles([]);
      clearInterval(fadeInterval);
      onComplete?.();
    }, duration);

    return () => {
      clearTimeout(timeout);
      clearInterval(fadeInterval);
    };
  }, [trigger, createParticles, duration, onComplete]);

  if (!active || particles.length === 0) return null;

  return createPortal(
    <div
      className="fixed inset-0 pointer-events-none z-[9999]"
      aria-hidden="true"
    >
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            backgroundColor: p.shape !== "star" ? p.color : "transparent",
            borderRadius: p.shape === "circle" ? "50%" : p.shape === "square" ? "2px" : "0",
            transform: `rotate(${p.rotation}deg)`,
            opacity: p.opacity,
            transition: "none",
            ...(p.shape === "star"
              ? {
                  clipPath:
                    "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)",
                  backgroundColor: p.color,
                }
              : {}),
          }}
        />
      ))}
    </div>,
    document.body
  );
};
