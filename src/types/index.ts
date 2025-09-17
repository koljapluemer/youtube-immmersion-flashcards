export interface TimedSubtitle {
  start: number;
  duration: number;
  text: string;
}

export interface VocabItem {
  original: string;
  translation: string;
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