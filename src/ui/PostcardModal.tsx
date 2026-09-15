import React, { useEffect, useRef, useState } from 'react';
import { ModalShell } from './ModalShell';
import { formatSimTime } from '../simulation/units';
import { audioSynth } from '../audio/audio-synth';
import { Download } from 'lucide-react';

interface PostcardModalProps {
  canvas: HTMLCanvasElement | null;
  sigilSvg: string;
  projectName: string;
  simTimeSec: number;
  onDone: () => void;
  onClose: () => void;
}

/**
 * SYSTEM POSTCARD — composites the live WebGL frame, the deterministic sigil,
 * and the mission chronometer into a downloadable PNG artifact.
 */
export const PostcardModal: React.FC<PostcardModalProps> = ({
  canvas, sigilSvg, projectName, simTimeSec, onDone, onClose,
}) => {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const built = useRef(false);

  useEffect(() => {
    if (built.current) return;
    built.current = true;
    if (!canvas) { setDataUrl(null); return; }

    const w = canvas.width;
    const h = canvas.height;
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const ctx = off.getContext('2d');
    if (!ctx) return;

    // Live frame (captured after last render; WebGL buffer must persist)
    ctx.drawImage(canvas, 0, 0);

    // Vignette frame
    const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
    grad.addColorStop(0, 'rgba(3,5,10,0)');
    grad.addColorStop(1, 'rgba(3,5,10,0.55)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Sigil plate, bottom-left
    const plateW = Math.round(w * 0.30);
    const plateH = 64;
    ctx.fillStyle = 'rgba(3,5,10,0.82)';
    ctx.fillRect(14, h - plateH - 14, plateW, plateH);
    ctx.strokeStyle = 'rgba(12,198,255,0.45)';
    ctx.strokeRect(14.5, h - plateH - 13.5, plateW - 1, plateH - 1);

    ctx.fillStyle = '#49e7ff';
    ctx.font = '700 13px ui-monospace, monospace';
    ctx.fillText(projectName.slice(0, 38), 26, h - plateH + 18);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillText(`STARSILK SYSTEM PLANNER · T+${formatSimTime(simTimeSec)}`, 26, h - plateH + 36);

    const svgBlob = new Blob([sigilSvg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, plateW - 54, h - plateH - 6, 46, 46);
      URL.revokeObjectURL(url);
      setDataUrl(off.toDataURL('image/png'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setDataUrl(off.toDataURL('image/png'));
    };
    img.src = url;
  }, [canvas, sigilSvg, projectName, simTimeSec]);

  return (
    <ModalShell title="SYSTEM POSTCARD" subtitle="One frame of this timeline, signed by its sigil" onClose={onClose} width={560}>
      {!dataUrl && <div className="empty-state">Compositing frame…</div>}
      {dataUrl && (
        <>
          <img src={dataUrl} alt="System postcard" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border-subtle)' }} />
          <div style={{ display: 'flex', gap: 10, marginTop: 14, justifyContent: 'flex-end' }}>
            <button className="ui-button" onClick={onDone}>Archive</button>
            <a
              className="ui-button primary"
              href={dataUrl}
              download={`starsilk-postcard-${Date.now()}.png`}
              onClick={() => { audioSynth.playPresetShimmer(); }}
            >
              <Download size={13} /> Download PNG
            </a>
          </div>
        </>
      )}
    </ModalShell>
  );
};
