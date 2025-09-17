import type { VocabItem } from '../types/index.js';
import { ApiKeyManager } from './api-key-manager.js';

export class VocabExtractor {
  async extractVocabulary(subtitleText: string, sourceLanguage: string): Promise<VocabItem[]> {
    const apiKey = await ApiKeyManager.getStoredKey();
    if (!apiKey) {
      throw new Error('OpenAI API key not found');
    }

    const prompt = this.buildPrompt(subtitleText, sourceLanguage);

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant specialized in language learning and vocabulary extraction. Always respond with valid JSON.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;

      console.log(`OpenAI Response for text: ${subtitleText}\n${content}\n`);

      const parsed = JSON.parse(content);
      return this.parseVocabularyResponse(parsed);

    } catch (error) {
      console.error('Error extracting vocabulary:', error);
      throw error;
    }
  }

  private buildPrompt(subtitleText: string, sourceLanguage: string): string {
    return `You are an expert in language teaching.

Extract language learning vocabulary from the following subtitle snippet in ${sourceLanguage} language.

Guidelines:
- Extract meaningful words and phrases that would be useful for language learners
- Ignore music indicators like [موسيقى] or [music]
- Extract even single words if they are meaningful vocabulary
- Ignore proper nouns (names, places, brands), exclamations (oh, wow), and non-translatable words
- For each extracted word/phrase, provide an English translation suitable for learning
- Retain correct capitalization and spelling
- Focus on common, everyday vocabulary that learners would encounter
- Even if snippets are short, extract any meaningful vocabulary
- Avoid comma-separated synonyms. Simply give the most fitting translation!
- Only add the pure words/expressions themselves. Do not add notes or extra infos.

Return your answer as a JSON array with objects containing 'original' and 'translation' fields.

Subtitle snippet to analyze:
${subtitleText}`;
  }

  private parseVocabularyResponse(parsed: unknown): VocabItem[] {
    // Accept both array and object with 'vocabulary' or 'words' keys
    if (Array.isArray(parsed)) {
      return this.mapToVocabItems(parsed);
    }

    if (typeof parsed === 'object' && parsed !== null) {
      const obj = parsed as Record<string, unknown>;

      if ('vocabulary' in obj && Array.isArray(obj.vocabulary)) {
        return this.mapToVocabItems(obj.vocabulary);
      }

      if ('words' in obj && Array.isArray(obj.words)) {
        return this.mapToVocabItems(obj.words);
      }
    }

    return [];
  }

  private mapToVocabItems(items: unknown[]): VocabItem[] {
    return items
      .map(item => {
        if (typeof item === 'object' && item !== null) {
          const obj = item as Record<string, unknown>;
          const original = obj.original || obj.word;
          const translation = obj.translation;

          if (typeof original === 'string' && typeof translation === 'string') {
            return { original, translation };
          }
        }
        return null;
      })
      .filter((item): item is VocabItem => item !== null);
  }
}