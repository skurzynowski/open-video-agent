import fs from 'fs';
import path from 'path';
import { config } from './config';
import { PlatformContentGenerator } from './platformContentGenerator';

interface PlatformContent {
  hashtags: string;
  background: string;
  title: string;
  description: string;
}

interface AllPlatformsContent {
  facebook: PlatformContent;
  linkedin: PlatformContent;
  tiktok: PlatformContent;
  youtube: PlatformContent;
}

export class FileOrganizer {
  private static readyVideoDir = path.join(process.cwd(), 'ready-video');

  static getTimestampFolderName(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    return `${year}${month}${day}_${hours}${minutes}${seconds}`;
  }

  static createProjectFolder(): string {
    if (!fs.existsSync(this.readyVideoDir)) {
      fs.mkdirSync(this.readyVideoDir, { recursive: true });
    }

    const timestamp = this.getTimestampFolderName();
    const projectFolder = path.join(this.readyVideoDir, timestamp);

    if (!fs.existsSync(projectFolder)) {
      fs.mkdirSync(projectFolder, { recursive: true });
    }

    return projectFolder;
  }

  static copyVideoAndAudio(
    videoPath: string,
    audioPath: string,
    projectFolder: string,
  ): { videoPath: string; audioPath: string } {
    const videoName = path.basename(videoPath);
    const audioName = path.basename(audioPath);

    const destVideoPath = path.join(projectFolder, videoName);
    const destAudioPath = path.join(projectFolder, audioName);

    fs.copyFileSync(videoPath, destVideoPath);
    fs.copyFileSync(audioPath, destAudioPath);

    console.log(`✓ Video and audio copied to ready-video project folder`);

    return { videoPath: destVideoPath, audioPath: destAudioPath };
  }

  static copySRT(
    srtPath: string,
    projectFolder: string,
  ): string {
    const srtName = path.basename(srtPath);
    const destSrtPath = path.join(projectFolder, srtName);

    fs.copyFileSync(srtPath, destSrtPath);
    console.log(`✓ Subtitle file (SRT) copied to ready-video project folder`);

    return destSrtPath;
  }

  static savePlatformFiles(
    platformContent: AllPlatformsContent,
    projectFolder: string,
  ): { facebook: string; linkedin: string; tiktok: string; youtube: string } {
    const platforms = ['facebook', 'linkedin', 'tiktok', 'youtube'] as const;
    const results: { [key: string]: string } = {};

    for (const platform of platforms) {
      const content = platformContent[platform];
      const fileName = `${platform}.txt`;
      const filePath = path.join(projectFolder, fileName);

      const formattedContent = PlatformContentGenerator.formatPlatformFile(content);
      fs.writeFileSync(filePath, formattedContent, 'utf-8');

      console.log(`✓ ${platform}.txt saved`);
      results[platform] = filePath;
    }

    return results as {
      facebook: string;
      linkedin: string;
      tiktok: string;
      youtube: string;
    };
  }

  static async organizeProjectFiles(
    videoPath: string,
    audioPath: string,
    srtPath: string,
  ): Promise<{
    projectFolder: string;
    files: {
      video: string;
      audio: string;
      srt: string;
      facebook: string;
      linkedin: string;
      tiktok: string;
      youtube: string;
    };
  }> {
    console.log(`\n📁 Organizing project files...`);

    // Create project folder with timestamp
    const projectFolder = this.createProjectFolder();
    console.log(`✓ Project folder created: ${projectFolder}`);

    // Copy video and audio
    const { videoPath: copiedVideoPath, audioPath: copiedAudioPath } =
      this.copyVideoAndAudio(videoPath, audioPath, projectFolder);

    // Copy SRT file
    const copiedSrtPath = this.copySRT(srtPath, projectFolder);

    // Read SRT content for platform content generation
    const srtContent = fs.readFileSync(srtPath, 'utf-8');

    // Generate platform content
    const platformContent = await PlatformContentGenerator.generatePlatformContent(
      srtContent,
      path.basename(videoPath),
    );

    // Save platform files
    const platformFiles = this.savePlatformFiles(platformContent, projectFolder);

    return {
      projectFolder,
      files: {
        video: copiedVideoPath,
        audio: copiedAudioPath,
        srt: copiedSrtPath,
        facebook: platformFiles.facebook,
        linkedin: platformFiles.linkedin,
        tiktok: platformFiles.tiktok,
        youtube: platformFiles.youtube,
      },
    };
  }
}
