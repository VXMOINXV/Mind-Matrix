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
  Cpu,
  Users,
  Hand,
  Video,
  Sparkles,
  X
} from 'lucide-react';
import { aiService } from './services/aiService';
import { StudentState } from './services/suspicionEngine';
import { generateProctorReport } from './services/geminiService';
import { cn } from './lib/utils';
import { format } from 'date-fns';
import Markdown from 'react-markdown';

// --- Sound Alert ---
const playAlertSound = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    
    const audioContext = new AudioContextClass();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // A4
    oscillator.frequency.exponentialRampToValueAtTime(880, audioContext.currentTime + 0.1);
    
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.5);
  } catch (err) {
    console.error("Failed to play alert sound:", err);
  }
};

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
      {log.evidence_video && (
        <a href={log.evidence_video} download="evidence.webm" className="mt-2 inline-flex items-center gap-1 text-[10px] text-neon-blue hover:underline">
          <Video className="w-3 h-3" /> View Recording
        </a>
      )}
    </div>
  </motion.div>
);

// --- Main App ---

export default function App() {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [students, setStudents] = useState<StudentState[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analysisTimerRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    const initAI = async () => {
      try {
        await aiService.initialize();
      } catch (err: any) {
        setInitError(err.message || String(err));
      } finally {
        setIsModelLoading(false);
      }
    };
    initAI();
  }, []);

  useEffect(() => {
    try {
      const savedLogs = localStorage.getItem('proctor_logs');
      if (savedLogs) {
        const parsed = JSON.parse(savedLogs);
        if (Array.isArray(parsed)) {
          setLogs(parsed);
        } else {
          localStorage.removeItem('proctor_logs');
        }
      }
    } catch (err) {
      console.error("Failed to parse saved logs:", err);
      localStorage.removeItem('proctor_logs');
    }
  }, []);

  const addLog = useCallback((log: any) => {
    setLogs(prev => {
      const newLogs = [log, ...prev].slice(0, 50);
      try {
        // Strip large base64 strings and blob URLs before saving to localStorage
        const logsToSave = newLogs.map(l => ({
          ...l,
          evidence_data: undefined,
          evidence_video: undefined
        }));
        localStorage.setItem('proctor_logs', JSON.stringify(logsToSave));
      } catch (err) {
        console.error("Failed to save logs to localStorage:", err);
      }
      return newLogs;
    });
  }, []);

  const startRecording = useCallback(() => {
    if (webcamRef.current && webcamRef.current.stream && !isRecording) {
      setIsRecording(true);
      recordedChunksRef.current = [];
      mediaRecorderRef.current = new MediaRecorder(webcamRef.current.stream, {
        mimeType: "video/webm"
      });
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        setIsRecording(false);
        // Attach video to the last high severity log or create a new one
        addLog({
          student_id: "SYSTEM",
          type: "EVIDENCE",
          severity: "high",
          message: "Auto-recording saved for suspicious activity.",
          timestamp: new Date().toISOString(),
          evidence_video: url
        });
      };

      mediaRecorderRef.current.start();
      setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      }, 5000); // Record for 5 seconds
    }
  }, [isRecording, addLog]);

  const triggerAlert = useCallback(async (student: StudentState, screenshot: string | null) => {
    if (student.suspicionScore > 30) {
      // Play sound for high suspicion
      if (student.suspicionScore > 60) {
        playAlertSound();
        if (!isRecording) {
          startRecording();
        }
      }

      addLog({
        student_id: student.id,
        type: student.behaviors.includes('Phone detected') ? 'PHONE' : 'BEHAVIOR',
        severity: student.suspicionScore > 60 ? 'high' : 'medium',
        message: `${student.id}: ${student.behaviors.join(', ')}`,
        timestamp: new Date().toISOString(),
        evidence_data: screenshot
      });
    }
  }, [addLog, isRecording, startRecording]);

  const runAnalysis = useCallback(async () => {
    if (!webcamRef.current || !webcamRef.current.video || !isMonitoring) return;

    const video = webcamRef.current.video;
    if (video.readyState !== 4 || video.videoWidth === 0) return;

    // Ensure video element has width and height attributes set for TFJS
    if (video.width !== video.videoWidth) {
      video.width = video.videoWidth;
      video.height = video.videoHeight;
    }

    try {
      const { students: newStudents } = await aiService.processFrame(video);
      setStudents(newStudents);

      // Draw bounding boxes
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          if (canvasRef.current.width !== video.videoWidth) {
            canvasRef.current.width = video.videoWidth;
            canvasRef.current.height = video.videoHeight;
          }
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

          newStudents.forEach(student => {
            const { x, y, width, height } = student.bbox;
            const desk = student.deskZone;
            
            // Draw Desk Zone
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(desk.x, desk.y, desk.width, desk.height);
            ctx.setLineDash([]);
            
            // Set color based on status
            if (student.status === 'Cheating Alert') ctx.strokeStyle = '#ef4444'; // Red
            else if (student.status === 'Suspicious') ctx.strokeStyle = '#f59e0b'; // Amber
            else if (student.status === 'Watch') ctx.strokeStyle = '#eab308'; // Yellow
            else ctx.strokeStyle = '#00f3ff'; // Neon Blue

            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, width, height);

            // Draw ID
            ctx.fillStyle = ctx.strokeStyle;
            ctx.font = '16px Inter';
            ctx.fillText(`${student.id} (${student.suspicionScore.toFixed(0)})`, x, y > 20 ? y - 5 : y + 20);
          });
        }
      }

      // Check each student for alerts
      newStudents.forEach(student => {
        if (student.status === 'Cheating Alert' || student.status === 'Suspicious') {
          // Check if we already logged this recently to avoid spam
          setLogs(prev => {
            const recentLog = prev.find(l => l.student_id === student.id && l.message.includes(student.behaviors[0]) && (Date.now() - new Date(l.timestamp).getTime() < 5000));
            if (recentLog) return prev;
            
            const screenshot = webcamRef.current?.getScreenshot() || null;
            triggerAlert(student, screenshot);
            return prev;
          });
        }
      });

    } catch (error) {
      console.error("Analysis error:", error);
    }
  }, [isMonitoring, triggerAlert]);

  useEffect(() => {
    if (isMonitoring) {
      // Run analysis
      analysisTimerRef.current = setInterval(runAnalysis, 500); 
    } else {
      if (analysisTimerRef.current) clearInterval(analysisTimerRef.current);
      setStudents([]); // Clear students when stopped
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
  }, [isMonitoring, runAnalysis]);

  const handleGenerateReport = async () => {
    setIsGeneratingReport(true);
    const report = await generateProctorReport(logs);
    setAiReport(report);
    setIsGeneratingReport(false);
  };

  // Derived stats
  const activeAlerts = students.filter(s => s.suspicionScore > 60).length;
  const objectPassingDetected = students.some(s => s.behaviors.includes('Proximity alert / Possible talking'));

  return (
    <div className="h-screen w-screen flex flex-col bg-[#050505] selection:bg-neon-blue/30">
      {/* AI Report Modal */}
      <AnimatePresence>
        {aiReport && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-[#111] border border-neon-blue/30 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden shadow-[0_0_50px_rgba(0,243,255,0.1)]"
            >
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-black/50">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-neon-blue" />
                  <h2 className="font-bold text-neon-blue uppercase tracking-widest text-sm">Gemini AI Proctor Report</h2>
                </div>
                <button onClick={() => setAiReport(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <X className="w-5 h-5 text-white/50" />
                </button>
              </div>
              <div className="p-6 overflow-y-auto custom-scrollbar text-sm text-white/80 prose prose-invert prose-p:leading-relaxed prose-pre:bg-black/50">
                <div className="markdown-body">
                  <Markdown>{aiReport}</Markdown>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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

        <div className="hidden md:flex flex-col items-center justify-center flex-1 mx-8 text-center">
          <p className="text-xs text-neon-blue font-mono font-bold uppercase tracking-wider">Institution: The Calcutta Technical School</p>
          <div className="flex gap-4 text-[10px] text-white/60 font-mono mt-0.5">
            <span>Created By: Md Moinuddin Islam (Dept: CST, Sem: 1st)</span>
            <span className="text-white/30">|</span>
            <span>Idea By: Suman Dutta</span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {initError && (
            <div className="text-xs text-neon-red font-mono max-w-xs truncate" title={initError}>
              AI Error: {initError}
            </div>
          )}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
            <div className={cn("w-2 h-2 rounded-full animate-pulse", isModelLoading ? "bg-yellow-500" : initError ? "bg-red-500" : isMonitoring ? "bg-green-500" : "bg-red-500")} />
            <span className="text-xs font-mono uppercase tracking-widest">
              {isModelLoading ? "Initializing AI..." : initError ? "AI Failed" : isMonitoring ? "System Live" : "System Standby"}
            </span>
          </div>
          <button 
            onClick={() => setIsMonitoring(!isMonitoring)}
            disabled={isModelLoading || !!initError}
            className={cn(
              "px-6 py-2 rounded-full font-bold text-xs uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed",
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
        {/* Left Sidebar - Student List */}
        <div className="w-80 flex flex-col gap-6">
          <div className="glass-panel p-6 relative overflow-hidden flex-1">
            <h3 className="text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
              <Users className="w-4 h-4 text-white/40" />
              Tracked Students ({students.length})
            </h3>
            
            <div className="space-y-4 overflow-y-auto h-[calc(100%-2rem)] custom-scrollbar">
              {students.length === 0 && isMonitoring && (
                <div className="text-center text-white/20 py-10">
                  <Activity className="w-8 h-8 mx-auto mb-2 animate-pulse" />
                  <p className="text-[10px] uppercase">Scanning...</p>
                </div>
              )}
              
              {students.map((student) => {
                return (
                <div key={student.id} className={cn(
                  "p-3 rounded-xl border transition-all",
                  student.suspicionScore > 60 ? "bg-neon-red/10 border-neon-red/50" : "bg-white/5 border-white/10"
                )}>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-bold text-sm">{student.id}</h4>
                      <p className="text-[10px] text-white/40 font-mono">{student.status}</p>
                    </div>
                    <span className={cn(
                      "text-xs font-mono font-bold",
                      student.suspicionScore > 60 ? "text-neon-red" : "text-neon-blue"
                    )}>{student.suspicionScore.toFixed(0)}%</span>
                  </div>
                  
                  <div className="flex flex-wrap gap-1">
                    {student.behaviors.map((b, i) => (
                      <span key={i} className="text-[9px] px-1.5 py-0.5 bg-black/40 rounded text-white/70">
                        {b}
                      </span>
                    ))}
                  </div>
                </div>
              )})}
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
                <div className="relative w-full h-full bg-black">
                  {cameraError && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-50">
                      <AlertTriangle className="w-12 h-12 text-neon-red mb-4" />
                      <p className="text-neon-red font-bold text-center px-4">{cameraError}</p>
                      <p className="text-white/50 text-xs mt-2">Please check your camera permissions or connect a camera.</p>
                    </div>
                  )}
                  <Webcam
                    ref={webcamRef}
                    audio={false}
                    screenshotFormat="image/png"
                    className="w-full h-full object-cover"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    videoConstraints={{ facingMode: "user" }}
                    mirrored={false}
                    imageSmoothing={true}
                    disablePictureInPicture={true}
                    forceScreenshotSourceSize={false}
                    onUserMedia={() => setCameraError(null)}
                    onUserMediaError={(err: string | DOMException) => {
                      console.error("Camera error:", err);
                      setCameraError(typeof err === 'string' ? err : err.message || "Failed to access camera");
                    }}
                    screenshotQuality={0.92}
                  />
                  <canvas 
                    ref={canvasRef}
                    className="absolute inset-0 w-full h-full pointer-events-none"
                    style={{ objectFit: 'cover' }}
                  />
                  <div className="scanline" />
                  
                  {/* HUD Overlays */}
                  <div className="absolute top-6 left-6 flex flex-col gap-2">
                    <div className="flex items-center gap-2 px-3 py-1 bg-black/60 backdrop-blur-md border border-white/10 rounded text-[10px] font-mono text-neon-blue">
                      <div className="w-1.5 h-1.5 rounded-full bg-neon-blue animate-ping" />
                      REC [LIVE_FEED_01]
                    </div>
                    {isRecording && (
                      <div className="flex items-center gap-2 px-3 py-1 bg-neon-red/20 backdrop-blur-md border border-neon-red/50 rounded text-[10px] font-mono text-neon-red">
                        <div className="w-1.5 h-1.5 rounded-full bg-neon-red animate-pulse" />
                        AUTO_RECORDING_EVIDENCE
                      </div>
                    )}
                  </div>
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
              icon={Users} 
              label="Students Tracked" 
              value={students.length.toString().padStart(2, '0')} 
              color="bg-neon-blue/20" 
            />
            <StatCard 
              icon={Hand} 
              label="Object Passing" 
              value={objectPassingDetected ? "DETECTED" : "CLEAR"} 
              color={objectPassingDetected ? "bg-neon-red/20" : "bg-white/10"} 
            />
            <StatCard 
              icon={Activity} 
              label="Active Alerts" 
              value={activeAlerts > 0 ? `${activeAlerts} HIGH` : "NORMAL"} 
              color={activeAlerts > 0 ? "bg-neon-red/20" : "bg-neon-purple/20"} 
            />
            <StatCard 
              icon={Cpu} 
              label="AI Engine" 
              value="GEMINI 2.5" 
              color="bg-emerald-500/20" 
            />
          </div>
        </div>

        {/* Right Sidebar - Logs */}
        <div className="w-80 flex flex-col gap-6">
          <div className="flex-1 glass-panel flex flex-col overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-neon-blue" />
                <span className="text-xs font-bold uppercase tracking-widest">Live Logs</span>
              </div>
              <button 
                onClick={handleGenerateReport}
                disabled={isGeneratingReport || logs.length === 0}
                className="flex items-center gap-1 px-2 py-1 bg-neon-blue/10 hover:bg-neon-blue/20 text-neon-blue rounded text-[10px] uppercase font-bold tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGeneratingReport ? (
                  <Activity className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                AI Report
              </button>
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

          <div className="glass-panel p-6">
             <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-neon-purple" />
                <span className="text-xs font-bold uppercase tracking-widest">System Status</span>
             </div>
             <div className="text-[10px] text-white/60 space-y-1 font-mono">
                <p>AUDIO_ALERT: {activeAlerts > 0 ? "TRIGGERED" : "READY"}</p>
                <p>AUTO_RECORD: {isRecording ? "ACTIVE" : "STANDBY"}</p>
                <p>MULTI_TRACK: ENABLED</p>
             </div>
          </div>
        </div>
      </main>

      {/* Footer */}
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
