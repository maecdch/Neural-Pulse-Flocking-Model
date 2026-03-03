import { useEffect, useRef, useState } from 'react';

export function useAudioAnalyzer(enabled: boolean = true) {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const volumeRef = useRef<number>(0);
  const requestRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let audioContext: AudioContext;
    let analyser: AnalyserNode;
    let microphone: MediaStreamAudioSourceNode;

    async function init() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!active) return;

        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;

        microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const updateVolume = () => {
          if (!active) return;
          analyser.getByteFrequencyData(dataArray);
          
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const average = sum / dataArray.length;
          // Normalize volume to 0-1 (approximate max is ~128 for normal speech)
          volumeRef.current = Math.min(1, average / 128);
          
          requestRef.current = requestAnimationFrame(updateVolume);
        };

        setIsReady(true);
        updateVolume();
      } catch (err: any) {
        console.error('Audio analyzer error:', err);
        setError(err.message || 'Failed to initialize audio');
      }
    }

    init();

    return () => {
      active = false;
      cancelAnimationFrame(requestRef.current);
      if (audioContext) {
        audioContext.close();
      }
    };
  }, [enabled]);

  return { isReady, error, volumeRef };
}
