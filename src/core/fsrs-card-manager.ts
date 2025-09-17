import type { Card, ReviewLog, FSRS, Grade } from 'ts-fsrs';
import { createEmptyCard, fsrs, Rating } from 'ts-fsrs';
import type { VocabItem } from '../types/index.js';

export interface VocabCard {
  id: string;
  vocab: VocabItem;
  fsrsCard: Card;
  created: string; // ISO date
  lastReviewed?: string; // ISO date
}

export class FSRSCardManager {
  private scheduler: FSRS = fsrs();
  private storageKey = 'vocab_cards';

  async getStoredCards(): Promise<VocabCard[]> {
    const result = await new Promise<{vocab_cards?: string}>((resolve) => {
      chrome.storage.local.get([this.storageKey], resolve);
    });

    if (!result.vocab_cards) {
      return [];
    }

    try {
      const cards = JSON.parse(result.vocab_cards) as VocabCard[];
      return cards.map(card => ({
        ...card,
        fsrsCard: this.deserializeCard(card.fsrsCard)
      }));
    } catch (error) {
      console.error('Error parsing stored cards:', error);
      return [];
    }
  }

  async saveCards(cards: VocabCard[]): Promise<void> {
    const serializedCards = cards.map(card => ({
      ...card,
      fsrsCard: this.serializeCard(card.fsrsCard)
    }));

    return new Promise((resolve) => {
      chrome.storage.local.set({
        [this.storageKey]: JSON.stringify(serializedCards)
      }, resolve);
    });
  }

  async createCard(vocab: VocabItem): Promise<VocabCard> {
    const id = `vocab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fsrsCard = createEmptyCard();

    const vocabCard: VocabCard = {
      id,
      vocab,
      fsrsCard,
      created: new Date().toISOString()
    };

    const existingCards = await this.getStoredCards();
    existingCards.push(vocabCard);
    await this.saveCards(existingCards);

    return vocabCard;
  }

  async reviewCard(cardId: string, grade: Grade): Promise<{ card: VocabCard; log: ReviewLog }> {
    const cards = await this.getStoredCards();
    const cardIndex = cards.findIndex(c => c.id === cardId);

    if (cardIndex === -1) {
      throw new Error(`Card with id ${cardId} not found`);
    }

    const card = cards[cardIndex];
    const reviewDate = new Date();
    const schedulingInfo = this.scheduler.repeat(card.fsrsCard, reviewDate);
    const selectedResult = schedulingInfo[grade];

    const updatedCard: VocabCard = {
      ...card,
      fsrsCard: selectedResult.card,
      lastReviewed: reviewDate.toISOString()
    };

    cards[cardIndex] = updatedCard;
    await this.saveCards(cards);

    return { card: updatedCard, log: selectedResult.log };
  }

  async getDueCards(): Promise<VocabCard[]> {
    const cards = await this.getStoredCards();
    const now = new Date();

    return cards.filter(card => card.fsrsCard.due <= now);
  }

  async getNewCards(): Promise<VocabCard[]> {
    const cards = await this.getStoredCards();
    return cards.filter(card => card.fsrsCard.state === 0); // State.New
  }

  isCardDue(card: VocabCard, currentDate: Date = new Date()): boolean {
    return card.fsrsCard.due <= currentDate;
  }

  private serializeCard(card: Card): Record<string, unknown> {
    return {
      ...card,
      due: card.due.toISOString(),
      last_review: card.last_review?.toISOString()
    };
  }

  private deserializeCard(data: Record<string, unknown> | Card): Card {
    // If already a Card object, return as-is
    if (data instanceof Object && 'due' in data && data.due instanceof Date) {
      return data as Card;
    }

    const serializedData = data as Record<string, unknown>;
    return {
      ...serializedData,
      due: new Date(serializedData.due as string),
      last_review: serializedData.last_review ? new Date(serializedData.last_review as string) : undefined
    } as Card;
  }

  // Convenience methods for rating
  static get Rating(): { Again: number; Hard: number; Good: number; Easy: number } {
    return {
      Again: Rating.Again,    // 1 - Wrong
      Hard: Rating.Hard,      // 2 - Hard
      Good: Rating.Good,      // 3 - Correct
      Easy: Rating.Easy       // 4 - Easy
    };
  }
}