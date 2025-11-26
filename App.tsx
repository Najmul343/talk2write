import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AppState, TranscriptSegment } from './types';
import { ResultCard } from './components/ResultCard';
import { transcribeAudioToUrdu, summarizeUrduContent } from './services/geminiService';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Ref for the media recorder instance
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [segments, summary, appState]);

  // Clean up stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const initRecording = async () => {
    try {
      setErrorMsg(null);
      // Clean up previous stream if exists
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/mp4';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start();
      setAppState(AppState.RECORDING);
    } catch (err) {
      console.error("Microphone error:", err);
      setErrorMsg("Could not access microphone.");
      setAppState(AppState.ERROR);
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause();
      setAppState(AppState.PAUSED);
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume();
      setAppState(AppState.RECORDING);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current) {
      // Remove onstop handler to prevent processing
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      audioChunksRef.current = [];
      setAppState(AppState.IDLE);
    }
  };

  const restartRecording = () => {
    // Stop current without processing
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      audioChunksRef.current = [];
    }
    // Small delay to ensure resource cleanup before restarting
    setAppState(AppState.IDLE);
    setTimeout(() => {
      initRecording();
    }, 150);
  };

  const stopAndProcess = () => {
    if (!mediaRecorderRef.current) return;

    // Create a promise to wait for the final chunk
    new Promise<void>((resolve) => {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.onstop = () => resolve();
        mediaRecorderRef.current.stop();
      } else {
        resolve();
      }
    }).then(() => {
      const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
      const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
      processAudio(audioBlob);
    });
    
    setAppState(AppState.PROCESSING);
  };

  const processAudio = async (audioBlob: Blob) => {
    try {
      const text = await transcribeAudioToUrdu(audioBlob);
      const newSegment: TranscriptSegment = {
        id: Date.now().toString(),
        text: text,
        timestamp: Date.now()
      };
      setSegments(prev => [...prev, newSegment]);
      setAppState(AppState.IDLE);
    } catch (err) {
      console.error(err);
      setErrorMsg("Transcription failed.");
      setAppState(AppState.IDLE); // Go back to idle so they can try again
    }
  };

  const handleSummarize = async () => {
    if (segments.length === 0) return;
    setAppState(AppState.PROCESSING);
    try {
      const textArray = segments.map(s => s.text);
      const summaryText = await summarizeUrduContent(textArray);
      setSummary(summaryText);
    } catch (err) {
      setErrorMsg("Summarization failed.");
    } finally {
      setAppState(AppState.IDLE);
    }
  };

  const handleDeleteSegment = (id: string) => {
    setSegments(prev => prev.filter(s => s.id !== id));
  };

  const handleExport = async () => {
    const allText = segments.map((s, i) => `Segment ${i+1}:\n${s.text}`).join('\n\n');
    const fullContent = summary 
      ? `--- SUMMARY ---\n${summary}\n\n--- TRANSCRIPTS ---\n${allText}`
      : allText;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Urdu Voice Transcript',
          text: fullContent,
        });
      } catch (err) {
        console.log('Share cancelled or failed', err);
      }
    } else {
      // Fallback
      navigator.clipboard.writeText(fullContent);
      alert("Copied to clipboard (Share API not supported on this device)");
    }
  };

  const isProcessing = appState === AppState.PROCESSING;
  const isRecording = appState === AppState.RECORDING;
  const isPaused = appState === AppState.PAUSED;

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans overflow-hidden">
      {/* Header */}
      <header className="flex-none bg-white shadow-sm p-4 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-emerald-600 text-white p-2 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-slate-800">UrduVoice AI</h1>
          </div>
          {segments.length > 0 && (
            <button 
              onClick={() => {
                if(window.confirm("Clear all transcripts?")) {
                  setSegments([]);
                  setSummary(null);
                }
              }}
              className="text-sm text-slate-500 hover:text-red-600 font-medium px-3 py-1"
            >
              Clear All
            </button>
          )}
        </div>
      </header>

      {/* Main Content (Scrollable) */}
      <main className="flex-1 overflow-y-auto p-4 pb-48">
        <div className="max-w-md mx-auto space-y-4">
          
          {segments.length === 0 && !summary && appState === AppState.IDLE && (
            <div className="text-center py-12 px-4 opacity-60">
              <div className="w-20 h-20 bg-slate-200 rounded-full mx-auto mb-4 flex items-center justify-center text-slate-400">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
              </div>
              <p className="text-lg text-slate-600 font-medium">Ready to transcribe</p>
              <p className="text-sm text-slate-500 mt-2">Tap the microphone below to start recording. You can pause, resume, and create multiple segments.</p>
            </div>
          )}

          {errorMsg && (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 text-sm text-center animate-pulse">
              {errorMsg}
            </div>
          )}

          {/* Transcript List */}
          <div className="space-y-4">
            {segments.map((segment, index) => (
              <ResultCard 
                key={segment.id} 
                text={segment.text} 
                type="TRANSCRIPT"
                index={index}
                onDelete={() => handleDeleteSegment(segment.id)}
              />
            ))}
          </div>

          {/* Summary Section */}
          {summary && (
            <div className="mt-8 border-t-2 border-dashed border-indigo-200 pt-6">
              <h3 className="text-center text-indigo-800 font-bold mb-4 uppercase tracking-wider text-sm">Summary</h3>
              <ResultCard text={summary} type="SUMMARY" onDelete={() => setSummary(null)} />
            </div>
          )}

          {isProcessing && (
             <div className="flex flex-col items-center justify-center p-8 space-y-3">
               <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
               <p className="text-slate-500 text-sm font-medium animate-pulse">Processing audio...</p>
             </div>
          )}
          
          <div ref={bottomRef} />
        </div>
      </main>

      {/* Sticky Bottom Controls */}
      <footer className="flex-none bg-white border-t border-slate-200 p-4 pb-6 safe-area-pb z-20">
        <div className="max-w-md mx-auto space-y-4">
          
          {/* Action Row (Summarize & Export) */}
          {(segments.length > 0 || summary) && !isRecording && !isPaused && !isProcessing && (
            <div className="grid grid-cols-2 gap-3 mb-2">
              <button
                onClick={handleSummarize}
                className="flex items-center justify-center gap-2 bg-indigo-50 text-indigo-700 py-3 rounded-xl font-medium hover:bg-indigo-100 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                Summarize
              </button>
              <button
                onClick={handleExport}
                className="flex items-center justify-center gap-2 bg-yellow-50 text-yellow-700 py-3 rounded-xl font-medium hover:bg-yellow-100 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                Keep / Share
              </button>
            </div>
          )}

          {/* Recording Controls */}
          <div className="flex items-center justify-center gap-4">
            
            {/* LEFT: Secondary Controls (Cancel / Restart) */}
            {(isRecording || isPaused) && (
              <div className="flex gap-3">
                 <button 
                  onClick={cancelRecording}
                  className="p-4 rounded-full bg-slate-100 text-slate-500 hover:bg-red-100 hover:text-red-500 transition-all"
                  title="Trash (Cancel)"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
                <button 
                  onClick={restartRecording}
                  className="p-4 rounded-full bg-slate-100 text-slate-500 hover:bg-blue-100 hover:text-blue-500 transition-all"
                  title="Re-record (Restart)"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
              </div>
            )}

            {/* CENTER: Main Toggle (Record/Pause/Resume) */}
            {isRecording ? (
               <button 
               onClick={pauseRecording}
               className="relative w-20 h-20 bg-amber-500 rounded-full flex items-center justify-center shadow-lg hover:bg-amber-600 transition-all scale-100 active:scale-95"
             >
               <span className="absolute w-full h-full rounded-full animate-ping bg-amber-400 opacity-20"></span>
               <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
             </button>
            ) : isPaused ? (
              <button 
                onClick={resumeRecording}
                className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center shadow-lg hover:bg-red-600 transition-all active:scale-95"
              >
                 <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              </button>
            ) : (
              <button 
                onClick={initRecording}
                disabled={isProcessing}
                className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95 ${isProcessing ? 'bg-slate-300' : 'bg-emerald-600 hover:bg-emerald-700'}`}
              >
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
              </button>
            )}

            {/* RIGHT: Finish (Stop & Process) */}
            {(isRecording || isPaused) && (
              <button 
                onClick={stopAndProcess}
                className="p-4 rounded-full bg-emerald-100 text-emerald-600 hover:bg-emerald-200 transition-all"
                title="Finish & Transcribe"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </button>
            )}
            
          </div>
          
          <div className="text-center h-4">
             <p className="text-xs font-semibold text-slate-400">
               {isRecording ? "Listening..." : isPaused ? "Paused" : isProcessing ? "Transcribing..." : "Tap mic to start"}
             </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;