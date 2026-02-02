import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { VideoProcessor } from './videoProcessor';
import { Transcriber } from './transcriber';
import { ClaudeAnalyzer } from './claudeAnalyzer';
import { FileOrganizer } from './fileOrganizer';
import { HighlightsSelector } from './highlightsSelector';
import { HighlightsCutter } from './highlightsCutter';
import { ApprovedHighlightsSelector } from './approvedHighlightsSelector';
import { FullVideoAssembler } from './fullVideoAssembler';
import { ProcessingResult, VideoFile } from './types';

export type StepType = 'extract' | 'transcribe' | 'analyze' | 'organize' | 'highlights' | 'cut-highlights' | 'approve-highlights' | 'assemble-full';
export type CleanType = 'upload' | 'output' | 'all';

export class Agent {
  private readonly uploadDir = path.join(process.cwd(), 'upload');
  private readonly separatedAudioDir = path.join(process.cwd(), 'separated-audio');
  private readonly readyVideoDir = path.join(process.cwd(), 'ready-video');
  private readonly introDir = path.join(process.cwd(), 'additional', 'intro');
  private rl: readline.Interface | null = null;

  setReadlineInterface(rl: readline.Interface): void {
    this.rl = rl;
  }

  async processAllVideos(): Promise<ProcessingResult[]> {
    const results: ProcessingResult[] = [];

    console.log('🚀 Starting video processing agent...\n');

    try {
      const videoFiles = VideoProcessor.getVideoFiles();

      if (videoFiles.length === 0) {
        console.log('ℹ️  No video files found in upload directory');
        return results;
      }

      console.log(`📊 Found ${videoFiles.length} video file(s)\n`);

      for (const videoFile of videoFiles) {
        try {
          const result = await this.processVideo(videoFile.name);
          results.push(result);
        } catch (err) {
          console.error(`\n✗ Failed to process ${videoFile.name}`);
          results.push({
            videoPath: '',
            audioPath: '',
            srtPath: '',
            analysisPath: '',
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      console.log('\n✅ Processing complete');
      this.printSummary(results);

      return results;
    } catch (err) {
      console.error('✗ Agent failed:', err);
      throw err;
    }
  }

  private async processVideo(videoFileName: string): Promise<ProcessingResult> {
    const videoFile = VideoProcessor.getVideoFiles().find((f: VideoFile) => f.name === videoFileName);
    if (!videoFile) {
      throw new Error(`Video file not found: ${videoFileName}`);
    }

    // Step 1: Extract audio and copy video
    const { audioPath, videoPath } = await VideoProcessor.processVideo(videoFile);

    // Step 2: Transcribe audio to SRT
    const baseName = path.basename(videoFileName, videoFile.ext);
    const srtPath = path.join(path.dirname(audioPath), `${baseName}.srt`);
    await Transcriber.transcribeAudio(audioPath, srtPath);

    // Step 3: Analyze with Claude
    const srtContent = Transcriber.readSRT(srtPath);
    const analysisResult = await ClaudeAnalyzer.analyzeSRT(srtContent, videoFileName);

    const analysisPath = path.join(path.dirname(audioPath), `${baseName}_analysis.json`);
    ClaudeAnalyzer.saveAnalysis(analysisResult, analysisPath);

    // Step 4: Organize files in ready-video folder with platform content
    await FileOrganizer.organizeProjectFiles(videoPath, audioPath, srtPath);

    return {
      videoPath,
      audioPath,
      srtPath,
      analysisPath,
      success: true,
    };
  }

  private printSummary(results: ProcessingResult[]): void {
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`\n📋 Summary:`);
    console.log(`  ✓ Successful: ${successful}`);
    console.log(`  ✗ Failed: ${failed}`);
    console.log(`  📁 Output directories:`);
    console.log(`    - separated-audio/ (analysis files)`);
    console.log(`    - ready-video/ (organized projects with platform content)`);
  }

  async runStep(step: StepType): Promise<void> {
    console.log(`🔧 Running step: ${step}\n`);

    switch (step) {
      case 'extract':
        await this.runExtractStep();
        break;
      case 'transcribe':
        await this.runTranscribeStep();
        break;
      case 'analyze':
        await this.runAnalyzeStep();
        break;
      case 'organize':
        await this.runOrganizeStep();
        break;
      case 'highlights':
        await this.runHighlightsStep();
        break;
      case 'cut-highlights':
        await this.runCutHighlightsStep();
        break;
      case 'approve-highlights':
        await this.runApproveHighlightsStep();
        break;
      case 'assemble-full':
        await this.runAssembleFullStep();
        break;
    }
  }

  private async runExtractStep(): Promise<void> {
    const videoFiles = VideoProcessor.getVideoFiles();

    if (videoFiles.length === 0) {
      console.log('ℹ️  Brak plików wideo w folderze upload');
      return;
    }

    console.log(`📊 Znaleziono ${videoFiles.length} plik(ów) wideo\n`);

    for (const videoFile of videoFiles) {
      try {
        await VideoProcessor.processVideo(videoFile);
        console.log(`✓ Wyekstrahowano audio z: ${videoFile.name}`);
      } catch (err) {
        console.error(`✗ Błąd dla ${videoFile.name}: ${err}`);
      }
    }
  }

  private async runTranscribeStep(): Promise<void> {
    const audioFiles = this.getFilesWithExtension(this.separatedAudioDir, ['.mp3', '.wav', '.m4a']);

    if (audioFiles.length === 0) {
      console.log('ℹ️  Brak plików audio w folderze separated-audio');
      console.log('   Najpierw uruchom krok ekstrakcji audio (opcja 2)');
      return;
    }

    console.log(`📊 Znaleziono ${audioFiles.length} plik(ów) audio\n`);

    for (const audioFile of audioFiles) {
      const baseName = path.basename(audioFile, path.extname(audioFile));
      const srtPath = path.join(this.separatedAudioDir, `${baseName}.srt`);

      if (fs.existsSync(srtPath)) {
        console.log(`⏭ Pominięto ${baseName} - plik SRT już istnieje`);
        continue;
      }

      try {
        await Transcriber.transcribeAudio(audioFile, srtPath);
        console.log(`✓ Transkrypcja ukończona: ${baseName}.srt`);
      } catch (err) {
        console.error(`✗ Błąd transkrypcji ${baseName}: ${err}`);
      }
    }
  }

  private async runAnalyzeStep(): Promise<void> {
    const srtFiles = this.getFilesWithExtension(this.separatedAudioDir, ['.srt']);

    if (srtFiles.length === 0) {
      console.log('ℹ️  Brak plików SRT w folderze separated-audio');
      console.log('   Najpierw uruchom krok transkrypcji (opcja 3)');
      return;
    }

    console.log(`📊 Znaleziono ${srtFiles.length} plik(ów) SRT\n`);

    for (const srtFile of srtFiles) {
      const baseName = path.basename(srtFile, '.srt');
      const analysisPath = path.join(this.separatedAudioDir, `${baseName}_analysis.json`);

      if (fs.existsSync(analysisPath)) {
        console.log(`⏭ Pominięto ${baseName} - analiza już istnieje`);
        continue;
      }

      try {
        const srtContent = Transcriber.readSRT(srtFile);
        const analysisResult = await ClaudeAnalyzer.analyzeSRT(srtContent, baseName);
        ClaudeAnalyzer.saveAnalysis(analysisResult, analysisPath);
        console.log(`✓ Analiza ukończona: ${baseName}_analysis.json`);
      } catch (err) {
        console.error(`✗ Błąd analizy ${baseName}: ${err}`);
      }
    }
  }

  private async runOrganizeStep(): Promise<void> {
    const videoFiles = this.getFilesWithExtension(this.separatedAudioDir, ['.mov', '.mp4', '.avi', '.mkv']);
    const audioFiles = this.getFilesWithExtension(this.separatedAudioDir, ['.mp3', '.wav', '.m4a']);
    const srtFiles = this.getFilesWithExtension(this.separatedAudioDir, ['.srt']);

    if (videoFiles.length === 0 || srtFiles.length === 0) {
      console.log('ℹ️  Brak wymaganych plików w folderze separated-audio');
      console.log('   Potrzebne: pliki wideo i SRT');
      console.log('   Uruchom wcześniejsze kroki najpierw');
      return;
    }

    console.log(`📊 Znaleziono ${videoFiles.length} wideo, ${audioFiles.length} audio, ${srtFiles.length} SRT\n`);

    for (const videoFile of videoFiles) {
      const baseName = path.basename(videoFile, path.extname(videoFile));
      const matchingAudio = audioFiles.find(f => path.basename(f, path.extname(f)) === baseName);
      const matchingSrt = srtFiles.find(f => path.basename(f, '.srt') === baseName);

      if (!matchingAudio || !matchingSrt) {
        console.log(`⏭ Pominięto ${baseName} - brak pasujących plików audio lub SRT`);
        continue;
      }

      try {
        await FileOrganizer.organizeProjectFiles(videoFile, matchingAudio, matchingSrt);
        console.log(`✓ Zorganizowano projekt: ${baseName}`);
      } catch (err) {
        console.error(`✗ Błąd organizacji ${baseName}: ${err}`);
      }
    }
  }

  private async runHighlightsStep(): Promise<void> {
    if (!this.rl) {
      console.error('✗ Brak interfejsu readline - nie można wybrać highlights');
      return;
    }

    const srtFiles = this.getFilesWithExtension(this.separatedAudioDir, ['.srt']);

    if (srtFiles.length === 0) {
      console.log('ℹ️  Brak plików SRT w folderze separated-audio');
      console.log('   Najpierw uruchom krok transkrypcji (opcja 3)');
      return;
    }

    console.log(`📊 Znaleziono ${srtFiles.length} plik(ów) SRT\n`);

    for (const srtFile of srtFiles) {
      const baseName = path.basename(srtFile, '.srt');
      const highlightsPath = path.join(this.separatedAudioDir, `${baseName}_highlights.json`);

      if (fs.existsSync(highlightsPath)) {
        const answer = await this.promptUser(`⚠ Highlights dla ${baseName} już istnieją. Nadpisać? (t/n): `);
        if (answer.toLowerCase() !== 't' && answer.toLowerCase() !== 'tak') {
          console.log(`⏭ Pominięto ${baseName}`);
          continue;
        }
      }

      try {
        const result = await HighlightsSelector.selectHighlights(srtFile, this.rl);
        if (result) {
          HighlightsSelector.saveHighlights(result, highlightsPath);
        }
      } catch (err) {
        console.error(`✗ Błąd wyboru highlights dla ${baseName}: ${err}`);
      }
    }
  }

  private async runCutHighlightsStep(): Promise<void> {
    const highlightsFiles = this.getFilesWithExtension(this.separatedAudioDir, ['_highlights.json']);

    if (highlightsFiles.length === 0) {
      console.log('ℹ️  Brak plików highlights w folderze separated-audio');
      console.log('   Najpierw uruchom krok wyboru highlights (opcja 6)');
      return;
    }

    const videoFiles = this.getFilesWithExtension(this.separatedAudioDir, ['.mov', '.mp4', '.avi', '.mkv']);

    if (videoFiles.length === 0) {
      console.log('ℹ️  Brak plików wideo w folderze separated-audio');
      console.log('   Najpierw uruchom krok ekstrakcji (opcja 2)');
      return;
    }

    console.log(`📊 Znaleziono ${highlightsFiles.length} plik(ów) highlights\n`);

    for (const highlightsFile of highlightsFiles) {
      const highlights = HighlightsCutter.loadHighlights(highlightsFile);
      if (!highlights) {
        console.log(`⏭ Pominięto ${path.basename(highlightsFile)} - nie można wczytać`);
        continue;
      }

      // Find matching video file
      const videoFile = videoFiles.find((f) => {
        const videoBaseName = path.basename(f, path.extname(f));
        return videoBaseName === highlights.videoName;
      });

      if (!videoFile) {
        console.log(`⏭ Pominięto ${highlights.videoName} - brak pasującego pliku wideo`);
        continue;
      }

      // Create output directory in ready-video with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const outputDir = path.join(this.readyVideoDir, `${highlights.videoName}_${timestamp}`);

      try {
        const results = await HighlightsCutter.cutHighlights(videoFile, highlights, outputDir);
        console.log(`✓ Wycięto ${results.length} klipów dla: ${highlights.videoName}`);
      } catch (err) {
        console.error(`✗ Błąd wycinania highlights dla ${highlights.videoName}: ${err}`);
      }
    }
  }

  private async runApproveHighlightsStep(): Promise<void> {
    if (!this.rl) {
      console.error('✗ Brak interfejsu readline - nie można zatwierdzić highlights');
      return;
    }

    const highlightFolders = ApprovedHighlightsSelector.findHighlightFolders(this.readyVideoDir);

    if (highlightFolders.length === 0) {
      console.log('ℹ️  Brak folderów z highlights w ready-video');
      console.log('   Najpierw uruchom krok wycinania highlights (opcja 7)');
      return;
    }

    console.log(`📊 Znaleziono ${highlightFolders.length} folder(ów) z highlights\n`);

    for (const folder of highlightFolders) {
      const metadata = ApprovedHighlightsSelector.loadMetadata(folder);
      if (!metadata) {
        console.log(`⏭ Pominięto ${path.basename(folder)} - brak metadanych`);
        continue;
      }

      const approvedPath = path.join(folder, 'highlights', 'approved_highlights.json');

      if (fs.existsSync(approvedPath)) {
        const answer = await this.promptUser(
          `⚠ Zatwierdzone highlights dla ${metadata.videoName} już istnieją. Nadpisać? (t/n): `,
        );
        if (answer.toLowerCase() !== 't' && answer.toLowerCase() !== 'tak') {
          console.log(`⏭ Pominięto ${metadata.videoName}`);
          continue;
        }
      }

      try {
        const result = await ApprovedHighlightsSelector.selectApprovedHighlights(
          folder,
          metadata,
          this.rl,
        );
        if (result) {
          ApprovedHighlightsSelector.saveApprovedHighlights(result, approvedPath);
        }
      } catch (err) {
        console.error(`✗ Błąd zatwierdzania highlights dla ${metadata.videoName}: ${err}`);
      }
    }
  }

  private async runAssembleFullStep(): Promise<void> {
    const approvedItems = FullVideoAssembler.findApprovedHighlights(this.readyVideoDir);

    if (approvedItems.length === 0) {
      console.log('ℹ️  Brak zatwierdzonych highlights w ready-video');
      console.log('   Najpierw uruchom krok zatwierdzania highlights (opcja 8)');
      return;
    }

    // Check for intro file
    let introPath: string | null = null;
    const introFile = this.findIntroFile();

    if (introFile) {
      console.log(`🎬 Znaleziono intro: ${path.basename(introFile)}`);
      const answer = await this.promptUser('Czy domontować intro? (t/n): ');
      if (answer.toLowerCase() === 't' || answer.toLowerCase() === 'tak') {
        introPath = introFile;
        console.log('✓ Intro zostanie dodane po highlights\n');
      } else {
        console.log('⏭ Intro pominięte\n');
      }
    }

    console.log(`📊 Znaleziono ${approvedItems.length} zatwierdzonych highlights\n`);

    for (const item of approvedItems) {
      const { approved, folder } = item;

      // Find original video
      const originalVideo = FullVideoAssembler.findOriginalVideo(
        this.separatedAudioDir,
        approved.videoName,
      );

      if (!originalVideo) {
        console.log(`⏭ Pominięto ${approved.videoName} - brak oryginalnego wideo`);
        continue;
      }

      const outputDir = path.join(folder, 'complete');

      try {
        const result = await FullVideoAssembler.assembleFullVideo(
          approved,
          originalVideo,
          outputDir,
          introPath,
        );

        console.log(`\n✓ Pełny film utworzony: ${path.basename(result.outputPath)}`);
        console.log(`  Klipy highlights: ${result.highlightsCount}`);
        if (result.introDuration) {
          console.log(`  Czas intro: ${result.introDuration}`);
        }
        console.log(`  Czas highlights: ${result.highlightsDuration}`);
        console.log(`  Czas oryginału: ${result.originalDuration}`);
        console.log(`  Razem: ${result.totalDuration}`);
      } catch (err) {
        console.error(`✗ Błąd składania filmu ${approved.videoName}: ${err}`);
      }
    }
  }

  private findIntroFile(): string | null {
    if (!fs.existsSync(this.introDir)) {
      return null;
    }

    const videoExtensions = ['.mov', '.mp4', '.avi', '.mkv'];
    const files = fs.readdirSync(this.introDir);

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (videoExtensions.includes(ext)) {
        return path.join(this.introDir, file);
      }
    }

    return null;
  }

  private promptUser(question: string): Promise<string> {
    return new Promise((resolve) => {
      if (this.rl) {
        this.rl.question(question, (answer) => {
          resolve(answer.trim());
        });
      } else {
        resolve('');
      }
    });
  }

  private getFilesWithExtension(dir: string, extensions: string[]): string[] {
    if (!fs.existsSync(dir)) {
      return [];
    }

    const files = fs.readdirSync(dir);
    return files
      .filter(file => extensions.some(ext => file.toLowerCase().endsWith(ext)))
      .map(file => path.join(dir, file));
  }

  async clean(type: CleanType): Promise<void> {
    console.log(`🧹 Czyszczenie: ${type}\n`);

    const dirsToClean: string[] = [];

    switch (type) {
      case 'upload':
        dirsToClean.push(this.uploadDir);
        break;
      case 'output':
        dirsToClean.push(this.separatedAudioDir, this.readyVideoDir);
        break;
      case 'all':
        dirsToClean.push(this.uploadDir, this.separatedAudioDir, this.readyVideoDir);
        break;
    }

    for (const dir of dirsToClean) {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        let count = 0;

        for (const file of files) {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);

          if (stat.isDirectory()) {
            fs.rmSync(filePath, { recursive: true });
          } else {
            fs.unlinkSync(filePath);
          }
          count++;
        }

        console.log(`✓ Wyczyszczono ${path.basename(dir)}/ (${count} elementów)`);
      } else {
        console.log(`ℹ️  Folder ${path.basename(dir)}/ nie istnieje`);
      }
    }
  }
}
