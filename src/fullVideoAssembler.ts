import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import fs from 'fs';
import path from 'path';
import { ApprovedHighlights } from './approvedHighlightsSelector';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export interface AssembleResult {
  outputPath: string;
  highlightsCount: number;
  highlightsDuration: string;
  introDuration?: string;
  originalDuration: string;
  totalDuration: string;
}

export class FullVideoAssembler {
  /**
   * Find approved highlights files in ready-video directory
   */
  static findApprovedHighlights(readyVideoDir: string): Array<{
    folder: string;
    approvedPath: string;
    approved: ApprovedHighlights;
  }> {
    if (!fs.existsSync(readyVideoDir)) {
      return [];
    }

    const results: Array<{
      folder: string;
      approvedPath: string;
      approved: ApprovedHighlights;
    }> = [];

    const entries = fs.readdirSync(readyVideoDir);

    for (const entry of entries) {
      const approvedPath = path.join(readyVideoDir, entry, 'highlights', 'approved_highlights.json');

      if (!fs.existsSync(approvedPath)) continue;

      const approved = JSON.parse(fs.readFileSync(approvedPath, 'utf-8')) as ApprovedHighlights;

      results.push({
        folder: path.join(readyVideoDir, entry),
        approvedPath,
        approved,
      });
    }

    return results;
  }

  /**
   * Find original video file
   */
  static findOriginalVideo(
    separatedAudioDir: string,
    videoName: string,
  ): string | null {
    if (!fs.existsSync(separatedAudioDir)) {
      return null;
    }

    const videoExtensions = ['.mov', '.mp4', '.avi', '.mkv'];
    const files = fs.readdirSync(separatedAudioDir);

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      const baseName = path.basename(file, ext);

      if (videoExtensions.includes(ext) && baseName === videoName) {
        return path.join(separatedAudioDir, file);
      }
    }

