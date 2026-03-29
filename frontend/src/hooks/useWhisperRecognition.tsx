import { useState, useRef, useCallback, useEffect } from 'react';

const BACKEND_URL = 'https://backend.biopro.workers.dev';

interface WhisperHookReturn {
  isListening: boolean;
  isTranscribing: boolean;
  liveTranscript: string;
  analyserNode: AnalyserNode | null;
  startMic: () => void;
  stopMic: () => void;
}

export function useWhisperRecognition(
  onComplete: (text: string) => void
): WhisperHookReturn {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      audioContextRef.current?.close();
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const startMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      // ── Waveform analyser setup ──────────────────────────────────────────
      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      setAnalyserNode(analyser);

      // ── MediaRecorder ────────────────────────────────────────────────────
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start(100); // collect chunks every 100ms
      setIsListening(true);
      setLiveTranscript('');
    } catch (err) {
      console.error('Microphone access denied:', err);
    }
  }, []);

  const stopMic = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;

    setIsListening(false);
    setIsTranscribing(true);
    setLiveTranscript('Transcribing...');

    // Stop recording — onstop fires after all chunks are flushed
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.stop();
    });

    // Stop mic tracks & audio context
    streamRef.current?.getTracks().forEach(t => t.stop());
    audioContextRef.current?.close();
    setAnalyserNode(null);

    try {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      const formData = new FormData();
      formData.append('audio', blob, 'recording.webm');

      const res = await fetch(`${BACKEND_URL}/api/transcribe`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      const data = await res.json() as { transcript?: string; error?: string };

      if (data.transcript && data.transcript.length > 0) {
        setLiveTranscript('');
        setIsTranscribing(false);
        onComplete(data.transcript);
      } else {
        setLiveTranscript('No speech detected. Try again.');
        setIsTranscribing(false);
      }
    } catch (err) {
      console.error('Transcription request failed:', err);
      setLiveTranscript('Transcription failed. Try again.');
      setIsTranscribing(false);
    }

    chunksRef.current = [];
  }, [onComplete]);

  return {
    isListening,
    isTranscribing,
    liveTranscript,
    analyserNode,
    startMic,
    stopMic,
  };
}