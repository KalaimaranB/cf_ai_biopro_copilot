import { useEffect, useRef } from 'react';
import { THEME } from '../theme';

interface WaveformProps {
  analyserNode: AnalyserNode | null;
  isListening: boolean;
}

export default function AudioWaveform({ analyserNode, isListening }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    if (!isListening || !analyserNode) {
      // Draw a flat idle line
      ctx.clearRect(0, 0, W, H);
      ctx.beginPath();
      ctx.strokeStyle = THEME.BORDER;
      ctx.lineWidth = 1.5;
      ctx.moveTo(0, H / 2);
      ctx.lineTo(W, H / 2);
      ctx.stroke();
      return;
    }

    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw);
      analyserNode.getByteTimeDomainData(dataArray);

      ctx.clearRect(0, 0, W, H);

      // Glow effect
      ctx.shadowBlur = 8;
      ctx.shadowColor = THEME.ACCENT_PRIMARY;

      ctx.beginPath();
      ctx.strokeStyle = THEME.ACCENT_PRIMARY;
      ctx.lineWidth = 2;

      const sliceWidth = W / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * H) / 2;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);

        x += sliceWidth;
      }

      ctx.lineTo(W, H / 2);
      ctx.stroke();

      // Reset shadow for next frame
      ctx.shadowBlur = 0;
    };

    draw();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [analyserNode, isListening]);

  return (
    <canvas
      ref={canvasRef}
      width={280}
      height={48}
      style={{
        display: 'block',
        borderRadius: '6px',
        backgroundColor: THEME.BG_DARKEST,
        border: `1px solid ${isListening ? THEME.ACCENT_PRIMARY : THEME.BORDER}`,
        transition: 'border-color 0.3s ease',
        boxShadow: isListening ? `0 0 12px ${THEME.ACCENT_PRIMARY}33` : 'none',
      }}
    />
  );
}