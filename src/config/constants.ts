export const SELECTORS = {
  VIDEO_TITLE: 'h1.ytd-watch-metadata yt-formatted-string',
  VIDEO_ELEMENT: 'video',
  VIDEO_CONTAINER: '#movie_player',
  SUBTITLES_BUTTON: '.ytp-subtitles-button'
};

export const CSS_CLASSES = {
  CUSTOM_BUTTON: 'custom-alert-button',
  SUBTITLE_UI_CONTAINER: 'subtitle-ui-container',
  SUBTITLE_TEXT: 'subtitle-text'
};

export const STYLES = {
  BUTTON: `
    background: #ff0000;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 4px 8px;
    margin-right: 8px;
    cursor: pointer;
    font-size: 14px;
    display: inline-block;
  `,

  UI_CONTAINER: `
    background: #000;
    color: white;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: 40px;
    box-sizing: border-box;
    font-family: Arial, sans-serif;
  `,

  SUBTITLE_TEXT: `
    font-size: 24px;
    line-height: 1.5;
    text-align: center;
    margin-bottom: 40px;
    max-width: 80%;
  `,

  CONTROL_BUTTON: `
    font-size: 18px;
    padding: 12px 24px;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    margin: 20px;
  `,

  NEXT_BUTTON: `
    background: #ff0000;
  `,

  CLOSE_BUTTON: `
    background: #666;
  `
};

export const TIMING = {
  POT_TOKEN_TIMEOUT: 2000,
  POT_TOKEN_CHECK_INTERVAL: 100,
  VIDEO_BUFFER_TIME: 0.5,
  UI_TRANSITION_DELAY: 500
};