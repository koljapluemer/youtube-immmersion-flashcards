import type { Card, ReviewLog, FSRS, Grade } from 'ts-fsrs';
import { createEmptyCard, fsrs, Rating } from 'ts-fsrs';
import type { VocabItem } from '../types/index.js';
import browser from 'webextension-polyfill';

export interface VocabCard {
  id: string;
  vocab: VocabItem;
  fsrsCard: Card;
  created: string; // ISO date
  lastPicked?: string; // Track when last picked to prevent consecutive duplicates
}

export class FSRSCardManager {
  private scheduler: FSRS = fsrs();
  private storageKey = 'vocab_cards';

  async getStoredCards(): Promise<VocabCard[]> {
    const result = await browser.storage.local.get([this.storageKey]);

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

    await browser.storage.local.set({
      [this.storageKey]: JSON.stringify(serializedCards)
    });
  }

  async createCard(vocab: VocabItem): Promise<VocabCard> {
    const id = `vocab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fsrsCard = createEmptyCard(new Date()); // Use the CORRECT function for new cards

    const vocabCard: VocabCard = {
      id,
      vocab,
      fsrsCard,
      created: new Date().toISOString(),
      lastPicked: undefined
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
      lastReviewed: reviewDate.toISOString(),
      lastPicked: reviewDate.toISOString()
    };

    // Special handling for "Wrong" (Again) button - set due immediately
    if (grade === Rating.Again) {
      updatedCard.fsrsCard.due = new Date();
    }

    cards[cardIndex] = updatedCard;
    await this.saveCards(cards);

    return { card: updatedCard, log: selectedResult.log };
  }

  async getCardStatus(vocab: VocabItem): Promise<'NEW' | 'DUE' | 'NOT_DUE'> {
    const cards = await this.getStoredCards();
    const existingCard = cards.find(card => card.vocab.original === vocab.original);

    if (!existingCard) {
      return 'NEW';
    }

    const currentDate = new Date();
    return currentDate >= existingCard.fsrsCard.due ? 'DUE' : 'NOT_DUE';
  }

  async findExistingCard(vocab: VocabItem): Promise<VocabCard | null> {
    const cards = await this.getStoredCards();
    return cards.find(card => card.vocab.original === vocab.original) || null;
  }

  async getNextAvailableCard(vocabulary: VocabItem[], lastPickedId?: string): Promise<{vocab: VocabItem, status: 'NEW' | 'DUE', existingCard?: VocabCard} | null> {
    for (const vocab of vocabulary) {
      // Skip if this was the last picked vocab
      if (lastPickedId && vocab.original === lastPickedId) {
        continue;
      }

      const status = await this.getCardStatus(vocab);
      if (status === 'NEW' || status === 'DUE') {
        const existingCard = status === 'DUE' ? await this.findExistingCard(vocab) : undefined;
        return { vocab, status, existingCard };
      }
    }

    return null;
  }

  async markCardAsPicked(vocab: VocabItem): Promise<void> {
    const cards = await this.getStoredCards();
    const cardIndex = cards.findIndex(card => card.vocab.original === vocab.original);

    if (cardIndex !== -1) {
      cards[cardIndex].lastPicked = new Date().toISOString();
      await this.saveCards(cards);
    }
  }

  async createAndMarkNewCard(vocab: VocabItem): Promise<VocabCard> {
    const newCard = await this.createCard(vocab);
    newCard.lastPicked = new Date().toISOString();

    // Update the card in storage with lastPicked
    const cards = await this.getStoredCards();
    const cardIndex = cards.findIndex(card => card.id === newCard.id);
    if (cardIndex !== -1) {
      cards[cardIndex] = newCard;
      await this.saveCards(cards);
    }

    return newCard;
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