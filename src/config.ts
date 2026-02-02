import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // API Keys
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
  },

  // Paths
  paths: {
    upload: path.join(process.cwd(), 'upload'),
    separated: path.join(process.cwd(), 'separated-audio'),
  },

  // Processing options
  processing: {
    audioFormat: 'mp3',
    audioCodec: 'libmp3lame',
    audioBitrate: '192k',
  },

  // Whisper options (for transcription)
  whisper: {
    language: 'pl',
  },

  // Claude options
  claude: {
    model: 'claude-opus-4-1-20250805',
    maxTokens: 1024,
  },
};
