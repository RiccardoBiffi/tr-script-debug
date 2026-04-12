import { useEffect, useMemo, useRef, useState } from 'react';

const PADDING = 22;
const GAP = 12;
const MIN_BLOCK_HEIGHT = 52;
const MAX_BLOCK_HEIGHT = 98;
const MIN_CANVAS_HEIGHT = 300;
const MAX_CANVAS_HEIGHT = 720;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function useCanvasWidth() {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return undefined;
    }

    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });

    observer.observe(element);
    setWidth(element.clientWidth);

    return () => observer.disconnect();
  }, []);

  return [containerRef, width];
}

function summarizeItem(item) {
  const lines = [`bytes ${item.size}`];

  if (item.intValue !== null) {
    lines.push(`int ${item.intValue}`);
  }

  if (item.textValue && item.textValue !== '(empty)') {
    lines.push(`text "${item.textValue}"`);
  }

  return lines.join(' | ');
}

function trimText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }

  let trimmed = text;
  while (trimmed.length > 1 && ctx.measureText(`${trimmed}...`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }

  return `${trimmed}...`;
}

export default function StackPane({ title, items, emptyLabel }) {
  const [containerRef, canvasWidth] = useCanvasWidth();
  const canvasRef = useRef(null);

  const metrics = useMemo(() => {
    const itemCount = items.length;
    const preferredHeight = MIN_CANVAS_HEIGHT + Math.max(itemCount - 1, 0) * 74;
    const canvasHeight = clamp(preferredHeight, MIN_CANVAS_HEIGHT, MAX_CANVAS_HEIGHT);
    return {
      canvasHeight,
      drawWidth: Math.max(canvasWidth, 280),
    };
  }, [canvasWidth, items.length]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || metrics.drawWidth === 0) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const width = metrics.drawWidth;
    const height = metrics.canvasHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(19, 34, 52, 0.96)');
    gradient.addColorStop(1, 'rgba(6, 14, 24, 0.98)');
    drawRoundedRect(ctx, 0.5, 0.5, width - 1, height - 1, 24);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const innerX = PADDING;
    const innerY = PADDING;
    const innerWidth = width - PADDING * 2;
    const innerHeight = height - PADDING * 2;

    drawRoundedRect(ctx, innerX, innerY, innerWidth, innerHeight, 18);
    ctx.fillStyle = 'rgba(7, 17, 28, 0.82)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.stroke();

    if (items.length === 0) {
      ctx.fillStyle = 'rgba(159, 176, 199, 0.82)';
      ctx.font = '600 15px "Space Grotesk", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(emptyLabel, width / 2, height / 2);
      return;
    }

    const visibleItems = [...items].reverse();
    const availableHeight = innerHeight - PADDING * 1.2;
    const blockHeight = clamp(
      (availableHeight - GAP * Math.max(visibleItems.length - 1, 0)) / visibleItems.length,
      MIN_BLOCK_HEIGHT,
      MAX_BLOCK_HEIGHT,
    );
    const usedHeight = visibleItems.length * blockHeight + Math.max(visibleItems.length - 1, 0) * GAP;
    let y = innerY + innerHeight - usedHeight - 14;

    for (let index = 0; index < visibleItems.length; index += 1) {
      const item = visibleItems[index];
      const isTop = item.indexFromTop === 0;
      const blockX = innerX + 14;
      const blockWidth = innerWidth - 28;
      const radius = 16;

      const blockGradient = ctx.createLinearGradient(blockX, y, blockX + blockWidth, y + blockHeight);
      if (isTop) {
        blockGradient.addColorStop(0, 'rgba(255, 155, 61, 0.34)');
        blockGradient.addColorStop(1, 'rgba(255, 155, 61, 0.15)');
      } else {
        blockGradient.addColorStop(0, 'rgba(83, 209, 166, 0.18)');
        blockGradient.addColorStop(1, 'rgba(83, 209, 166, 0.08)');
      }

      drawRoundedRect(ctx, blockX, y, blockWidth, blockHeight, radius);
      ctx.fillStyle = blockGradient;
      ctx.fill();
      ctx.strokeStyle = isTop ? 'rgba(255, 155, 61, 0.8)' : 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = isTop ? 1.5 : 1;
      ctx.stroke();

      ctx.fillStyle = 'rgba(244, 240, 232, 0.96)';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.font = '700 12px "IBM Plex Mono", monospace';
      const slotLabel = isTop ? 'TOP' : `TOP-${item.indexFromTop}`;
      ctx.fillText(slotLabel, blockX + 14, y + 12);

      ctx.textAlign = 'right';
      ctx.fillStyle = item.truthy ? 'rgba(83, 209, 166, 0.95)' : 'rgba(255, 123, 114, 0.95)';
      ctx.fillText(item.truthy ? 'TRUE' : 'FALSE', blockX + blockWidth - 14, y + 12);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#f4f0e8';
      ctx.font = '600 13px "IBM Plex Mono", monospace';
      const hexText = trimText(ctx, item.hex || '(empty)', blockWidth - 28);
      ctx.fillText(hexText, blockX + 14, y + 32);

      ctx.fillStyle = 'rgba(159, 176, 199, 0.95)';
      ctx.font = '500 11px "Space Grotesk", sans-serif';
      const summary = trimText(ctx, summarizeItem(item), blockWidth - 28);
      ctx.fillText(summary, blockX + 14, y + Math.min(blockHeight - 20, 56));

      y += blockHeight + GAP;
    }
  }, [emptyLabel, items, metrics]);

  return (
    <div className="stack-pane">
      <div className="stack-pane__title">{title}</div>
      <div className="stack-canvas-shell" ref={containerRef}>
        <canvas
          ref={canvasRef}
          className="stack-canvas"
          role="img"
          aria-label={`${title} visualizer with ${items.length} item${items.length === 1 ? '' : 's'}`}
        />
      </div>
    </div>
  );
}
