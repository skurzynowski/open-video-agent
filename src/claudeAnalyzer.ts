import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { config } from './config';
import { AnalysisResult } from './types';

const anthropic = new Anthropic({
  apiKey: config.anthropic.apiKey,
});

export class ClaudeAnalyzer {
  static async analyzeSRT(srtContent: string, videoName: string): Promise<AnalysisResult> {
    console.log(`🤖 Analyzing with Claude: ${videoName}`);

    try {
      const message = await anthropic.messages.create({
        model: config.claude.model,
        max_tokens: config.claude.maxTokens,
        messages: [
          {
            role: 'user',
            content: `Przeanalizuj poniższą transkrypcję wideo (format SRT) i podaj:
1. Krótkie podsumowanie (2-3 zdania) po polsku
2. Kluczowe punkty lub tematy omówione (jako lista) po polsku

Transkrypcja:
${srtContent}

Zwróć odpowiedź TYLKO jako JSON z kluczami: "summary" (string) i "keyPoints" (tablica stringów). Odpowiedź musi być po polsku.`,
          },
        ],
      });

      const responseText =
        message.content[0].type === 'text' ? message.content[0].text : '';

      // Parse JSON response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Could not parse Claude response as JSON');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      const result: AnalysisResult = {
        videoName,
        summary: parsed.summary || '',
        keyPoints: parsed.keyPoints || [],
        timestamp: new Date().toISOString(),
      };

      console.log(`✓ Analysis complete for ${videoName}`);
      return result;
    } catch (err) {
      console.error(`✗ Error analyzing with Claude: ${err}`);
      throw err;
    }
  }

  static saveAnalysis(analysisResult: AnalysisResult, outputPath: string): void {
    const content = JSON.stringify(analysisResult, null, 2);
    fs.writeFileSync(outputPath, content, 'utf-8');
    console.log(`✓ Analysis saved: ${outputPath}`);
  }
}
