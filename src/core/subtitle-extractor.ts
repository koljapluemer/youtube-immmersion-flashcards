import { YouTubeHelpers } from '../utils/youtube-helpers.js';
import type { TimedSubtitle, POTTokenManager, CaptionTrack } from '../types/index.js';

export class SubtitleExtractor {
  private tokenManager: POTTokenManager;

  constructor() {
    this.tokenManager = YouTubeHelpers.initializePOTTokenCapture();
  }

  async extractSubtitles(): Promise<TimedSubtitle[]> {
    try {
      console.log('getSubtitles called');
      console.log('Current poToken:', this.tokenManager.getToken());

      const videoId = YouTubeHelpers.getVideoId();
      console.log('Video ID:', videoId);

      if (!videoId) {
        throw new Error('Could not extract video ID');
      }

      const { captionTracks, defaultAudioLanguage } = await this.getCaptionMetadata(videoId);
      const selectedTrack = this.selectBestCaptionTrack(captionTracks, defaultAudioLanguage);

      console.log('[SubtitleExtractor] Selected caption track (auto):', {
        languageCode: selectedTrack.languageCode,
        vssId: selectedTrack.vssId,
        kind: selectedTrack.kind,
        name: selectedTrack.name?.simpleText
      });

      return await this.fetchSubtitlesForTrack(selectedTrack);
    } catch (error) {
      console.error('[SubtitleExtractor] Error in getSubtitles:', error);
      throw error;
    }
  }

  async getCaptionMetadata(videoId: string): Promise<{ captionTracks: CaptionTrack[]; defaultAudioLanguage: string | null }> {
    const html = await YouTubeHelpers.fetchVideoPage(videoId);
    const captionTracks = YouTubeHelpers.extractCaptionTracks(html);

    if (!captionTracks || captionTracks.length === 0) {
      throw new Error('No subtitles found for this video');
    }

    console.log('[SubtitleExtractor] Available tracks:', captionTracks.map(t => `${t.languageCode}: ${t.name?.simpleText || 'Unknown'} (${t.kind || 'standard'})`));

    const defaultAudioLanguage = YouTubeHelpers.extractDefaultAudioLanguage(html);
    console.log('[SubtitleExtractor] Default audio language:', defaultAudioLanguage);

    return { captionTracks, defaultAudioLanguage };
  }

  async fetchSubtitlesForTrack(track: CaptionTrack): Promise<TimedSubtitle[]> {
    if (!this.tokenManager.getToken()) {
      console.log('No POT token, attempting to get one...');
      await YouTubeHelpers.toggleUntilPoTokenSet(this.tokenManager);
      console.log('POT token after toggle:', this.tokenManager.getToken());
    }

    const subsUrl = YouTubeHelpers.buildSubtitleUrl(track.baseUrl, this.tokenManager.getToken());
    console.log('[SubtitleExtractor] Fetching with POT token:', subsUrl.substring(0, 100) + '...');

    const subsResponse = await fetch(subsUrl);
    const xmlText = await subsResponse.text();

    if (xmlText.length === 0) {
      throw new Error(`Empty response from YouTube API. Status: ${subsResponse.status}`);
    }

    return this.parseSubtitleXML(xmlText);
  }

  selectBestCaptionTrack(captionTracks: CaptionTrack[], preferredLanguage: string | null): CaptionTrack {
    if (!captionTracks.length) {
      throw new Error('No caption tracks available');
    }

    const normalize = (value?: string | null): string | null => {
      if (!value) return null;
      return value.trim().toLowerCase().replace('_', '-');
    };

    const preferred = normalize(preferredLanguage);
    const preferredBase = preferred?.split('-')[0];

    console.log('[SubtitleExtractor] Preferred language (raw/base):', preferred, preferredBase);

    captionTracks.forEach((track, index) => {
      const code = normalize(track.languageCode);
      const vss = normalize(track.vssId?.replace(/^\./, ''));
      const baseCode = code?.split('-')[0];
      const baseVss = vss?.split('-')[0];
      console.log('[SubtitleExtractor] Track candidate', index, {
        languageCode: track.languageCode,
        vssId: track.vssId,
        kind: track.kind,
        normalizedCode: code,
        normalizedVss: vss,
        baseCode,
        baseVss,
        title: track.name?.simpleText
      });
    });

    if (!preferred) {
      console.log('[SubtitleExtractor] No preferred language detected, using first track');
      return captionTracks[0];
    }

    const matchByLanguage = captionTracks.find(track => {
      const code = normalize(track.languageCode);
      const vss = normalize(track.vssId?.replace(/^\./, ''));
      const isMatch = code === preferred || vss === preferred;
      if (isMatch) {
        console.log('[SubtitleExtractor] Exact language match found:', {
          languageCode: track.languageCode,
          vssId: track.vssId,
          kind: track.kind
        });
      }
      return isMatch;
    });

    if (matchByLanguage) {
      return matchByLanguage;
    }

    const partialMatches = captionTracks.filter(track => {
      const code = normalize(track.languageCode)?.split('-')[0];
      const vss = normalize(track.vssId?.replace(/^\./, ''));
      const baseVss = vss?.split('-')[0];
      const isPartial = code === preferredBase || baseVss === preferredBase;
      if (isPartial) {
        console.log('[SubtitleExtractor] Partial language match candidate:', {
          languageCode: track.languageCode,
          vssId: track.vssId,
          kind: track.kind,
          normalizedCode: code,
          normalizedVss: vss
        });
      }
      return isPartial;
    });

    if (partialMatches.length) {
      const nonAsr = partialMatches.find(track => track.kind !== 'asr');
      if (nonAsr) {
        console.log('[SubtitleExtractor] Using partial match (non-ASR preferred):', {
          languageCode: nonAsr.languageCode,
          vssId: nonAsr.vssId,
          kind: nonAsr.kind
        });
        return nonAsr;
      }

      console.log('[SubtitleExtractor] Using partial match (only ASR available):', {
        languageCode: partialMatches[0].languageCode,
        vssId: partialMatches[0].vssId,
        kind: partialMatches[0].kind
      });
      return partialMatches[0];
    }

    console.log('[SubtitleExtractor] No matching tracks found, falling back to first track');
    return captionTracks[0];
  }

  parseSubtitleXML(xmlText: string): TimedSubtitle[] {
    console.log('[SubtitleExtractor] XML response (first 500 chars):', xmlText.substring(0, 500));

    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlText, 'text/xml');
    const textNodes = xml.getElementsByTagName('text');

    console.log('[SubtitleExtractor] Number of text nodes:', textNodes.length);

    if (textNodes.length === 0) {
      throw new Error('No text nodes found in XML');
    }

    console.log('[SubtitleExtractor] First text node:', textNodes[0]);
    console.log('[SubtitleExtractor] First text attributes:', {
      start: textNodes[0].getAttribute('start'),
      dur: textNodes[0].getAttribute('dur'),
      text: textNodes[0].textContent
    });

    const timedSubtitles = Array.from(textNodes).map(node => ({
      start: parseFloat(node.getAttribute('start') || 0),
      duration: parseFloat(node.getAttribute('dur') || 0),
      text: node.textContent
    }));

    console.log('[SubtitleExtractor] Timed subtitles (first 5):', timedSubtitles.slice(0, 5));
    return timedSubtitles;
  }
}
