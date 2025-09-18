import type { POTTokenManager, CaptionTrack } from '../types/index.js';
import browser from 'webextension-polyfill';

export class YouTubeHelpers {
  static initializePOTTokenCapture(): POTTokenManager {
    let poToken = null;

    const script = document.createElement('script');
    script.src = browser.runtime.getURL('injected.js');
    script.onload = (): void => {
      console.log('[Content Script] injected.js loaded');
      script.remove();
    };
    (document.head || document.documentElement).appendChild(script);

    window.addEventListener('FoundPOT', (event) => {
      poToken = event.detail;
      console.log('[Content Script] POT token found:', poToken);
    });

    return {
      getToken: (): string | null => poToken,
      setToken: (token: string): void => { poToken = token; }
    };
  }

  static async toggleUntilPoTokenSet(tokenManager: POTTokenManager): Promise<void> {
    const captionsButton = document.querySelector('.ytp-subtitles-button');
    if (!captionsButton) return;

    while (tokenManager.getToken() === null) {
      captionsButton.click();
      captionsButton.click();

      const startTime = Date.now();
      while (tokenManager.getToken() === null && Date.now() - startTime < 2000) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  static getVideoId(): string | null {
    return new URLSearchParams(window.location.search).get('v');
  }

  static async fetchVideoPage(videoId: string): Promise<string> {
    const url = 'https://www.youtube.com/watch?v=' + videoId;
    return fetch(url).then(resp => resp.text());
  }

  static extractCaptionTracks(html: string): CaptionTrack[] | null {
    const regex = /\{"captionTracks":(\[.*?\]),/g;
    const arr = regex.exec(html);
    return arr ? JSON.parse(arr[1]) : null;
  }

  static buildSubtitleUrl(baseUrl: string, poToken: string | null): string {
    return baseUrl + '&pot=' + poToken + '&c=WEB';
  }
}