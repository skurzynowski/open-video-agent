import fs from 'fs';
import path from 'path';
import readline from 'readline';

export interface HighlightClip {
  id: number;
  file: string;
  duration: string;
  text: string;
}

export interface HighlightsMetadata {
  videoName: string;
  createdAt: string;
  totalHighlights: number;
  clips: HighlightClip[];
}

export interface ApprovedHighlights {
  videoName: string;
  sourceFolder: string;
  approvedAt: string;
  clips: HighlightClip[];
  order: number[];
}

export class ApprovedHighlightsSelector {
  static findHighlightFolders(readyVideoDir: string): string[] {
    if (!fs.existsSync(readyVideoDir)) {
      return [];
    }

    const folders: string[] = [];
    const entries = fs.readdirSync(readyVideoDir);

    for (const entry of entries) {
      const highlightsDir = path.join(readyVideoDir, entry, 'highlights');
      const metadataPath = path.join(highlightsDir, 'highlights_metadata.json');

      if (fs.existsSync(metadataPath)) {
        folders.push(path.join(readyVideoDir, entry));
      }
    }

    return folders;
  }

  static loadMetadata(folderPath: string): HighlightsMetadata | null {
    const metadataPath = path.join(folderPath, 'highlights', 'highlights_metadata.json');

    if (!fs.existsSync(metadataPath)) {
      return null;
    }

    const content = fs.readFileSync(metadataPath, 'utf-8');
    return JSON.parse(content) as HighlightsMetadata;
  }

  static async selectApprovedHighlights(
    folderPath: string,
    metadata: HighlightsMetadata,
    rl: readline.Interface,
  ): Promise<ApprovedHighlights | null> {
    console.log(`\n✅ Wybierz zatwierdzone highlights dla: ${metadata.videoName}`);
    console.log('─'.repeat(60));
    console.log('Dostępne klipy:\n');

    for (let i = 0; i < metadata.clips.length; i++) {
      const clip = metadata.clips[i];
      console.log(`  ${(i + 1).toString().padStart(2)}. [ID: ${clip.id}] ${clip.duration}`);
      console.log(`      "${clip.text.substring(0, 70)}${clip.text.length > 70 ? '...' : ''}"`);
      console.log(`      Plik: ${clip.file}\n`);
    }

    console.log('─'.repeat(60));
    console.log('Instrukcje:');
    console.log('  - Wpisz numery klipów w kolejności do filmu (np. 2,1,3)');
    console.log('  - Kolejność ma znaczenie - określa porządek w filmie końcowym');
    console.log('  - Wpisz "all" aby wybrać wszystkie w oryginalnej kolejności');
    console.log('  - Wpisz "skip" aby pominąć');
    console.log('');

    const answer = await this.prompt(rl, 'Twój wybór (w kolejności): ');

    if (answer.toLowerCase() === 'skip') {
      console.log('⏭ Pominięto');
      return null;
    }

    const selectedIndices = this.parseSelection(answer, metadata.clips.length);

    if (selectedIndices.length === 0) {
      console.log('⚠ Nie wybrano żadnych klipów');
      return null;
    }

    const approvedClips = selectedIndices.map((idx) => metadata.clips[idx - 1]);
    const order = selectedIndices;

    console.log(`\n✓ Wybrano ${approvedClips.length} klip(ów) do filmu końcowego`);
    console.log('Kolejność w filmie:');
    approvedClips.forEach((clip, i) => {
      console.log(`  ${i + 1}. [ID: ${clip.id}] ${clip.text.substring(0, 50)}...`);
    });

    return {
      videoName: metadata.videoName,
      sourceFolder: folderPath,
      approvedAt: new Date().toISOString(),
      clips: approvedClips,
      order,
    };
  }

  private static parseSelection(input: string, maxIndex: number): number[] {
    if (input.toLowerCase() === 'all') {
      return Array.from({ length: maxIndex }, (_, i) => i + 1);
    }

    const indices: number[] = [];
    const parts = input.split(',').map((p) => p.trim());

    for (const part of parts) {
      const num = parseInt(part, 10);
      if (!isNaN(num) && num >= 1 && num <= maxIndex) {
        indices.push(num);
      }
    }

    return indices;
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

  static saveApprovedHighlights(
    result: ApprovedHighlights,
    outputPath: string,
  ): void {
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');
    console.log(`✓ Zatwierdzone highlights zapisane: ${path.basename(outputPath)}`);
  }

  static loadApprovedHighlights(filePath: string): ApprovedHighlights | null {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as ApprovedHighlights;
  }
}
