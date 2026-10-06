import type { Profile } from '@/types/profile';

export interface StoryArtwork {
  blob: Blob;
  /** PNG data URL for the in-app preview. */
  dataUrl: string;
  fileName: string;
}

export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;

interface StoryPalette {
  sky: [string, string, string, string];
  ink: string;
  soft: string;
  muted: string;
  pill: string;
  pillText: string;
  ring: string;
  shadow: string;
}

const LIGHT: StoryPalette = {
  sky: ['#5EA8FF', '#A9D8FF', '#EAF6FF', '#C9CDFF'],
  ink: '#1E3A5F',
  soft: '#3D5A80',
  muted: '#5B7BB0',
  pill: '#FFFFFF',
  pillText: '#1E3A5F',
  ring: '#FFFFFF',
  shadow: 'rgba(20, 50, 110, 0.35)',
};

const NAVY: StoryPalette = {
  sky: ['#060D24', '#0A1330', '#1E3A8A', '#312E81'],
  ink: '#FFFFFF',
  soft: '#C9D8F5',
  muted: '#8FA3D4',
  pill: '#FFFFFF',
  pillText: '#0A1330',
  ring: '#FFFFFF',
  shadow: 'rgba(0, 0, 0, 0.55)',
};

const PINK: StoryPalette = {
  sky: ['#DB2777', '#F472B6', '#FBCFE8', '#FCE7F3'],
  ink: '#831843',
  soft: '#9D174D',
  muted: '#BE185D',
  pill: '#FFFFFF',
  pillText: '#BE185D',
  ring: '#FFFFFF',
  shadow: 'rgba(190, 24, 93, 0.35)',
};

const PALETTES: Record<string, StoryPalette> = {
  navy: NAVY,
  pink: PINK,
  'pastel-blue': LIGHT,
};

/** Deterministic pseudo-random so every render of the same profile matches. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Load an image element (null when missing/unreadable) — shared by story art. */
export function loadAvatar(url: string | null): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

/** Four-point sparkle (like the app's festive backdrop). */
export function sparkle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string,
  alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - size);
  ctx.quadraticCurveTo(cx, cy, cx + size, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy + size);
  ctx.quadraticCurveTo(cx, cy, cx - size, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy - size);
  ctx.fill();
  ctx.restore();
}

/** Tilted mini chat bubble (NGL vibe). */
function bubble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number,
  color: string,
  alpha: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  roundRectPath(ctx, -width / 2, -height / 2, width, height, 44);
  ctx.fill();
  ctx.restore();
}

function heart(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
  alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.9);
  ctx.bezierCurveTo(x - size * 1.2, y + size * 0.1, x - size * 0.7, y - size * 0.9, x, y - size * 0.25);
  ctx.bezierCurveTo(x + size * 0.7, y - size * 0.9, x + size * 1.2, y + size * 0.1, x, y + size * 0.9);
  ctx.fill();
  ctx.restore();
}

function plus(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
  alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.28;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - size, y);
  ctx.lineTo(x + size, y);
  ctx.moveTo(x, y - size);
  ctx.lineTo(x, y + size);
  ctx.stroke();
  ctx.restore();
}

