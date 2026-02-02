export interface ProcessingResult {
  videoPath: string;
  audioPath: string;
  srtPath: string;
  analysisPath: string;
  success: boolean;
  error?: string;
}

export interface VideoFile {
  name: string;
  path: string;
  ext: string;
}

export interface TranscriptionSegment {
  id: number;
  startTime: string;
  endTime: string;
  text: string;
}

export interface AnalysisResult {
  videoName: string;
  summary: string;
  keyPoints: string[];
  timestamp: string;
}
