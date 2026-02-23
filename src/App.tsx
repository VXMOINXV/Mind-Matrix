import React, { useState, useRef, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shield, 
  AlertTriangle, 
  Activity, 
  Eye, 
  Smartphone, 
  User, 
  Settings, 
  History,
  Terminal,
  Camera,
  LogOut,
  ChevronRight,
  Zap,
  Cpu
} from 'lucide-react';
import { io } from 'socket.io-client';
import { analyzeFrame, AnalysisResult } from './services/geminiService';
import { cn } from './lib/utils';
import { format } from 'date-fns';

const socket = io();

// --- Components ---

const StatCard = ({ icon: Icon, label, value, color }: any) => (
  <div className="glass-panel p-4 flex items-center gap-4">
    <div className={cn("p-3 rounded-xl", color)}>
      <Icon className="w-6 h-6 text-white" />
    </div>
    <div>
      <p className="text-xs text-white/50 uppercase tracking-wider">{label}</p>
      <p className="text-xl font-bold font-mono">{value}</p>
    </div>
  </div>
);

const LogItem = ({ log }: any) => (
  <motion.div 
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    className="flex items-start gap-3 p-3 border-b border-white/5 last:border-0"
  >
    <div className={cn(
      "w-2 h-2 mt-2 rounded-full",
      log.severity === 'high' ? 'bg-neon-red shadow-[0_0_8px_#ff003c]' : 
      log.severity === 'medium' ? 'bg-yellow-500' : 'bg-neon-blue'
    )} />
    <div className="flex-1">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs font-mono text-white/40">{format(new Date(log.timestamp), 'HH:mm:ss')}</span>
        <span className={cn(
          "text-[10px] px-1.5 py-0.5 rounded uppercase font-bold",
          log.severity === 'high' ? 'bg-neon-red/20 text-neon-red' : 'bg-white/10 text-white/60'
        )}>{log.type}</span>
      </div>
      <p className="text-sm text-white/80">{log.message}</p>
    </div>
  </motion.div>
);

// --- Main App ---

