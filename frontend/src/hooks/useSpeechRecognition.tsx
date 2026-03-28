import { useState, useRef, useCallback } from 'react';

export function useSpeechRecognition(onComplete: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const recognitionRef = useRef<any>(null);
  const shouldListenRef = useRef(false);
  const accumulatedRef = useRef('');

  const startMic = useCallback(() => {
    shouldListenRef.current = true;
    accumulatedRef.current = '';
    setLiveTranscript('');
    setIsListening(true);
    
    // @ts-ignore
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    
    recognition.onresult = (event: any) => {
      let currentInterim = '';
      let currentFinal = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) currentFinal += event.results[i][0].transcript;
        else currentInterim += event.results[i][0].transcript;
      }
      if (currentFinal) accumulatedRef.current += currentFinal + ' ';
      setLiveTranscript(accumulatedRef.current + currentInterim);
    };
    
    recognition.onend = () => { if (shouldListenRef.current) { try { recognition.start(); } catch (e) {} } };
    recognition.start();
    recognitionRef.current = recognition;
  }, []);

  const stopMic = useCallback(() => {
    shouldListenRef.current = false;
    setIsListening(false);
    if (recognitionRef.current) recognitionRef.current.stop();
    const finalMsg = accumulatedRef.current.trim();
    setLiveTranscript('');
    accumulatedRef.current = '';
    if (finalMsg) onComplete(finalMsg);
  }, [onComplete]);

  return { isListening, liveTranscript, startMic, stopMic };
}