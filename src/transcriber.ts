import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { config } from './config';
import { TranscriptionSegment } from './types';

const openai = new OpenAI({
  apiKey: config.openai.apiKey,
});

export class Transcriber {
  private static formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const millis = Math.floor((seconds % 1) * 1000);

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
  }

  private static generateSRT(segments: TranscriptionSegment[]): string {
    return segments
      .map(
        segment =>
          `${segment.id}\n${segment.startTime} --> ${segment.endTime}\n${segment.text}\n`,
      )
      .join('\n');
  }

  static async transcribeAudio(audioPath: string, outputSrtPath: string): Promise<void> {
    console.log(`🎤 Transcribing audio: ${path.basename(audioPath)}`);

    try {
      const audioFile = fs.createReadStream(audioPath);

      const transcript = await openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        language: config.whisper.language,
        response_format: 'verbose_json',
        timestamp_granularities: ['segment'],
      });

      if (!('segments' in transcript) || !transcript.segments) {
        throw new Error('No segments in transcription response');
      }

      const segments: TranscriptionSegment[] = transcript.segments.map((segment, index) => ({
        id: index + 1,
        startTime: this.formatTime(segment.start),
        endTime: this.formatTime(segment.end),
        text: segment.text.trim(),
      }));

      const srtContent = this.generateSRT(segments);
      fs.writeFileSync(outputSrtPath, srtContent, 'utf-8');

      console.log(`✓ Transcription saved: ${outputSrtPath}`);
    } catch (err) {
      console.error(`✗ Error transcribing audio: ${err}`);
      throw err;
    }
  }

  static readSRT(srtPath: string): string {
    return fs.readFileSync(srtPath, 'utf-8');
  }
}
