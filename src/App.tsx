import React, { Suspense, useState, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei';
import { useHandTracker } from './components/useHandTracker';
import { useAudioAnalyzer } from './components/useAudioAnalyzer';
import { Murmuration } from './components/Murmuration';
import { Activity, Mic, Video, AlertCircle, Play, Maximize2, Minimize2 } from 'lucide-react';

export default function App() {
  const [isStarted, setIsStarted] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(true);
  const cameraContainerRef = useRef<HTMLDivElement>(null);
  
  const { isReady: isHandReady, error: handError, handsRef, videoRef } = useHandTracker(isStarted);
  const { isReady: isAudioReady, error: audioError, volumeRef } = useAudioAnalyzer(isStarted);

  useEffect(() => {
    if (isHandReady && videoRef.current && cameraContainerRef.current) {
      const video = videoRef.current;
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.objectFit = 'cover';
      video.style.transform = 'scaleX(-1)'; // Mirror for user
      cameraContainerRef.current.innerHTML = '';
      cameraContainerRef.current.appendChild(video);
    }
  }, [isHandReady, videoRef]);

  const handleStart = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      });
      
      stream.getTracks().forEach(track => track.stop());
      
      setPermissionError(null);
      setIsStarted(true);
    } catch (err: any) {
      console.error('Permission request failed:', err);
      setPermissionError(err.message || 'Permission denied');
    }
  };

  const activeError = permissionError || handError || audioError;

  return (
    <div className="w-full h-screen bg-zinc-950 text-zinc-100 overflow-hidden relative font-sans">
      {/* 3D Canvas */}
      <div className="absolute inset-0 z-0">
        <Canvas camera={{ position: [0, 0, 15], fov: 60 }}>
          <color attach="background" args={['#09090b']} />
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 5]} intensity={1} />
          <Suspense fallback={null}>
            <Environment preset="city" />
            <Murmuration handsRef={handsRef} volumeRef={volumeRef} />
            <ContactShadows position={[0, -10, 0]} opacity={0.4} scale={50} blur={2} far={20} />
          </Suspense>
          <OrbitControls 
            enablePan={false} 
            enableZoom={true} 
            minDistance={5} 
            maxDistance={30} 
            autoRotate 
            autoRotateSpeed={0.5} 
          />
        </Canvas>
      </div>

      {/* UI Overlay */}
      <div className="absolute top-0 left-0 w-full p-6 z-10 pointer-events-none flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tighter text-white drop-shadow-md">
            神经脉冲群鸟模型
          </h1>
          <p className="text-zinc-400 mt-2 text-sm max-w-md drop-shadow-sm leading-relaxed">
            受椋鸟群启发的3D粒子模拟。<br/>
            • <b>张开手</b>：驱散鸟群<br/>
            • <b>握拳</b>：形成漩涡<br/>
            • <b>捏合（拇指+食指）</b>：精准吸引<br/>
            • <b>挥动手臂</b>：产生风场扰动
          </p>
        </div>

        {/* Status Indicators */}
        <div className="flex flex-col gap-3 items-end">
          <StatusBadge 
            icon={<Video size={16} />} 
            label="手势追踪" 
            isReady={isHandReady} 
            error={handError} 
          />
          <StatusBadge 
            icon={<Mic size={16} />} 
            label="音频感应" 
            isReady={isAudioReady} 
            error={audioError} 
          />
          <StatusBadge 
            icon={<Activity size={16} />} 
            label="AI 引擎" 
            isReady={true} 
            error={null} 
          />
        </div>
      </div>
      
      {/* Camera Preview */}
      {isStarted && isHandReady && (
        <div className={`absolute bottom-6 right-6 z-20 transition-all duration-300 ${showCamera ? 'w-48 h-36 opacity-100' : 'w-10 h-10 opacity-50 hover:opacity-100'}`}>
          <div className="relative w-full h-full bg-zinc-900 rounded-xl border border-zinc-800 shadow-2xl overflow-hidden group">
            <div ref={cameraContainerRef} className={`w-full h-full ${showCamera ? 'block' : 'hidden'}`} />
            
            <button 
              onClick={() => setShowCamera(!showCamera)}
              className="absolute top-2 right-2 p-1.5 bg-black/50 backdrop-blur-md rounded-lg text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto"
            >
              {showCamera ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            
            {!showCamera && (
              <div className="w-full h-full flex items-center justify-center text-zinc-500">
                <Video size={18} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Interaction Hint / Start Button */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 text-center">
        {!isStarted ? (
          <button 
            onClick={handleStart}
            className="bg-white text-black hover:bg-zinc-200 px-8 py-4 rounded-full font-bold shadow-2xl transition-all transform hover:scale-105 active:scale-95 flex items-center gap-3 pointer-events-auto"
          >
            <Play size={20} fill="currentColor" />
            开始体验
          </button>
        ) : (
          <div className="bg-zinc-900/80 backdrop-blur-md border border-zinc-800 rounded-full px-6 py-3 text-sm text-zinc-300 shadow-xl flex items-center gap-3 pointer-events-none">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            将手展示给摄像头以进行交互
          </div>
        )}
      </div>

      {/* Error Overlay */}
      {activeError && (
        <div className="absolute top-24 left-6 z-20 max-w-sm pointer-events-auto">
          <div className="bg-red-950/80 border border-red-900/50 p-4 rounded-2xl backdrop-blur-md shadow-2xl">
            <div className="flex items-center gap-2 text-red-400 font-bold mb-2">
              <AlertCircle size={18} />
              <span>需要权限</span>
            </div>
            <p className="text-xs text-red-200/70 leading-relaxed">
              此体验需要访问摄像头和麦克风。请确保您已在浏览器设置中授予权限并重试。
              {activeError === 'Permission denied' && (
                <span className="block mt-2 font-semibold">
                  提示：查看浏览器地址栏中的摄像头/麦克风图标以重置权限。
                </span>
              )}
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="mt-3 text-xs font-bold text-white underline underline-offset-4 hover:text-red-300"
            >
              重新加载页面
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ icon, label, isReady, error }: { icon: React.ReactNode, label: string, isReady: boolean, error: string | null }) {
  if (error) {
    return (
      <div className="flex items-center gap-2 bg-red-950/50 border border-red-900/50 text-red-400 px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-sm">
        <AlertCircle size={14} />
        <span>{label} 错误</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-sm border transition-colors ${
      isReady 
        ? 'bg-emerald-950/30 border-emerald-900/50 text-emerald-400' 
        : 'bg-zinc-900/50 border-zinc-800 text-zinc-400'
    }`}>
      {icon}
      <span>{label}: {isReady ? '已激活' : '初始化中...'}</span>
    </div>
  );
}