    return null;
  }

  /**
   * Assemble full video by concatenating individual highlight clips + original video
   * Uses concat demuxer with stream copy - fast and lossless
   */
  static async assembleFullVideo(
    approved: ApprovedHighlights,
    originalVideoPath: string,
    outputDir: string,
    introPath?: string | null,
  ): Promise<AssembleResult> {
    const highlightsDir = path.join(approved.sourceFolder, 'highlights');

    // Verify all clip files exist
    const clipPaths: string[] = [];
    for (const clip of approved.clips) {
      const clipPath = path.join(highlightsDir, clip.file);
      if (!fs.existsSync(clipPath)) {
        throw new Error(`Brak pliku klipu: ${clip.file}`);
      }
      clipPaths.push(clipPath);
    }

    // Create output directory if needed
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log(`\n🎬 Składanie pełnego filmu (wszystko na raz)...`);
    console.log(`  Klipy highlights: ${approved.clips.length}`);
    approved.clips.forEach((clip, i) => {
      console.log(`    ${i + 1}. ${clip.file} (${clip.duration})`);
    });
    if (introPath) {
      console.log(`  Intro: ${path.basename(introPath)}`);
    }
    console.log(`  Oryginalny film: ${path.basename(originalVideoPath)}`);

    // Build file list: highlights -> intro (if present) -> original
    const allFiles = [...clipPaths];
    if (introPath) {
      allFiles.push(introPath);
    }
    allFiles.push(originalVideoPath);

    // Output file - use .mp4 for HEVC encoding with HDR
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outputFileName = `${approved.videoName}_complete_${timestamp}.mp4`;
    const outputPath = path.join(outputDir, outputFileName);

    console.log(`  Łączę ${allFiles.length} plików (HEVC HDR - filter_complex)...`);

    // Get durations before concat
    const highlightsDuration = await this.calculateHighlightsDuration(approved.clips);
    const introDuration = introPath ? await this.getVideoDuration(introPath) : 0;
    const originalDuration = await this.getVideoDuration(originalVideoPath);

    // Merge using filter_complex for better compatibility
    await this.concatVideosWithFilter(allFiles, outputPath);

    const totalDuration = highlightsDuration + introDuration + originalDuration;

    // Save metadata
    const metadataPath = path.join(outputDir, `${approved.videoName}_complete_metadata.json`);
    this.saveMetadata(
      approved,
      originalVideoPath,
      outputPath,
      highlightsDuration,
      originalDuration,
      metadataPath,
      introPath ? introDuration : undefined,
    );

    const result: AssembleResult = {
      outputPath,
      highlightsCount: approved.clips.length,
      highlightsDuration: `${highlightsDuration.toFixed(1)}s`,
      originalDuration: `${originalDuration.toFixed(1)}s`,
      totalDuration: `${totalDuration.toFixed(1)}s`,
    };

    if (introPath) {
      result.introDuration = `${introDuration.toFixed(1)}s`;
    }

    return result;
  }

  private static concatVideosWithFilter(
    inputFiles: string[],
    outputPath: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const cmd = ffmpeg();

      // Add all input files
      for (const file of inputFiles) {
        cmd.input(file);
      }

      // Simple concat without scaling - all videos must be same format
      const concatInputs = inputFiles.map((_, i) => `[${i}:v][${i}:a]`).join('');
      const filterComplex = `${concatInputs}concat=n=${inputFiles.length}:v=1:a=1[outv][outa]`;

      cmd
        .complexFilter(filterComplex)
        .outputOptions([
          '-map', '[outv]',
          '-map', '[outa]',
          '-c:v libx265',
          '-preset fast',
          '-crf 15',
          '-tag:v hvc1',
          '-pix_fmt yuv420p10le',
          '-x265-params',
          'colorprim=bt2020:transfer=arib-std-b67:colormatrix=bt2020nc:range=limited:hdr-opt=1',
          '-c:a aac',
          '-b:a 192k',
        ])
        .output(outputPath)
        .on('start', (cmdLine) => {
          console.log(`  Wykonuję: ffmpeg filter_complex concat...`);
        })
        .on('end', () => {
          console.log(`  Zakończono!`);
          resolve();
        })
        .on('error', (err) => {
          console.error(`  Błąd ffmpeg: ${err.message}`);
          reject(err);
        })
        .run();
    });
  }

  private static calculateHighlightsDuration(clips: Array<{ duration: string }>): Promise<number> {
    const totalSeconds = clips.reduce((sum, clip) => {
      const seconds = parseFloat(clip.duration.replace('s', ''));
      return sum + seconds;
    }, 0);
    return Promise.resolve(totalSeconds);
  }

  private static getVideoDuration(videoPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          reject(err);
        } else {
          resolve(metadata.format.duration || 0);
        }
      });
    });
  }

  private static saveMetadata(
    approved: ApprovedHighlights,
    originalVideoPath: string,
    outputPath: string,
    highlightsDuration: number,
    originalDuration: number,
    metadataPath: string,
    introDuration?: number,
  ): void {
    const totalDuration = highlightsDuration + (introDuration || 0) + originalDuration;

    const metadata: Record<string, unknown> = {
      videoName: approved.videoName,
      completeFile: path.basename(outputPath),
      createdAt: new Date().toISOString(),
      structure: {
        highlights: {
          count: approved.clips.length,
          duration: `${highlightsDuration.toFixed(1)}s`,
          clips: approved.clips.map((clip, index) => ({
            order: index + 1,
            id: clip.id,
            file: clip.file,
            duration: clip.duration,
            text: clip.text,
          })),
        },
        ...(introDuration !== undefined && {
          intro: {
            duration: `${introDuration.toFixed(1)}s`,
          },
        }),
        original: {
          file: path.basename(originalVideoPath),
          duration: `${originalDuration.toFixed(1)}s`,
        },
      },
      totalDuration: `${totalDuration.toFixed(1)}s`,
    };

    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
    console.log(`✓ Metadata zapisana: ${path.basename(metadataPath)}`);
  }
}
