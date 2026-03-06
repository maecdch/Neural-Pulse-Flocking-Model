import { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

export type HandState = {
  x: number; // Normalized 0-1
  y: number; // Normalized 0-1
  z: number; // Depth
  gesture: 'open' | 'fist' | 'pinch' | 'point' | 'peace' | 'none';
  velocity: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number }; // Pointing direction
};

export function useHandTracker(enabled: boolean = true, canvasRef?: React.RefObject<HTMLCanvasElement>) {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const handsRef = useRef<HandState[]>([]);
  const prevHandsRef = useRef<Map<number, {x: number, y: number, z: number, time: number}>>(new Map());
  const requestRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;
    let active = true;

    async function init() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
        );

        if (!active) return;

        const landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
        });

        if (!active) return;
        handLandmarkerRef.current = landmarker;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
        });

        if (!active) return;

        const video = document.createElement('video');
        video.srcObject = stream;
        video.playsInline = true;
        video.muted = true;
        video.onloadedmetadata = () => {
          video.play();
          videoRef.current = video;
          setIsReady(true);
          detectHands();
        };
      } catch (err: any) {
        console.error('Hand tracking error:', err);
        setError(err.message || 'Failed to initialize hand tracking');
      }
    }

    init();

    const detectHands = () => {
      if (videoRef.current && handLandmarkerRef.current) {
        const video = videoRef.current;
        const startTimeMs = performance.now();
        
        if (video.currentTime > 0) {
          const results = handLandmarkerRef.current.detectForVideo(video, startTimeMs);
          
          // Draw skeleton if canvas is provided
          if (canvasRef?.current) {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              
              // Mirror the context to match the mirrored video
              ctx.save();
              ctx.scale(-1, 1);
              ctx.translate(-canvas.width, 0);

              if (results.landmarks) {
                for (const landmarks of results.landmarks) {
                  // Draw connections
                  const connections = [
                    [0, 1, 2, 3, 4], // Thumb
                    [0, 5, 6, 7, 8], // Index
                    [0, 9, 10, 11, 12], // Middle
                    [0, 13, 14, 15, 16], // Ring
                    [0, 17, 18, 19, 20], // Pinky
                    [5, 9, 13, 17, 0] // Palm base
                  ];

                  ctx.lineWidth = 2;
                  ctx.strokeStyle = '#00ff00';
                  
                  for (const connection of connections) {
                    ctx.beginPath();
                    for (let i = 0; i < connection.length; i++) {
                      const idx = connection[i];
                      const x = landmarks[idx].x * canvas.width;
                      const y = landmarks[idx].y * canvas.height;
                      if (i === 0) ctx.moveTo(x, y);
                      else ctx.lineTo(x, y);
                    }
                    ctx.stroke();
                  }

                  // Draw points
                  ctx.fillStyle = '#ff0000';
                  for (const point of landmarks) {
                    const x = point.x * canvas.width;
                    const y = point.y * canvas.height;
                    ctx.beginPath();
                    ctx.arc(x, y, 3, 0, 2 * Math.PI);
                    ctx.fill();
                  }
                }
              }
              ctx.restore();
            }
          }

          if (results.landmarks) {
            const currentHands = results.landmarks.map((landmarks, index) => {
              // Calculate center of palm and tips
              const palmCenter = landmarks[0]; // Wrist
              const thumbTip = landmarks[4];
              const indexTip = landmarks[8];
              const middleTip = landmarks[12];
              const ringTip = landmarks[16];
              const pinkyTip = landmarks[20];
              
              const dist = (p1: any, p2: any) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
              
              // Pinch detection
              const pinchDist = dist(thumbTip, indexTip);
              const isPinch = pinchDist < 0.05;
              
              // Open/Closed heuristic
              const indexOpen = dist(indexTip, palmCenter) > 0.3;
              const middleOpen = dist(middleTip, palmCenter) > 0.3;
              const ringOpen = dist(ringTip, palmCenter) > 0.3;
              const pinkyOpen = dist(pinkyTip, palmCenter) > 0.3;
              
              const openCount = [indexOpen, middleOpen, ringOpen, pinkyOpen].filter(Boolean).length;
              
              let gesture: HandState['gesture'] = 'none';
              if (isPinch) gesture = 'pinch';
              else if (openCount >= 3) gesture = 'open';
              else if (openCount === 0) gesture = 'fist';
              else if (indexOpen && middleOpen && !ringOpen && !pinkyOpen) gesture = 'peace';
              else if (indexOpen && !middleOpen && !ringOpen && !pinkyOpen) gesture = 'point';
              
              // Direction from palm to index tip
              const dirX = indexTip.x - palmCenter.x;
              const dirY = indexTip.y - palmCenter.y;
              const dirZ = indexTip.z - palmCenter.z;
              const dirLength = Math.hypot(dirX, dirY, dirZ) || 1;
              
              // Velocity calculation
              let vx = 0, vy = 0, vz = 0;
              const prev = prevHandsRef.current.get(index);
              if (prev) {
                const dt = (startTimeMs - prev.time) / 1000; // seconds
                if (dt > 0 && dt < 0.5) { // Ignore huge time jumps
                  vx = (palmCenter.x - prev.x) / dt;
                  vy = (palmCenter.y - prev.y) / dt;
                  vz = (palmCenter.z - prev.z) / dt;
                }
              }
              prevHandsRef.current.set(index, { 
                x: palmCenter.x, y: palmCenter.y, z: palmCenter.z, time: startTimeMs 
              });
              
              return {
                x: palmCenter.x,
                y: palmCenter.y,
                z: palmCenter.z,
                gesture,
                velocity: { x: vx, y: vy, z: vz },
                direction: { x: dirX / dirLength, y: dirY / dirLength, z: dirZ / dirLength }
              };
            });
            
            // Clear old indices if hands disappeared
            for (let i = currentHands.length; i < 2; i++) {
              prevHandsRef.current.delete(i);
            }
            handsRef.current = currentHands;
          } else {
            handsRef.current = [];
            prevHandsRef.current.clear();
          }
        }
      }
      requestRef.current = requestAnimationFrame(detectHands);
    };

    return () => {
      active = false;
      cancelAnimationFrame(requestRef.current);
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
      if (handLandmarkerRef.current) {
        handLandmarkerRef.current.close();
      }
    };
  }, [enabled]);

  return { isReady, error, handsRef, videoRef };
}
