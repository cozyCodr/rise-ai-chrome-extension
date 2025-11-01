# Rise AI - On-Device Resume & Cover Letter Generator

A Chrome extension built for the Google Chrome Built-in AI Challenge that uses the Prompt API and Gemini Nano to generate tailored resumes and cover letters entirely on your device.

## Features

**100% Private** - All AI processing happens locally in your browser using Gemini Nano. Your data never leaves your machine.

**Smart Tailoring** - Automatically emphasizes relevant experience and skills for each job application.

**No Hallucinations** - Only uses information from your profile, never invents or copies from job descriptions.

**Lightning Fast** - Generate professional documents in seconds with on-device AI.

**Live Editing** - Intuitive block-based editor powered by EditorJS for real-time customization.

**ATS-Friendly** - Clean, professional formatting that works with applicant tracking systems.

## How It Works

1. Save your professional profile once (experience, projects, skills, education)
2. Paste any job description
3. Click Generate - Gemini Nano creates a tailored resume or cover letter
4. Edit, download as PDF, and apply

## Installation

### Prerequisites

- Chrome Dev or Canary (version 127+)
- Gemini Nano enabled in Chrome

### Enable Gemini Nano

1. Open `chrome://flags/#optimization-guide-on-device-model`
2. Select "Enabled BypassPerfRequirement"
3. Open `chrome://flags/#prompt-api-for-gemini-nano`
4. Select "Enabled"
5. Relaunch Chrome
6. Open DevTools Console and run:
   ```javascript
   await ai.languageModel.capabilities();
   ```
7. If it returns `{available: "no"}`, run:
   ```javascript
   await ai.languageModel.create();
   ```
8. Wait for the model to download (check `chrome://components` for "Optimization Guide On Device Model")

### Load the Extension

1. Clone this repository
2. Open `chrome://extensions`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked"
5. Select the `rise-ai` folder

## Usage

1. Click the **r.Ai** button in the bottom-right corner of any webpage
2. Navigate to the **Profile** tab and add your professional information
3. Switch to the **Job Description** tab and paste a job posting
4. Click **Generate** and select either Resume or Cover Letter
5. Edit the generated document using the live editor
6. Download as PDF or copy to clipboard

## Tech Stack

- Chrome Prompt API
- Gemini Nano (on-device LLM)
- EditorJS (block-based editor)
- IndexedDB (local storage)
- jsPDF (PDF generation)

## Project Structure

```
rise-ai/
├── manifest.json           # Extension manifest
├── background.js          # Service worker
├── background/
│   ├── generation/        # Resume/cover letter generation logic
│   ├── offscreen/         # Offscreen document for Prompt API
│   ├── search/            # Context retrieval
│   └── state.js           # State management
├── content/
│   ├── bootstrap.js       # Content script entry
│   ├── panel-app.js       # Main panel application
│   ├── panel.html         # Panel UI templates
│   ├── panel.css          # Panel styles
│   ├── fab.css            # Floating button styles
│   ├── lib/               # EditorJS integration
│   └── modules/           # UI and data modules
└── vendor/
    └── pdfjs/             # PDF.js for PDF parsing
```

## Limitations

This extension uses Gemini Nano, which has specific constraints:

- Maximum 1024 tokens per prompt
- No streaming output
- Limited context window
- Requires sufficient system RAM

For more details, see [GEMINI_NANO_LIMITATIONS.md](GEMINI_NANO_LIMITATIONS.md)

## Privacy

Rise AI processes all data locally on your device. No data is sent to external servers. Your profile information is stored in your browser's IndexedDB and never leaves your machine.

## Development

This project was built for the Google Chrome Built-in AI Challenge to showcase the capabilities of on-device AI for privacy-focused productivity tools.

For the development journey, see [PROJECT_STORY.md](PROJECT_STORY.md)

## Demo

For a demo script, see [DEMO_SCRIPT.md](DEMO_SCRIPT.md)

## License

MIT

## Acknowledgments

Built with the Chrome Prompt API and Gemini Nano for the Google Chrome Built-in AI Challenge.