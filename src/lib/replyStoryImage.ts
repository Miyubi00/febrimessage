import { mulberry32, roundRectPath, sparkle } from '@/lib/storyImage';
import type { Profile } from '@/types/profile';

export interface ReplyStoryArtwork {
  blob: Blob;
  /** PNG data URL for the in-app preview. */
  dataUrl: string;
  fileName: string;
}

const W = 1080;
const H = 1920;

interface ReplyBackdrop {
  sky: [string, string, string];
}

const LIGHT_BACKDROP: ReplyBackdrop = {
  sky: ['#3B82F6', '#8FCBFF', '#EAF6FF'],
};

const NAVY_BACKDROP: ReplyBackdrop = {
  sky: ['#060D24', '#1E3A8A', '#312E81'],
};

const PINK_BACKDROP: ReplyBackdrop = {
  sky: ['#DB2777', '#F472B6', '#FBCFE8'],
};

const BACKDROPS: Record<string, ReplyBackdrop> = {
  'pastel-blue': LIGHT_BACKDROP,
  navy: NAVY_BACKDROP,
  pink: PINK_BACKDROP,
};

/** Header gradient — brand pastel blue (light) / vivid sky (navy) / pink. */
const LIGHT_HEADER: [string, string] = ['#5EA8FF', '#A5A9F5'];

const NAVY_HEADER: [string, string] = ['#38BDF8', '#6366F1'];

const PINK_HEADER: [string, string] = ['#F472B6', '#EC4899'];

const HEADERS: Record<string, [string, string]> = {
  'pastel-blue': LIGHT_HEADER,
  navy: NAVY_HEADER,
  pink: PINK_HEADER,
};

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
  minSize = 34,
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

/** Draw a fitted one-liner centered at (cx, y). */
function fitSingle(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  maxWidth: number,
  baseSize: number,
  weight: number,
  family: string,
  color: string,
  minSize = 28,
): void {
  let size = baseSize;
  ctx.font = `${weight} ${size}px ${family}`;
  while (ctx.measureText(text).width > maxWidth && size > minSize) {
    size -= 2;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  ctx.fillStyle = color;
  ctx.fillText(text, cx, y);
}

/**
 * Render a 1080×1920 portrait Story artwork, NGL-style: festive background,
 * centered card with a gradient header ("send me anonymous messages!") and
 * the message on a white body. No footer. Runs fully client-side.
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

  const theme = profile.theme in BACKDROPS ? profile.theme : 'pastel-blue';
  const backdrop = BACKDROPS[theme];
  const headerGradient = HEADERS[theme];
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

  /* --- festive background --- */
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, backdrop.sky[0]);
  sky.addColorStop(0.55, backdrop.sky[1]);
  sky.addColorStop(1, backdrop.sky[2]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#FFFFFF';
  for (let i = 0; i < 9; i += 1) {
    const radius = 40 + random() * 150;
    ctx.globalAlpha = 0.08 + random() * 0.1;
    ctx.beginPath();
    ctx.arc(random() * W, random() * H, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 26; i += 1) {
    sparkle(ctx, random() * W, random() * H, 10 + random() * 26, '#FFFFFF', 0.3 + random() * 0.5);
  }

  /* --- measure the message first so the card hugs it --- */
  const cardX = 120;
  const cardW = W - 240;
  const headerH = 300;
  const fitted = fitMultiline(ctx, message.trim() || '...', cardW - 150, 12, 72, 700, family);
  const lineHeight = fitted.size * 1.28;
  const textBlock = fitted.lines.length * lineHeight;
  const bodyPadTop = 64;
  const bodyPadBottom = 76;
  const cardH = Math.min(headerH + bodyPadTop + textBlock + bodyPadBottom, 1180);

  // Center the card in the middle zone, leaving room for the handle below.
  const zoneTop = 330;
  const zoneBottom = 1560;
  const cardY = Math.max(240, zoneTop + Math.max(0, (zoneBottom - zoneTop - cardH) / 2));

  /* --- white card body --- */
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 20;
  ctx.fillStyle = '#FFFFFF';
  roundRectPath(ctx, cardX, cardY, cardW, cardH, 72);
  ctx.fill();
  ctx.restore();

  /* --- gradient header clipped to the card's top --- */
  ctx.save();
  roundRectPath(ctx, cardX, cardY, cardW, cardH, 72);
  ctx.clip();
  const headerGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + headerH);
  headerGrad.addColorStop(0, headerGradient[0]);
  headerGrad.addColorStop(1, headerGradient[1]);
  ctx.fillStyle = headerGrad;
  ctx.fillRect(cardX, cardY, cardW, headerH);
  ctx.restore();

  /* --- header tagline --- */
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowColor = 'rgba(10, 25, 60, 0.35)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 4;
  ctx.font = `700 58px ${family}`;
  const tagline = ['send me anonymous', 'messages!'];
  const tagSize = (() => {
    let size = 58;
    ctx.font = `700 ${size}px ${family}`;
    while (
      Math.max(ctx.measureText(tagline[0]).width, ctx.measureText(tagline[1]).width) >
        cardW - 150 &&
      size > 30
    ) {
      size -= 2;
      ctx.font = `700 ${size}px ${family}`;
    }
    return size;
  })();
  const tagLineHeight = tagSize * 1.18;
  let tagY = cardY + (headerH - tagLineHeight * 2) / 2 + tagSize * 0.92;
  for (const line of tagline) {
    ctx.font = `700 ${tagSize}px ${family}`;
    ctx.fillText(line, cx, tagY);
    tagY += tagLineHeight;
  }
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  /* --- message text, vertically centered in the body --- */
  const bodyTop = cardY + headerH + bodyPadTop;
  const bodyTextH = cardH - headerH - bodyPadTop - bodyPadBottom;
  let cursorY = bodyTop + Math.max(0, (bodyTextH - textBlock) / 2);
  ctx.fillStyle = '#1E293B';
  for (const line of fitted.lines) {
    ctx.font = `700 ${fitted.size}px ${family}`;
    cursorY += lineHeight;
    ctx.fillText(line || ' ', cx, cursorY - lineHeight + fitted.size * 0.92);
  }

  /* --- owner handle under the card (no footer bar) --- */
  fitSingle(
    ctx,
    `@${profile.username || 'anon'}`,
    cx,
    cardY + cardH + 110,
    700,
    46,
    700,
    family,
    'rgba(255, 255, 255, 0.95)',
  );

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
    fileName: `story-${profile.username || 'anon'}.png`,
  };
}