export default function App() {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [suspicionScore, setSuspicionScore] = useState(0);
  const [currentBehaviors, setCurrentBehaviors] = useState<string[]>([]);
  const [isPhoneDetected, setIsPhoneDetected] = useState(false);
  const [confidence, setConfidence] = useState(0);
  const [activeStudent, setActiveStudent] = useState({ name: "Moinuddin Islam", id: "CTS-2024-001" });
  
  const webcamRef = useRef<Webcam>(null);
  const analysisTimerRef = useRef<any>(null);

  useEffect(() => {
    fetch('/api/logs').then(res => res.json()).then(setLogs);
    
    socket.on('new_log', (log) => {
      setLogs(prev => [log, ...prev].slice(0, 50));
    });

    return () => {
      socket.off('new_log');
      if (analysisTimerRef.current) clearInterval(analysisTimerRef.current);
    };
  }, []);

  const triggerAlert = useCallback(async (result: AnalysisResult, screenshot: string) => {
    if (result.suspicionScore > 30) {
      await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: activeStudent.id,
          type: result.isPhoneDetected ? 'PHONE' : 'BEHAVIOR',
          severity: result.suspicionScore > 60 ? 'high' : 'medium',
          message: result.behaviors.join(', '),
          evidence_data: screenshot
        })
      });
    }
  }, [activeStudent]);

  const runAnalysis = useCallback(async () => {
    if (!webcamRef.current) return;
    const screenshot = webcamRef.current.getScreenshot();
    if (!screenshot) return;

    const result = await analyzeFrame(screenshot);
    setSuspicionScore(result.suspicionScore);
    setCurrentBehaviors(result.behaviors);
    setIsPhoneDetected(result.isPhoneDetected);
    setConfidence(result.confidence);

    if (result.suspicionScore > 30) {
      triggerAlert(result, screenshot);
    }
  }, [triggerAlert]);

  useEffect(() => {
    if (isMonitoring) {
      analysisTimerRef.current = setInterval(runAnalysis, 3000); // Analyze every 3 seconds
    } else {
      if (analysisTimerRef.current) clearInterval(analysisTimerRef.current);
    }
  }, [isMonitoring, runAnalysis]);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#050505] selection:bg-neon-blue/30">
      {/* Header */}
      <header className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-black/50 backdrop-blur-md z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-neon-blue rounded-lg flex items-center justify-center shadow-[0_0_20px_rgba(0,243,255,0.4)]">
            <Shield className="text-black w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tighter neon-text">MINDMATRIX AI PROCTOR X</h1>
            <p className="text-[10px] text-white/40 uppercase tracking-[0.2em]">Let's Hack the Future</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
            <div className={cn("w-2 h-2 rounded-full animate-pulse", isMonitoring ? "bg-green-500" : "bg-red-500")} />
            <span className="text-xs font-mono uppercase tracking-widest">
              {isMonitoring ? "System Live" : "System Standby"}
            </span>
          </div>
          <button 
            onClick={() => setIsMonitoring(!isMonitoring)}
            className={cn(
              "px-6 py-2 rounded-full font-bold text-xs uppercase tracking-widest transition-all",
              isMonitoring 
                ? "bg-neon-red/20 text-neon-red border border-neon-red/50 hover:bg-neon-red/30" 
                : "bg-neon-blue text-black hover:scale-105 active:scale-95"
            )}
          >
            {isMonitoring ? "Stop Monitoring" : "Start Monitoring"}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden p-6 gap-6">
        {/* Left Sidebar - Student Info */}
        <div className="w-80 flex flex-col gap-6">
          <div className="glass-panel p-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-neon-blue/50" />
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden">
                <User className="w-8 h-8 text-white/20" />
              </div>
              <div>
                <h2 className="font-bold text-lg leading-tight">{activeStudent.name}</h2>
                <p className="text-xs text-white/40 font-mono">{activeStudent.id}</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <span className="text-xs text-white/40 uppercase">Suspicion Level</span>
                <span className={cn(
                  "text-2xl font-mono font-bold",
                  suspicionScore > 60 ? "text-neon-red" : suspicionScore > 30 ? "text-yellow-500" : "text-neon-blue"
                )}>{suspicionScore}%</span>
              </div>
              <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${suspicionScore}%` }}
                  className={cn(
                    "h-full transition-colors duration-500",
                    suspicionScore > 60 ? "bg-neon-red" : suspicionScore > 30 ? "bg-yellow-500" : "bg-neon-blue"
                  )}
                />
              </div>
            </div>
          </div>

          <div className="flex-1 glass-panel flex flex-col overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-neon-blue" />
                <span className="text-xs font-bold uppercase tracking-widest">Live Logs</span>
              </div>
              <Activity className="w-4 h-4 text-white/20 animate-pulse" />
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {logs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-white/20 p-8 text-center">
                  <History className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-xs uppercase tracking-widest">No logs recorded</p>
                </div>
              ) : (
                logs.map((log, i) => <LogItem key={i} log={log} />)
              )}
            </div>
          </div>
        </div>

        {/* Center - Camera Feed */}
        <div className="flex-1 flex flex-col gap-6">
          <div className="flex-1 glass-panel relative overflow-hidden group">
            <div className="absolute inset-0 bg-black" />
            
            {/* Camera View */}
            <div className="absolute inset-0 flex items-center justify-center">
              {isMonitoring ? (
                <div className="relative w-full h-full">
                  <Webcam
                    ref={webcamRef}
                    audio={false}
                    screenshotFormat="image/png"
                    className="w-full h-full object-cover opacity-80"
                    videoConstraints={{ facingMode: "user" }}
                    mirrored={false}
                    imageSmoothing={true}
                    disablePictureInPicture={true}
                    forceScreenshotSourceSize={false}
                    onUserMedia={() => {}}
                    onUserMediaError={() => {}}
                    screenshotQuality={0.92}
                  />
                  <div className="scanline" />
                  
                  {/* HUD Overlays */}
                  <div className="absolute top-6 left-6 flex flex-col gap-2">
                    <div className="flex items-center gap-2 px-3 py-1 bg-black/60 backdrop-blur-md border border-white/10 rounded text-[10px] font-mono text-neon-blue">
                      <div className="w-1.5 h-1.5 rounded-full bg-neon-blue animate-ping" />
                      REC [LIVE_FEED_01]
                    </div>
                    <div className="px-3 py-1 bg-black/60 backdrop-blur-md border border-white/10 rounded text-[10px] font-mono text-white/60">
                      RES: 1920x1080 @ 30FPS
                    </div>
                  </div>

                  <div className="absolute bottom-6 right-6 flex flex-col items-end gap-2">
                    <div className="px-3 py-1 bg-black/60 backdrop-blur-md border border-white/10 rounded text-[10px] font-mono text-white/60">
                      AI_CONF: {(confidence * 100).toFixed(1)}%
                    </div>
                    <div className="px-3 py-1 bg-black/60 backdrop-blur-md border border-white/10 rounded text-[10px] font-mono text-white/60">
                      LATENCY: 42ms
                    </div>
                  </div>

                  {/* Detection Bounding Box Simulation */}
                  <AnimatePresence>
                    {suspicionScore > 30 && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        className={cn(
                          "absolute inset-[20%] border-2 pointer-events-none",
                          suspicionScore > 60 ? "border-neon-red shadow-[0_0_30px_rgba(255,0,60,0.3)]" : "border-yellow-500"
                        )}
                      >
                        <div className={cn(
                          "absolute -top-8 left-0 px-2 py-1 text-[10px] font-bold uppercase",
                          suspicionScore > 60 ? "bg-neon-red text-white" : "bg-yellow-500 text-black"
                        )}>
                          {suspicionScore > 60 ? "WARNING: CHEATING DETECTED" : "SUSPICIOUS ACTIVITY"}
                        </div>
                        {/* Corner Accents */}
                        <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-inherit" />
                        <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-inherit" />
                        <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-inherit" />
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-inherit" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 text-white/20">
                  <div className="w-20 h-20 rounded-full border-2 border-dashed border-white/10 flex items-center justify-center">
                    <Camera className="w-8 h-8" />
                  </div>
                  <p className="text-xs uppercase tracking-[0.3em]">Camera Offline</p>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Stats */}
          <div className="grid grid-cols-4 gap-6">
            <StatCard 
              icon={Eye} 
              label="Gaze Status" 
              value={currentBehaviors.includes("Looking down") ? "DOWNWARD" : "CENTERED"} 
              color="bg-neon-blue/20" 
            />
            <StatCard 
              icon={Smartphone} 
              label="Object Detection" 
              value={isPhoneDetected ? "PHONE DETECTED" : "CLEAR"} 
              color={isPhoneDetected ? "bg-neon-red/20" : "bg-white/10"} 
            />
            <StatCard 
              icon={Activity} 
              label="Stress Level" 
              value={suspicionScore > 50 ? "HIGH" : "NORMAL"} 
              color="bg-neon-purple/20" 
            />
            <StatCard 
              icon={Cpu} 
              label="AI Engine" 
              value="GEMINI 2.5" 
              color="bg-emerald-500/20" 
            />
          </div>
        </div>

        {/* Right Sidebar - System Info */}
        <div className="w-80 flex flex-col gap-6">
          <div className="glass-panel p-6">
            <h3 className="text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
              <Settings className="w-4 h-4 text-white/40" />
              System Parameters
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-white/40 uppercase">Face Recognition</span>
                <span className="text-[10px] font-mono text-emerald-500">ACTIVE</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-white/40 uppercase">Object Tracking</span>
                <span className="text-[10px] font-mono text-emerald-500">ACTIVE</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-white/40 uppercase">Audio Analysis</span>
                <span className="text-[10px] font-mono text-white/20">DISABLED</span>
              </div>
              <div className="pt-4 border-t border-white/5">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] text-white/40 uppercase">CPU Load</span>
                  <span className="text-[10px] font-mono">14%</span>
                </div>
                <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full w-[14%] bg-neon-blue" />
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 glass-panel p-6 flex flex-col">
            <h3 className="text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
              <Zap className="w-4 h-4 text-neon-purple" />
              Developer Info
            </h3>
            <div className="space-y-4 text-xs">
              <div>
                <p className="text-white/40 uppercase text-[9px] mb-1">Created By</p>
                <p className="font-bold">Md Moinuddin Islam</p>
                <p className="text-white/60">Dept: CST | Sem: 1st</p>
              </div>
              <div>
                <p className="text-white/40 uppercase text-[9px] mb-1">Idea By</p>
                <p className="font-bold">Suman Dutta</p>
              </div>
              <div>
                <p className="text-white/40 uppercase text-[9px] mb-1">Institution</p>
                <p className="font-bold">The Calcutta Technical School</p>
              </div>
            </div>
            
            <div className="mt-auto pt-6">
              <button className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-[10px] font-bold uppercase tracking-widest hover:bg-white/10 transition-colors flex items-center justify-center gap-2">
                <LogOut className="w-3 h-3" />
                Exit System
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer / Status Bar */}
      <footer className="h-8 border-t border-white/10 bg-black/80 flex items-center justify-between px-6 text-[9px] font-mono text-white/30 uppercase tracking-[0.2em]">
        <div className="flex gap-6">
          <span>SYSTEM_ID: MMX-PROCTOR-001</span>
          <span>LOCATION: EXAM_HALL_A</span>
        </div>
        <div className="flex gap-6">
          <span>{new Date().toLocaleDateString()}</span>
          <span className="text-neon-blue">ENCRYPTED_CONNECTION_SECURE</span>
        </div>
      </footer>
    </div>
  );
}
