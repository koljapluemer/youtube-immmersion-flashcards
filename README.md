# YouTube Immersion Flashcards

https://github.com/user-attachments/assets/cef7e005-9b76-489e-8803-e9ccf634097a

Practice the words needed to understand a segment of a video.
Useful for immersion learning as a beginner language learner.

A Chrome extension that creates vocabulary flashcards from YouTube subtitles using AI, with spaced repetition learning (FSRS algorithm).

## Features

- **AI Vocabulary Extraction**: Automatically extracts vocabulary from YouTube subtitles using OpenAI
- **Spaced Repetition**: Uses FSRS algorithm for optimal learning intervals
- **Intelligent Caching**: Avoids repeated API calls for the same content
- **Practice Flow**: Watch → Practice → Evaluate → Repeat
- **Cross-browser Support**: Chrome and Firefox compatible

## Installation

- This add-on cannot be installed via extensions stores yet because I haven't got it signed yet, and I think my way of interacting with YouTube is a little naughty so I'm not sure it'd pass, so that's still on the roadmap.
- You can use this on Firefox theoretically, but only via `web-ext`, but I can't get that to work on my machine, so no instructions yet.

### Chrome (Manual Install)

1. **Download**: Clone or download this repository
2. **Build**: Run `npm install && npm run build` 
3. **Install Extension**:
   - Open Chrome → `chrome://extensions/`
   - Enable "Developer mode" (top right toggle)
   - Click "Load unpacked"
   - Select the `dist` folder from this project

### Prerequisites

- Node.js and npm installed
- OpenAI API key

## Usage

2. **Choose**: Go to any YouTube video with subtitles
3. **Start Practice**: Click "Start Practice" button below the video
   - Add your OpenAI API key when asked
4. **Learn**: Practice vocabulary flashcards with FSRS spaced repetition
4. **Watch**: Watch the video segment that you just practiced for
5. **Evaluate**: Rate your understanding after each segment
6. **Continue**: Move to next subtitle segment

## Development

```bash
npm install
npm run build          # Build for production
npm run dev           # Development mode with watch
```

## API Usage

The extension uses OpenAI's API to extract vocabulary from subtitle text. API calls are minimized through intelligent caching.
The costs of going through a whole video are usually between 1 and 30 cents in my experience.
