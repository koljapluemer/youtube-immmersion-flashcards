class SubtitleExtractor {
  constructor() {
    this.tokenManager = YouTubeHelpers.initializePOTTokenCapture();
  }

  async extractSubtitles() {
    try {
      console.log('getSubtitles called');
      console.log('Current poToken:', this.tokenManager.getToken());

      const videoId = YouTubeHelpers.getVideoId();
      console.log('Video ID:', videoId);

      if (!videoId) {
        throw new Error('Could not extract video ID');
      }

      const html = await YouTubeHelpers.fetchVideoPage(videoId);
      const captionTracks = YouTubeHelpers.extractCaptionTracks(html);

      if (!captionTracks) {
        throw new Error('No subtitles found for this video');
      }

      console.log('Available tracks:', captionTracks.map(t => `${t.languageCode}: ${t.name?.simpleText || 'Unknown'}`));

      if (!this.tokenManager.getToken()) {
        console.log('No POT token, attempting to get one...');
        await YouTubeHelpers.toggleUntilPoTokenSet(this.tokenManager);
        console.log('POT token after toggle:', this.tokenManager.getToken());
      }

      const subsUrl = YouTubeHelpers.buildSubtitleUrl(captionTracks[0].baseUrl, this.tokenManager.getToken());
      console.log('Fetching with POT token:', subsUrl.substring(0, 100) + '...');

      const subsResponse = await fetch(subsUrl);
      const xmlText = await subsResponse.text();

      if (xmlText.length === 0) {
        throw new Error(`Empty response from YouTube API. Status: ${subsResponse.status}`);
      }

      return this.parseSubtitleXML(xmlText);
    } catch (error) {
      console.error('Error in getSubtitles:', error);
      throw error;
    }
  }

  parseSubtitleXML(xmlText) {
    console.log('XML response:', xmlText.substring(0, 500));

    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlText, 'text/xml');
    const textNodes = xml.getElementsByTagName('text');

    console.log('Number of text nodes:', textNodes.length);

    if (textNodes.length === 0) {
      throw new Error('No text nodes found in XML');
    }

    console.log('First text node:', textNodes[0]);
    console.log('First text attributes:', {
      start: textNodes[0].getAttribute('start'),
      dur: textNodes[0].getAttribute('dur'),
      text: textNodes[0].textContent
    });

    const timedSubtitles = Array.from(textNodes).map(node => ({
      start: parseFloat(node.getAttribute('start') || 0),
      duration: parseFloat(node.getAttribute('dur') || 0),
      text: node.textContent
    }));

    console.log('Timed subtitles (first 5):', timedSubtitles.slice(0, 5));
    return timedSubtitles;
  }
}