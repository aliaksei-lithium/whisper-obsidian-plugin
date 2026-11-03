# Whisper — Speech-to-text for Obsidian

Record or upload audio, transcribe with [Whisper](https://openai.com/research/whisper), and optionally post-process the result with an LLM. Works on desktop and mobile.

Works with OpenAI, Groq, Azure, or any other Whisper-compatible API.

## Quick Start

1. Install from **Settings → Community Plugins** → search "Whisper"
2. Add your API key in the plugin settings
3. Open a note, press `Alt + Q`, speak, press `Alt + Q` again

The transcription appears at your cursor.

## Usage

**Record** — click the mic icon in the sidebar, or press `Alt + Q` to start/stop.

**Upload** — command palette → *Upload audio file* (mp3, mp4, m4a, wav, webm, ogg).

**Right-click** — right-click any audio file in your vault → *Transcribe audio file*.

All commands can be assigned custom hotkeys in Obsidian's hotkey settings:

- Start/stop recording (`Alt + Q` by default)
- Start/stop recording to daily note
- Pause/resume recording
- Open recording controls
- Upload audio file

### Automation

Trigger from iOS Shortcuts, Alfred, or any tool that can open URLs:

```
obsidian://whisper                 open controls
obsidian://whisper?command=start   start recording
obsidian://whisper?command=stop    stop and transcribe
obsidian://whisper?command=toggle  start, or stop and transcribe
obsidian://whisper?command=pause   pause/resume
obsidian://whisper?command=cancel  discard recording
```

Add `&target=daily` to `start` or `toggle` to send that recording to today's daily note, regardless of the output settings. On mobile the recording controls open automatically so you have a Stop button.

### iOS widget for quick voice notes

Record a thought from the Home Screen, Lock Screen, Control Center, or the Action button and have the transcription land in today's daily note:

1. Enable the **Daily notes** core plugin in Obsidian.
2. In the Shortcuts app, create a shortcut with two **Open URLs** actions:
   - `obsidian://open?vault=YourVault` — wakes Obsidian first, so the second URL isn't lost on a cold start
   - `obsidian://whisper?command=toggle&target=daily`
3. Add the shortcut to your Home Screen as a widget, to Control Center (iOS 18+), or assign it to the Action button.

Tap once to start recording, speak, then tap again (or press **Stop** in Obsidian) to transcribe. Keep Obsidian in the foreground while recording — iOS mutes the microphone for apps in the background.

## Post-Processing

Enable **Post-processing** in settings to run transcriptions through an LLM — fix grammar, remove filler words, format as markdown, extract action items.

Supports Claude, GPT, or any OpenAI-compatible endpoint (Ollama, LM Studio, etc.).

You can also enable **Auto-generate title** to create descriptive filenames for your notes.

## Daily Note

Enable **Append to daily note** in settings to add every transcription to the end of today's daily note instead of creating a new note. The note is created from your Daily notes template if it doesn't exist yet. Each entry uses the **Daily note entry template**, by default:

```
## {{clock}}
![[{{audioFile}}]]
{{transcription}}
```

## Note Templates

When **Create note file** is enabled, you can customize the filename and content using template variables:

| Variable | Example |
|---|---|
| `{{title}}` | `Meeting Notes` |
| `{{audioFile}}` | `recordings/2026-04-05.webm` |
| `{{transcription}}` | *the transcribed text* |
| `{{date}}` | `2026-04-05` |
| `{{time}}` | `14-30-00` |
| `{{clock}}` | `14:30` |
| `{{datetime}}` | `2026-04-05 14:30:00` |

Example note template:

```
# {{title}}
![[{{audioFile}}]]

{{transcription}}
```

Use `![[{{audioFile}}]]` to embed audio (playable) or `[[{{audioFile}}]]` to link.

## Manual Installation

Download `manifest.json`, `main.js`, `styles.css` from [releases](https://github.com/nikdanilov/whisper-obsidian-plugin/releases) into `.obsidian/plugins/whisper/` in your vault.

## Contributing

Issues and PRs welcome — [GitHub Issues](https://github.com/nikdanilov/whisper-obsidian-plugin/issues)

---

[Buy me a coffee](https://ko-fi.com/nikdanilov) · [@nikdanilov\_](https://twitter.com/nikdanilov_)

[<img src="https://user-images.githubusercontent.com/14358394/115450238-f39e8100-a21b-11eb-89d0-fa4b82cdbce8.png" width="200">](https://ko-fi.com/nikdanilov)
