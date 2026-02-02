import fs from 'fs';
import path from 'path';
import readline from 'readline';

export interface Highlight {
  id: number;
  startTime: string;
  endTime: string;
  text: string;
}

export interface HighlightsResult {
  videoName: string;
  highlights: Highlight[];
  createdAt: string;
}

interface SrtSegment {
  id: number;
  startTime: string;
  endTime: string;
  text: string;
}

export class HighlightsSelector {
  private static parseSRT(srtContent: string): SrtSegment[] {
    const segments: SrtSegment[] = [];
    const blocks = srtContent.trim().split(/\n\n+/);

    for (const block of blocks) {
      const lines = block.split('\n');
      if (lines.length >= 3) {
        const id = parseInt(lines[0], 10);
        const timeMatch = lines[1].match(
          /(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/,
        );

        if (timeMatch) {
          const text = lines.slice(2).join(' ').trim();
          segments.push({
            id,
            startTime: timeMatch[1].replace(',', '.'),
            endTime: timeMatch[2].replace(',', '.'),
            text,
          });
        }
      }
    }

    return segments;
  }

  static async selectHighlights(
    srtPath: string,
    rl: readline.Interface,
  ): Promise<HighlightsResult | null> {
    const srtContent = fs.readFileSync(srtPath, 'utf-8');
    const segments = this.parseSRT(srtContent);
    const baseName = path.basename(srtPath, '.srt');

    if (segments.length === 0) {
      console.log('ℹ️  Brak segmentów w pliku SRT');
      return null;
    }

    console.log(`\n📝 Wybierz highlights dla: ${baseName}`);
    console.log('─'.repeat(60));
    console.log('Dostępne segmenty:\n');

    for (const segment of segments) {
      const timeDisplay = `[${segment.startTime} - ${segment.endTime}]`;
      console.log(`  ${segment.id.toString().padStart(2)}. ${timeDisplay}`);
      console.log(`      "${segment.text.substring(0, 80)}${segment.text.length > 80 ? '...' : ''}"\n`);
    }

    console.log('─'.repeat(60));
    console.log('Instrukcje:');
    console.log('  - Wpisz numery segmentów oddzielone przecinkami (np. 1,3,5,8)');
    console.log('  - Wpisz zakres używając myślnika (np. 1-5)');
    console.log('  - Możesz łączyć oba formaty (np. 1-3,7,10-12)');
    console.log('  - Wpisz "all" aby wybrać wszystkie');
    console.log('  - Wpisz "skip" aby pominąć ten plik');
    console.log('');

    const answer = await this.prompt(rl, 'Twój wybór: ');

    if (answer.toLowerCase() === 'skip') {
      console.log('⏭ Pominięto');
      return null;
    }

    const selectedIds = this.parseSelection(answer, segments.length);

    if (selectedIds.length === 0) {
      console.log('⚠ Nie wybrano żadnych segmentów');
      return null;
    }

    const highlights = segments
      .filter((s) => selectedIds.includes(s.id))
      .map((s) => ({
        id: s.id,
        startTime: s.startTime,
        endTime: s.endTime,
        text: s.text,
      }));

    console.log(`\n✓ Wybrano ${highlights.length} highlight(ów)`);

    return {
      videoName: baseName,
      highlights,
      createdAt: new Date().toISOString(),
    };
  }

  private static parseSelection(input: string, maxId: number): number[] {
    if (input.toLowerCase() === 'all') {
      return Array.from({ length: maxId }, (_, i) => i + 1);
    }

    const ids = new Set<number>();
    const parts = input.split(',').map((p) => p.trim());

    for (const part of parts) {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map((n) => parseInt(n.trim(), 10));
        if (!isNaN(start) && !isNaN(end)) {
          for (let i = Math.max(1, start); i <= Math.min(maxId, end); i++) {
            ids.add(i);
          }
        }
      } else {
        const num = parseInt(part, 10);
        if (!isNaN(num) && num >= 1 && num <= maxId) {
          ids.add(num);
        }
      }
    }

    return Array.from(ids).sort((a, b) => a - b);
  }

  private static prompt(
    rl: readline.Interface,
    question: string,
  ): Promise<string> {
    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  static saveHighlights(result: HighlightsResult, outputPath: string): void {
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');
    console.log(`✓ Highlights zapisane: ${path.basename(outputPath)}`);
  }

  static loadHighlights(filePath: string): HighlightsResult | null {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as HighlightsResult;
  }
}
