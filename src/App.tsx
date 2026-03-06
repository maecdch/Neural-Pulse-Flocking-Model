import React, { Suspense, useState, useEffect, useRef, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei';
import { useHandTracker } from './components/useHandTracker';
import { useAudioAnalyzer } from './components/useAudioAnalyzer';
import { Murmuration } from './components/Murmuration';
import { Activity, Mic, Video, AlertCircle, Play, Maximize2, Minimize2, Settings, Camera, Check, MoveDiagonal } from 'lucide-react';

export default function App() {
  const [isStarted, setIsStarted] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(true);
  const [cameraSize, setCameraSize] = useState({ width: 320, height: 240 });
  const cameraContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isResizingRef = useRef(false);
  
  const { isReady: isHandReady, error: handError, handsRef, videoRef } = useHandTracker(isStarted, canvasRef);
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
      setPermissionError(null);
      
      // Request permissions
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      });
      
      // Stop tracks to release device
      stream.getTracks().forEach(track => track.stop());
      
      // Small delay to ensure cleanup
      await new Promise(resolve => setTimeout(resolve, 100));
      
      setIsStarted(true);
    } catch (err: any) {
      console.error('Permission request failed:', err);
      setPermissionError(err.message || 'Permission denied');
      setIsStarted(false);
    }
  };

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isResizingRef.current = true;
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      
      // Calculate new width based on mouse position relative to right edge of screen
      // Since container is bottom-6 right-6 (24px margin)
      const rightMargin = 24;
      const newWidth = window.innerWidth - e.clientX - rightMargin;
      
      // Maintain 4:3 aspect ratio
      const newHeight = newWidth * 0.75;
      
      // Clamp values (min 160px, max 800px)
      if (newWidth >= 160 && newWidth <= 800) {
        setCameraSize({ width: newWidth, height: newHeight });
      }
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

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
        <div className="pointer-events-auto">
          <h1 className="text-3xl font-bold tracking-tighter text-white drop-shadow-md">
            神经脉冲群鸟模型
          </h1>
          <p className="text-zinc-400 mt-2 text-sm max-w-md drop-shadow-sm leading-relaxed">
            受椋鸟群启发的3D粒子模拟。<br/>
            • <b>张开手</b>：驱散鸟群<br/>
            • <b>握拳</b>：形成漩涡<br/>
            • <b>捏合</b>：精准吸引<br/>
            • <b>食指指引</b>：引导飞行方向<br/>
            • <b>胜利手势</b>：分群盘旋
          </p>
        </div>

        {/* Status Indicators & Settings */}
        <div className="flex flex-col gap-3 items-end pointer-events-auto">
          <SettingsPanel isStarted={isStarted} onStart={handleStart} permissionError={permissionError} />
          
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
        <div 
          className={`absolute bottom-6 right-6 z-20 transition-all duration-75 ease-out ${!showCamera ? 'opacity-50 hover:opacity-100' : 'opacity-100'}`}
          style={{
            width: showCamera ? cameraSize.width : 40,
            height: showCamera ? cameraSize.height : 40,
          }}
        >
          <div className="relative w-full h-full bg-zinc-900 rounded-xl border border-zinc-800 shadow-2xl overflow-hidden group">
            <div ref={cameraContainerRef} className={`w-full h-full ${showCamera ? 'block' : 'hidden'}`} />
            <canvas 
              ref={canvasRef} 
              width={640} 
              height={480} 
              className={`absolute top-0 left-0 w-full h-full pointer-events-none ${showCamera ? 'block' : 'hidden'}`} 
            />
            
            {/* Resize Handle */}
            {showCamera && (
              <div 
                className="absolute top-0 left-0 p-2 cursor-nwse-resize opacity-0 group-hover:opacity-100 transition-opacity z-40 text-white/70 hover:text-white"
                onMouseDown={startResizing}
                title="拖拽调整大小"
              >
                <MoveDiagonal size={20} className="rotate-90" />
              </div>
            )}

            <button 
              onClick={() => setShowCamera(!showCamera)}
              className="absolute top-2 right-2 p-1.5 bg-black/50 backdrop-blur-md rounded-lg text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto z-30"
              title={showCamera ? "最小化" : "展开"}
            >
              {showCamera ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            
            {!showCamera && (
              <div className="w-full h-full flex items-center justify-center text-zinc-500 cursor-pointer" onClick={() => setShowCamera(true)}>
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

function SettingsPanel({ isStarted, onStart, permissionError }: { isStarted: boolean, onStart: () => void, permissionError: string | null }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 p-2.5 rounded-full backdrop-blur-md border border-zinc-700 shadow-lg transition-all group mb-2"
        title="权限设置"
      >
        <Settings size={20} className="group-hover:rotate-90 transition-transform duration-500" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-12 bg-zinc-900/95 border border-zinc-700 rounded-2xl p-4 w-72 backdrop-blur-xl shadow-2xl animate-in fade-in slide-in-from-top-2 z-50">
          <h3 className="text-white font-bold mb-4 flex items-center gap-2 border-b border-zinc-800 pb-2">
            <Camera size={18} className="text-emerald-400" />
            设备权限设置
          </h3>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">摄像头与麦克风</span>
              {isStarted && !permissionError ? (
                <span className="text-emerald-400 font-medium flex items-center gap-1 bg-emerald-950/30 px-2 py-1 rounded-md border border-emerald-900/50">
                  <Check size={12} /> 已授权
                </span>
              ) : (
                <span className="text-zinc-500 font-medium bg-zinc-800/50 px-2 py-1 rounded-md border border-zinc-700">未授权</span>
              )}
            </div>

            {!isStarted && (
              <button 
                onClick={() => {
                  onStart();
                }}
                className="w-full bg-white text-black hover:bg-zinc-200 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"
              >
                <Play size={14} fill="currentColor" />
                开启摄像头权限
              </button>
            )}

            {permissionError && (
              <div className="bg-red-950/50 border border-red-900/50 p-3 rounded-xl text-xs text-red-200 leading-relaxed">
                <div className="flex items-center gap-2 font-bold mb-1 text-red-400">
                  <AlertCircle size={12} />
                  <span>权限获取失败</span>
                </div>
                {permissionError === 'Permission denied' || permissionError.includes('denied')
                  ? '浏览器拒绝了访问。请点击地址栏左侧的“设置”或“锁”图标，允许使用摄像头和麦克风，然后刷新页面。' 
                  : permissionError}
              </div>
            )}
            
            <p className="text-[10px] text-zinc-500 leading-tight">
              * 我们需要摄像头来识别手势，麦克风来响应声音。数据仅在本地处理。
            </p>
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

