export enum AppState {
  IDLE = 'IDLE',
  RECORDING = 'RECORDING',
  PAUSED = 'PAUSED',
  PROCESSING = 'PROCESSING',
  ERROR = 'ERROR'
}

export interface TranscriptSegment {
  id: string;
  text: string;
  timestamp: number;
}

export interface AudioRecording {
  blob: Blob;
  url: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  text: string;
  timestamp: number;
}