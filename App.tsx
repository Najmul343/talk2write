import React, { useState, useRef, useEffect } from 'react';
import { AppState, TranscriptSegment, ChatMessage } from './types';
import { ResultCard } from './components/ResultCard';
import { transcribeAudioToUrdu, summarizeUrduContent, chatWithTranscript } from './services/geminiService';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Chat State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll main content
  useEffect(() => {
    if (!isChatOpen) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [segments, summary, appState, isChatOpen]);

  // Auto-scroll chat
  useEffect(() => {
    if (isChatOpen) {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isChatOpen]);

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
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      audioChunksRef.current = [];
      setAppState(AppState.IDLE);
    }
  };

  const restartRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      audioChunksRef.current = [];
    }
    setAppState(AppState.IDLE);
    setTimeout(() => {
      initRecording();
    }, 150);
  };

  const stopAndProcess = () => {
    if (!mediaRecorderRef.current) return;

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

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Increased validation limit to 500MB
    if (file.size > 500 * 1024 * 1024) {
      setErrorMsg("File too large. Max 500MB allowed.");
      return;
    }

    setAppState(AppState.PROCESSING);
    processAudio(file); // File is a Blob
    
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const processAudio = async (blob: Blob) => {
    try {
      setErrorMsg(null);
      const text = await transcribeAudioToUrdu(blob);
      const newSegment: TranscriptSegment = {
        id: Date.now().toString(),
        text: text,
        timestamp: Date.now()
      };
      setSegments(prev => [...prev, newSegment]);
      setAppState(AppState.IDLE);
    } catch (err) {
      console.error(err);
      setErrorMsg("Transcription failed. Please try again or check file format.");
      setAppState(AppState.IDLE);
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
        console.log('Share cancelled');
      }
    } else {
      navigator.clipboard.writeText(fullContent);
      alert("Copied to clipboard");
    }
  };

  // Chat Functions
  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: chatInput,
      timestamp: Date.now()
    };

    setChatMessages(prev => [...prev, userMsg]);
    setChatInput("");
    setIsChatLoading(true);

    try {
      const allText = segments.map(s => s.text).join("\n");
      const context = summary ? `Summary: ${summary}\n\nTranscripts:\n${allText}` : allText;
      
      const responseText = await chatWithTranscript(context, userMsg.text);
      
      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        text: responseText,
        timestamp: Date.now()
      };
      setChatMessages(prev => [...prev, aiMsg]);
    } catch (err) {
      console.error(err);
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        text: "Sorry, I couldn't process that question right now.",
        timestamp: Date.now()
      };
      setChatMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const isProcessing = appState === AppState.PROCESSING;
  const isRecording = appState === AppState.RECORDING;
  const isPaused = appState === AppState.PAUSED;
  const hasContent = segments.length > 0 || summary;

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans overflow-hidden relative">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        accept="audio/*,video/*" 
        className="hidden" 
      />

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
          {hasContent && (
            <button 
              onClick={() => {
                if(window.confirm("Clear all transcripts?")) {
                  setSegments([]);
                  setSummary(null);
                  setChatMessages([]);
                }
              }}
              className="text-sm text-slate-500 hover:text-red-600 font-medium px-3 py-1"
            >
              Clear All
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 pb-48">
        <div className="max-w-md mx-auto space-y-4">
          
          {!hasContent && appState === AppState.IDLE && (
            <div className="text-center py-12 px-4 opacity-60">
              <div className="w-20 h-20 bg-slate-200 rounded-full mx-auto mb-4 flex items-center justify-center text-slate-400">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
              </div>
              <p className="text-lg text-slate-600 font-medium">Ready to Transcribe</p>
              <p className="text-sm text-slate-500 mt-2">Record voice or upload audio/video.</p>
            </div>
          )}

          {errorMsg && (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 text-sm text-center animate-pulse">
              {errorMsg}
            </div>
          )}

          {/* Transcripts */}
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

          {/* Summary */}
          {summary && (
            <div className="mt-8 border-t-2 border-dashed border-indigo-200 pt-6">
              <h3 className="text-center text-indigo-800 font-bold mb-4 uppercase tracking-wider text-sm">Summary</h3>
              <ResultCard text={summary} type="SUMMARY" onDelete={() => setSummary(null)} />
            </div>
          )}

          {isProcessing && (
             <div className="flex flex-col items-center justify-center p-8 space-y-3">
               <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
               <p className="text-slate-500 text-sm font-medium animate-pulse">Processing media...</p>
             </div>
          )}
          
          <div ref={bottomRef} />
        </div>
      </main>

      {/* Footer Controls */}
      <footer className="flex-none bg-white border-t border-slate-200 p-4 pb-6 safe-area-pb z-20">
        <div className="max-w-md mx-auto space-y-4">
          
          {/* Action Row */}
          {hasContent && !isRecording && !isPaused && !isProcessing && (
            <div className="grid grid-cols-3 gap-2 mb-2">
              <button
                onClick={handleSummarize}
                className="flex flex-col items-center justify-center gap-1 bg-indigo-50 text-indigo-700 py-2 rounded-xl font-medium hover:bg-indigo-100 text-xs sm:text-sm"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                Summarize
              </button>
              
              <button
                onClick={() => setIsChatOpen(true)}
                className="flex flex-col items-center justify-center gap-1 bg-violet-50 text-violet-700 py-2 rounded-xl font-medium hover:bg-violet-100 text-xs sm:text-sm"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                Ask AI
              </button>

              <button
                onClick={handleExport}
                className="flex flex-col items-center justify-center gap-1 bg-yellow-50 text-yellow-700 py-2 rounded-xl font-medium hover:bg-yellow-100 text-xs sm:text-sm"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                Keep/Share
              </button>
            </div>
          )}

          {/* Main Controls */}
          <div className="flex items-center justify-center gap-6 relative">
            
            {/* Upload Button (Only when Idle) */}
            {!isRecording && !isPaused && !isProcessing && (
               <button 
                onClick={() => fileInputRef.current?.click()}
                className="absolute left-4 sm:left-12 p-3 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors flex flex-col items-center"
                title="Upload Audio/Video"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                <span className="text-[10px] font-medium mt-1">Upload</span>
              </button>
            )}

            {/* Cancel / Restart */}
            {(isRecording || isPaused) && (
              <div className="flex gap-4">
                 <button 
                  onClick={cancelRecording}
                  className="p-4 rounded-full bg-slate-100 text-slate-500 hover:bg-red-100 hover:text-red-500 transition-all"
                  title="Trash"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
                <button 
                  onClick={restartRecording}
                  className="p-4 rounded-full bg-slate-100 text-slate-500 hover:bg-blue-100 hover:text-blue-500 transition-all"
                  title="Restart"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
              </div>
            )}

            {/* Main Toggle */}
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

            {/* Finish */}
            {(isRecording || isPaused) && (
              <button 
                onClick={stopAndProcess}
                className="p-4 rounded-full bg-emerald-100 text-emerald-600 hover:bg-emerald-200 transition-all"
                title="Finish"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </button>
            )}
            
          </div>
        </div>
      </footer>

      {/* Chat Modal/Sheet */}
      {isChatOpen && (
        <div className="absolute inset-0 z-50 bg-white flex flex-col animate-fade-in-up">
          {/* Chat Header */}
          <div className="p-4 border-b flex items-center justify-between bg-white shadow-sm">
            <h2 className="text-lg font-bold text-slate-800">Ask about Transcription</h2>
            <button 
              onClick={() => setIsChatOpen(false)}
              className="p-2 text-slate-500 hover:bg-slate-100 rounded-full"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
            {chatMessages.length === 0 && (
              <div className="text-center text-slate-400 mt-12">
                <p>Ask any question about your recording.</p>
              </div>
            )}
            {chatMessages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl p-3 text-sm ${
                  msg.role === 'user' 
                    ? 'bg-indigo-600 text-white rounded-br-none' 
                    : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none shadow-sm'
                }`}>
                  <p dir="auto">{msg.text}</p>
                </div>
              </div>
            ))}
            {isChatLoading && (
              <div className="flex justify-start">
                 <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-none p-3 shadow-sm">
                   <div className="flex gap-1">
                     <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                     <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-75"></div>
                     <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-150"></div>
                   </div>
                 </div>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Chat Input */}
          <div className="p-4 border-t bg-white safe-area-pb">
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Type your question..."
                className="flex-1 border border-slate-300 rounded-full px-4 py-3 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
              <button 
                type="submit"
                disabled={!chatInput.trim() || isChatLoading}
                className="bg-indigo-600 text-white p-3 rounded-full hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;