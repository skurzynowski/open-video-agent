import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import fs from 'fs';
import path from 'path';
import { config } from './config';
import { VideoFile } from './types';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export class VideoProcessor {
  static getVideoFiles(): VideoFile[] {
    const uploadDir = config.paths.upload;

    if (!fs.existsSync(uploadDir)) {
      return [];
    }

    const files = fs.readdirSync(uploadDir);
    const videoExtensions = ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv', '.wmv'];

    return files
      .filter(file => {
        const ext = path.extname(file).toLowerCase();
        return videoExtensions.includes(ext);
      })
      .map(file => ({
        name: file,
        path: path.join(uploadDir, file),
        ext: path.extname(file),
      }));
  }

  static extractAudio(videoPath: string, outputAudioPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .output(outputAudioPath)
        .audioCodec(config.processing.audioCodec)
        .audioBitrate(config.processing.audioBitrate)
        .on('end', () => {
          console.log(`✓ Audio extracted: ${outputAudioPath}`);
          resolve();
        })
        .on('error', (err) => {
          console.error(`✗ Error extracting audio: ${err.message}`);
          reject(err);
        })
        .run();
    });
  }

  static copyVideo(videoPath: string, outputVideoPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        fs.copyFileSync(videoPath, outputVideoPath);
        console.log(`✓ Video copied: ${outputVideoPath}`);
        resolve();
      } catch (err) {
        console.error(`✗ Error copying video: ${err}`);
        reject(err);
      }
    });
  }

  static async processVideo(videoFile: VideoFile): Promise<{ audioPath: string; videoPath: string }> {
    const baseName = path.basename(videoFile.name, videoFile.ext);
    const audioPath = path.join(config.paths.separated, `${baseName}.mp3`);
    const videoPath = path.join(config.paths.separated, videoFile.name);

    // Ensure output directory exists
    if (!fs.existsSync(config.paths.separated)) {
      fs.mkdirSync(config.paths.separated, { recursive: true });
    }

    console.log(`\n📹 Processing: ${videoFile.name}`);

    // Extract audio
    await this.extractAudio(videoFile.path, audioPath);

    // Copy video
    await this.copyVideo(videoFile.path, videoPath);

    return { audioPath, videoPath };
  }
}
