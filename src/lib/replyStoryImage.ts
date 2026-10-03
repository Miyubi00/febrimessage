import { mulberry32, roundRectPath, sparkle } from '@/lib/storyImage';
import type { Profile } from '@/types/profile';

export interface ReplyStoryArtwork {
  blob: Blob;
  /** PNG data URL for the in-app preview. */
  dataUrl: string;
  fileName: string;
}

const W = 1080;
const H = 1080;

/** Greedy word wrap (respects explicit newlines). */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    lines.push(current);
  }
  return lines;
}

function fitMultiline(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
  baseSize: number,
  weight: number,
  family: string,
  minSize = 36,
): { lines: string[]; size: number } {
  let size = baseSize;
  let lines: string[] = [];
  for (;;) {
    ctx.font = `${weight} ${size}px ${family}`;
    lines = wrapText(ctx, text, maxWidth);
    const widest = lines.reduce((wide, line) => Math.max(wide, ctx.measureText(line).width), 0);
    if (size <= minSize || (lines.length <= maxLines && widest <= maxWidth)) break;
    size -= 4;
  }
  return { lines: lines.slice(0, maxLines), size };
}

/**
 * Render a small transparent PNG sticker: gradient card with a
 * "send me anonymous messages!" header and the message in big type.
 * Transparent surround so it can be pasted over any Story background.
 */
export async function generateReplyStoryImage(
  profile: Profile,
  message: string,
): Promise<ReplyStoryArtwork> {
  try {
    await document.fonts.ready;
  } catch {
    // System fonts are a fine fallback.
  }

  const navy = profile.theme === 'navy';
  const card: [string, string] = navy ? ['#38BDF8', '#4F46E5'] : ['#6FB9FF', '#A5A9F5'];
  const family = '"Quicksand", "Inter", system-ui, sans-serif';
  const random = mulberry32(message.length * 131 + 7);
  const cx = W / 2;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas-unavailable');

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  /* --- measure first so the card hugs the content --- */
  const fitted = fitMultiline(ctx, message.trim() || '...', W - 320, 8, 88, 700, family);
  const lineHeight = fitted.size * 1.24;
  const cardH = 150 + fitted.lines.length * lineHeight + 90;
  const cardY = (H - cardH) / 2;
  const cardX = 70;
  const cardW = W - 140;

  /* --- gradient card --- */
  ctx.save();
  ctx.shadowColor = navy ? 'rgba(0, 0, 0, 0.5)' : 'rgba(20, 50, 110, 0.35)';
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 16;
  const grad = ctx.createLinearGradient(0, cardY, 0, cardY + cardH);
  grad.addColorStop(0, card[0]);
  grad.addColorStop(1, card[1]);
  ctx.fillStyle = grad;
  roundRectPath(ctx, cardX, cardY, cardW, cardH, 72);
  ctx.fill();
  ctx.restore();

  /* --- sparkles inside the card --- */
  ctx.save();
  roundRectPath(ctx, cardX, cardY, cardW, cardH, 72);
  ctx.clip();
  for (let i = 0; i < 8; i += 1) {
    sparkle(ctx, cardX + random() * cardW, cardY + random() * cardH, 8 + random() * 18, '#FFFFFF', 0.25 + random() * 0.3);
  }
  ctx.restore();

  /* --- header + message --- */
  let cursorY = cardY + 108;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = `700 33px ${family}`;
  ctx.fillText('SEND ME ANONYMOUS MESSAGES!', cx, cursorY);

  ctx.fillStyle = '#FFFFFF';
  ctx.shadowColor = 'rgba(10, 25, 60, 0.3)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  for (const line of fitted.lines) {
    cursorY += lineHeight;
    ctx.font = `700 ${fitted.size}px ${family}`;
    ctx.fillText(line || ' ', cx, cursorY);
  }
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) resolve(result);
        else reject(new Error('encode-failed'));
      },
      'image/png',
    );
  });

  return {
    blob,
    dataUrl: canvas.toDataURL('image/png'),
    fileName: `pesan-${profile.username || 'anon'}.png`,
  };
}
