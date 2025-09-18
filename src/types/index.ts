import type { Card } from 'ts-fsrs';

export interface TimedSubtitle {
  start: number;
  duration: number;
  text: string;
}

export interface VocabItem {
  original: string;           // Target language word (unique key)
  translations: string[];     // Array of translations (treated as set)
  fsrsCard?: Card;           // Optional FSRS card data
  created?: string;          // ISO date when first seen
  lastPicked?: string;       // Track for consecutive duplicate prevention
}

export interface SegmentVocabCache {
  videoId: string;
  segmentIndex: number;
  vocabulary: VocabItem[];
  timestamp: string;         // When cached
}

export interface POTTokenManager {
  getToken(): string | null;
  setToken(token: string): void;
}

export interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  name?: {
    simpleText: string;
  };
}

export interface YouTubeHelpers {
  getToken(): string | null;
  setToken(token: string): void;
}

// Chrome extension types
declare global {
  interface Window {
    youtubeSubtitleApp?: YouTubeSubtitleApp;
    ytInitialPlayerResponse?: YouTubePlayerResponse;
  }
}

interface YouTubeSubtitleApp {
  start(): void;
  stop(): void;
}

interface YouTubePlayerResponse {
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: CaptionTrack[];
    };
  };
}

interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  name?: {
    simpleText?: string;
  };
}

export interface POTTokenManager {
  getToken(): string | null;
  setToken(token: string): void;
}