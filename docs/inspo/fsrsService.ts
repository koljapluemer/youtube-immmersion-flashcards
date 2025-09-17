import type { TFile } from 'obsidian';
import type { Card, ReviewLog, FSRS, Grade, IPreview } from 'ts-fsrs';
import { createEmptyCard, fsrs } from 'ts-fsrs';

import type { NoteService } from '../noteService';

export class FSRSService {
	private noteService: NoteService;
	private scheduler: FSRS = fsrs();

	constructor(noteService: NoteService) {
		this.noteService = noteService;
	}

	/**
	 * Load FSRS card data from note frontmatter, or create empty card if none exists
	 */
	async loadCard(note: TFile): Promise<Card> {
		try {
			const frontmatter = this.noteService.getFrontmatter(note);
			const cardData = frontmatter['see-you-again-learning-data'];

			if (cardData && this.isValidCardData(cardData)) {
				return this.deserializeCard(cardData as unknown as Record<string, unknown>);
			}
		} catch (error) {
			// If frontmatter access fails, fall through to empty card
		}

		// Return empty card if no valid data exists
		return createEmptyCard();
	}

	/**
	 * Save FSRS card data to note frontmatter
	 */
	async saveCard(note: TFile, card: Card): Promise<void> {
		const cardData: unknown = this.serializeCard(card);
		await this.noteService.setFrontmatterProperty(note, 'see-you-again-learning-data', cardData);
	}

	/**
	 * Process a review rating and return updated card
	 */
	reviewCard(card: Card, grade: Grade, reviewDate: Date = new Date()): { card: Card; log: ReviewLog } {
		const schedulingInfo: IPreview = this.scheduler.repeat(card, reviewDate);
		const selectedResult = schedulingInfo[grade];
		return { card: selectedResult.card, log: selectedResult.log };
	}

	/**
	 * Check if a card is due for review
	 */
	isCardDue(card: Card, currentDate: Date = new Date()): boolean {
		return card.due <= currentDate;
	}

	/**
	 * Check if a note has FSRS data (is not unseen)
	 */
	hasCardData(note: TFile): boolean {
		try {
			const frontmatter = this.noteService.getFrontmatter(note);
			const cardData = frontmatter['see-you-again-learning-data'];
			return cardData && this.isValidCardData(cardData);
		} catch (error) {
			return false;
		}
	}

	/**
	 * Get due date from card data without fully deserializing
	 */
	getCardDueDate(note: TFile): Date | null {
		try {
			const frontmatter = this.noteService.getFrontmatter(note);
			const cardData = frontmatter['see-you-again-learning-data'];

			if (cardData && typeof cardData === 'object' && 'due' in cardData) {
				const typedCardData = cardData as { due: string };
				return new Date(typedCardData.due);
			}
		} catch (error) {
			// Failed to get card due date
		}

		return null;
	}

	private serializeCard(card: Card): Record<string, unknown> {
		return {
			...card,
			due: card.due.toISOString(),
			last_review: card.last_review?.toISOString()
		};
	}

	private deserializeCard(data: Record<string, unknown>): Card {
		return {
			...data,
			due: new Date(data.due as string),
			last_review: (data.last_review !== null && data.last_review !== undefined) ? new Date(data.last_review as string) : undefined
		} as Card;
	}

	private isValidCardData(data: unknown): boolean {
		if (data === null || data === undefined || typeof data !== 'object') {
			return false;
		}
		const obj = data as Record<string, unknown>;
		return typeof obj.due === 'string' &&
			typeof obj.stability === 'number' &&
			typeof obj.difficulty === 'number' &&
			typeof obj.elapsed_days === 'number' &&
			typeof obj.scheduled_days === 'number' &&
			typeof obj.reps === 'number' &&
			typeof obj.lapses === 'number' &&
			typeof obj.state === 'number';
	}
}