/** Shrink text until it fits maxWidth (never smaller than minSize). */
export function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  baseSize: number,
  weight: number,
  family: string,
  minSize = 30,
): number {
  let size = baseSize;
  ctx.font = `${weight} ${size}px ${family}`;
  while (ctx.measureText(text).width > maxWidth && size > minSize) {
    size -= 4;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  return size;
}

/**
 * Render a 1080×1920 Instagram-Story artwork for a profile: festive sky,
 * avatar, name, NGL-style headline and a link pill. Runs fully client-side.
 */
export async function generateStoryImage(profile: Profile, siteOrigin: string): Promise<StoryArtwork> {
  try {
    await document.fonts.ready;
  } catch {
    // System fonts are a fine fallback.
  }

  const palette = PALETTES[profile.theme] ?? LIGHT;
  const family = '"Quicksand", "Inter", system-ui, sans-serif';
  const random = mulberry32(profile.username.length * 7919 + 13);
  const avatar = await loadAvatar(profile.avatar_url);

  const canvas = document.createElement('canvas');
  canvas.width = STORY_WIDTH;
  canvas.height = STORY_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas-unavailable');

  /* --- sky --- */
  const sky = ctx.createLinearGradient(0, 0, 0, STORY_HEIGHT);
  sky.addColorStop(0, palette.sky[0]);
  sky.addColorStop(0.42, palette.sky[1]);
  sky.addColorStop(0.72, palette.sky[2]);
  sky.addColorStop(1, palette.sky[3]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);

  /* --- ambient avatar glow (NGL-style blurred backdrop) --- */
  if (avatar) {
    ctx.save();
    try {
      ctx.filter = 'blur(90px) saturate(1.4)';
    } catch {
      // Older browsers ignore filter — the gradient already looks fine.
    }
    ctx.globalAlpha = 0.55;
    ctx.drawImage(avatar, -140, 220, STORY_WIDTH + 280, STORY_WIDTH + 280);
    ctx.restore();
    ctx.save();
    const veil = ctx.createLinearGradient(0, 0, 0, STORY_HEIGHT);
    veil.addColorStop(0, 'rgba(255,255,255,0)');
    veil.addColorStop(1, palette.sky[2]);
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);
    ctx.restore();
  }

  /* --- soft circles --- */
  ctx.fillStyle = '#FFFFFF';
  for (let i = 0; i < 7; i += 1) {
    const radius = 40 + random() * 130;
    ctx.globalAlpha = 0.1 + random() * 0.12;
    ctx.beginPath();
    ctx.arc(random() * STORY_WIDTH, random() * STORY_HEIGHT, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  /* --- sparkles --- */
  for (let i = 0; i < 16; i += 1) {
    sparkle(
      ctx,
      random() * STORY_WIDTH,
      random() * STORY_HEIGHT,
      10 + random() * 26,
      '#FFFFFF',
      0.35 + random() * 0.45,
    );
  }

  /* --- chat bubbles in the corners (NGL vibe) --- */
  bubble(ctx, 170, 330, 220, 160, -0.18, '#FFFFFF', 0.5);
  heart(ctx, 170, 322, 34, palette.soft, 0.9);
  bubble(ctx, 910, 350, 200, 150, 0.16, '#FFFFFF', 0.5);
  ctx.save();
  ctx.fillStyle = palette.soft;
  ctx.globalAlpha = 0.9;
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.arc(868 + i * 42, 344, 13, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  plus(ctx, 90, 1450, 20, '#FFFFFF', 0.7);
  plus(ctx, 990, 1480, 24, '#FFFFFF', 0.7);
  plus(ctx, 880, 120, 18, '#FFFFFF', 0.6);

  const cx = STORY_WIDTH / 2;

  /* --- avatar with double ring --- */
  const avatarY = 500;
  const avatarR = 185;
  ctx.save();
  const halo = profile.theme === 'navy' ? 'rgba(56,189,248,0.55)' : profile.theme === 'pink' ? 'rgba(244,114,182,0.55)' : 'rgba(255,255,255,0.5)';
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, avatarY, avatarR + 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.shadowColor = palette.shadow;
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = palette.ring;
  ctx.beginPath();
  ctx.arc(cx, avatarY, avatarR + 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, avatarY, avatarR, 0, Math.PI * 2);
  ctx.clip();
  if (avatar) {
    const side = Math.min(avatar.naturalWidth, avatar.naturalHeight);
    ctx.drawImage(
      avatar,
      (avatar.naturalWidth - side) / 2,
      (avatar.naturalHeight - side) / 2,
      side,
      side,
      cx - avatarR,
      avatarY - avatarR,
      avatarR * 2,
      avatarR * 2,
    );
  } else {
    ctx.fillStyle = '#A9D8FF';
    ctx.fillRect(cx - avatarR, avatarY - avatarR, avatarR * 2, avatarR * 2);
    const initial = (profile.display_name.slice(0, 1) || '?').toUpperCase();
    ctx.fillStyle = palette.pillText;
    ctx.font = `700 170px ${family}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initial, cx, avatarY + 10);
  }
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  /* --- display name (no username — it looked duplicated) --- */
  const nameSize = fitFont(ctx, profile.display_name || 'Anon', 880, 84, 700, family);
  ctx.fillStyle = palette.ink;
  ctx.font = `700 ${nameSize}px ${family}`;
  ctx.fillText(profile.display_name || 'Anon', cx, 830);

  /* --- headline --- */
  ctx.fillStyle = palette.ink;
  ctx.shadowColor = palette.shadow;
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 8;
  ctx.font = `700 128px ${family}`;
  ctx.fillText('Send me', cx, 1075);
  ctx.fillText('anonymous', cx, 1211);
  ctx.fillText('messages!', cx, 1347);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  /* --- link pill with globe icon --- */
  const host = siteOrigin.replace(/^https?:\/\//, '').replace(/\/$/, '');
  ctx.font = `700 44px ${family}`;
  const hostWidth = ctx.measureText(host).width;
  const pillWidth = Math.min(880, hostWidth + 220);
  const pillY = 1430;
  const pillCy = pillY + 56;
  const contentWidth = 44 + 20 + hostWidth;
  const contentX = cx - contentWidth / 2;
  ctx.save();
  ctx.shadowColor = palette.shadow;
  ctx.shadowBlur = 34;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = palette.pill;
  roundRectPath(ctx, cx - pillWidth / 2, pillY, pillWidth, 112, 56);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = palette.pillText;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(contentX + 22, pillCy, 21, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(contentX + 22, pillCy, 10, 21, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(contentX + 1, pillCy);
  ctx.lineTo(contentX + 43, pillCy);
  ctx.stroke();
  ctx.fillStyle = palette.pillText;
  ctx.font = `700 44px ${family}`;
  ctx.fillText(host, contentX + 64 + hostWidth / 2, pillCy + 15);

  /* --- footer --- */
  ctx.fillStyle = palette.muted;
  ctx.font = `600 30px ${family}`;
  ctx.fillText('Kirim pesan anonim  •  tempel link di stiker tautan', cx, 1700);

  /* --- corner sparkles near footer --- */
  sparkle(ctx, 120, 1620, 26, '#FFFFFF', 0.8);
  sparkle(ctx, STORY_WIDTH - 120, 1620, 26, '#FFFFFF', 0.8);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error('encode-failed'));
    }, 'image/png');
  });

  return {
    blob,
    dataUrl: canvas.toDataURL('image/png'),
    fileName: `story-${profile.username || 'anon'}.png`,
  };
}
