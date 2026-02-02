import Anthropic from '@anthropic-ai/sdk';
import { config } from './config';

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

const anthropic = new Anthropic({
  apiKey: config.anthropic.apiKey,
});

export class PlatformContentGenerator {
  private static readonly MAX_RETRIES = 3;

  private static cleanJsonResponse(text: string): string {
    // Remove markdown code blocks if present
    let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
    // Remove any leading/trailing whitespace
    cleaned = cleaned.trim();
    return cleaned;
  }

  private static parseJsonResponse(responseText: string): AllPlatformsContent {
    const cleaned = this.cleanJsonResponse(responseText);

    // Try to extract JSON from the response
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not find JSON object in response');
    }

    return JSON.parse(jsonMatch[0]) as AllPlatformsContent;
  }

  static async generatePlatformContent(
    srtContent: string,
    videoName: string,
  ): Promise<AllPlatformsContent> {
    console.log(`📱 Generating platform-specific content for: ${videoName}`);

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const message = await anthropic.messages.create({
          model: config.claude.model,
          max_tokens: 2000,
          messages: [
            {
              role: 'user',
              content: `Na podstawie poniższej transkrypcji wideo, wygeneruj zawartość zoptymalizowaną dla 4 różnych platform mediów społecznych.

WAŻNE: Główna fraza sprzedażowa to "proces gotowy na AI". Staraj się naturalnie wpleść tę frazę lub jej warianty (np. "procesy gotowe na AI", "przygotowanie procesów na AI") w generowane treści, szczególnie w tytułach i opisach.

Dla każdej platformy podaj po polsku:
- hashtags: odpowiednie hashtagi (oddzielone przecinkami) - uwzględnij #ProcesGotowyNaAI
- background: krótki kontekst lub tło (1-2 zdania)
- title: tytuł zoptymalizowany dla platformy (naturalnie zawierający frazę "proces gotowy na AI" jeśli pasuje)
- description: opis zoptymalizowany dla platformy

Transkrypcja:
${srtContent}

Zwróć TYLKO prawidłowy JSON z dokładnie tą strukturą (bez markdown, bez dodatkowego tekstu). Cała zawartość powinna być po polsku:
{
  "facebook": {
    "hashtags": "...",
    "background": "...",
    "title": "...",
    "description": "..."
  },
  "linkedin": {
    "hashtags": "...",
    "background": "...",
    "title": "...",
    "description": "..."
  },
  "tiktok": {
    "hashtags": "...",
    "background": "...",
    "title": "...",
    "description": "..."
  },
  "youtube": {
    "hashtags": "...",
    "background": "...",
    "title": "...",
    "description": "..."
  }
}`,
            },
          ],
        });

        const responseText =
          message.content[0].type === 'text' ? message.content[0].text : '';

        const parsed = this.parseJsonResponse(responseText);

        console.log(`✓ Platform content generated`);
        return parsed;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt < this.MAX_RETRIES) {
          console.warn(`⚠ Attempt ${attempt}/${this.MAX_RETRIES} failed: ${lastError.message}. Retrying...`);
        }
      }
    }

    console.error(`✗ Error generating platform content after ${this.MAX_RETRIES} attempts: ${lastError}`);
    throw lastError;
  }

  static formatPlatformFile(content: PlatformContent): string {
    return `Hashtagi:
${content.hashtags}

Tło:
${content.background}

Tytuł:
${content.title}

Opis:
${content.description}`;
  }
}
