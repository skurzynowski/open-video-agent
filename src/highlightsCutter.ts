import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import fs from 'fs';
import path from 'path';
import { HighlightsResult, Highlight } from './highlightsSelector';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export interface CutResult {
  highlightId: number;
  outputPath: string;
  duration: string;
  text: string;
}

export class HighlightsCutter {
  static async cutHighlights(
    videoPath: string,
    highlights: HighlightsResult,
    outputDir: string,
  ): Promise<CutResult[]> {
    const results: CutResult[] = [];

    // Create highlights subfolder
    const highlightsDir = path.join(outputDir, 'highlights');
    if (!fs.existsSync(highlightsDir)) {
      fs.mkdirSync(highlightsDir, { recursive: true });
    }

    console.log(`\n✂️  Wycinanie ${highlights.highlights.length} highlight(ów) (HEVC HDR - precyzyjne cięcie)...`);

    for (const highlight of highlights.highlights) {
      try {
        const result = await this.cutSingleHighlight(
          videoPath,
          highlight,
          highlightsDir,
          highlights.videoName,
        );
        results.push(result);
        console.log(`✓ Wycięto highlight #${highlight.id}: ${path.basename(result.outputPath)}`);
      } catch (err) {
        console.error(`✗ Błąd wycinania highlight #${highlight.id}: ${err}`);
      }
    }

    // Save metadata JSON
    const metadataPath = path.join(highlightsDir, 'highlights_metadata.json');
    this.saveMetadata(results, highlights, metadataPath);

    return results;
  }

  private static cutSingleHighlight(
    videoPath: string,
    highlight: Highlight,
    outputDir: string,
    videoName: string,
  ): Promise<CutResult> {
    return new Promise((resolve, reject) => {
      // Use .mp4 for HEVC encoding with HDR
      const outputFileName = `${videoName}_highlight_${highlight.id.toString().padStart(2, '0')}.mp4`;
      const outputPath = path.join(outputDir, outputFileName);

      const startSeconds = this.timeToSeconds(highlight.startTime);
      const endSeconds = this.timeToSeconds(highlight.endTime);
      const duration = endSeconds - startSeconds;

      // Re-encode to HEVC for precise cutting with HDR preservation
      ffmpeg(videoPath)
        .setStartTime(startSeconds)
        .setDuration(duration)
        .output(outputPath)
        .outputOptions([
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
        .on('end', () => {
          resolve({
            highlightId: highlight.id,
            outputPath,
            duration: `${duration.toFixed(1)}s`,
            text: highlight.text,
          });
        })
        .on('error', (err) => {
          reject(err);
        })
        .run();
    });
  }

  private static timeToSeconds(time: string): number {
    // Format: HH:MM:SS.mmm or HH:MM:SS,mmm
    const normalized = time.replace(',', '.');
    const parts = normalized.split(':');

    if (parts.length === 3) {
      const hours = parseFloat(parts[0]);
      const minutes = parseFloat(parts[1]);
      const seconds = parseFloat(parts[2]);
      return hours * 3600 + minutes * 60 + seconds;
    }

    return 0;
  }

  private static saveMetadata(
    results: CutResult[],
    highlights: HighlightsResult,
    outputPath: string,
  ): void {
    const metadata = {
      videoName: highlights.videoName,
      createdAt: new Date().toISOString(),
      totalHighlights: results.length,
      clips: results.map((r) => ({
        id: r.highlightId,
        file: path.basename(r.outputPath),
        duration: r.duration,
        text: r.text,
      })),
    };

    fs.writeFileSync(outputPath, JSON.stringify(metadata, null, 2), 'utf-8');
    console.log(`✓ Metadata zapisana: highlights_metadata.json`);
  }

  static loadHighlights(filePath: string): HighlightsResult | null {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as HighlightsResult;
  }
}
