import axios from "axios";
import Whisper from "main";
import { Notice, MarkdownView, Editor, TFile } from "obsidian";
import {
	getBaseFileName,
	getCursorContext,
	buildTemplateVariables,
	resolveTemplate,
	sanitizeFileName,
	isUntitledName,
	splitFrontmatter,
	blockSeparator,
} from "./utils";
import { createPostProcessor } from "./PostProcessor";
import { appendToDailyNote } from "./DailyNote";

export interface SendAudioOptions {
	// Where the transcription goes; "daily" appends to today's daily note
	target?: "daily";
	// Open the note that received the text (used when triggered via URI)
	openNote?: boolean;
}

export class AudioHandler {
	private plugin: Whisper;

	constructor(plugin: Whisper) {
		this.plugin = plugin;
	}

	private async ensureFolderExists(folderPath: string): Promise<void> {
		if (
			folderPath &&
			!(await this.plugin.app.vault.adapter.exists(folderPath))
		) {
			await this.plugin.app.vault.createFolder(folderPath);
		}
	}

	async sendAudioData(
		blob: Blob,
		fileName: string,
		options: SendAudioOptions = {}
	): Promise<void> {
		// Get the base file name without extension
		const baseFileName = getBaseFileName(fileName);

		const toDailyNote =
			options.target === "daily" ||
			this.plugin.settings.appendToDailyNote;

		const audioFilePath = `${
			this.plugin.settings.audioSavePath
				? `${this.plugin.settings.audioSavePath}/`
				: ""
		}${fileName}`;

		const noteFilePath = `${
			this.plugin.settings.noteSavePath
				? `${this.plugin.settings.noteSavePath}/`
				: ""
		}${baseFileName}.md`;

		if (this.plugin.settings.debugMode) {
			new Notice(`Sending ${Math.round(blob.size / 1000)} KB...`);
		}

		const isDefaultApi =
			this.plugin.settings.apiUrl ===
			"https://api.openai.com/v1/audio/transcriptions";
		if (isDefaultApi && !this.plugin.settings.apiKey) {
			new Notice("✘ Add your API key in Whisper settings");
			return;
		}

		const MIN_AUDIO_SIZE_BYTES = 1000;
		if (blob.size < MIN_AUDIO_SIZE_BYTES) {
			new Notice("✘ Recording too short");
			return;
		}

		const formData = new FormData();
		formData.append("file", blob, fileName);
		formData.append("model", this.plugin.settings.model);
		if (
			this.plugin.settings.language &&
			this.plugin.settings.language !== "auto"
		) {
			formData.append("language", this.plugin.settings.language);
		}

		let prompt = this.plugin.settings.prompt || "";
		if (this.plugin.settings.cursorContext) {
			const editor =
				this.plugin.app.workspace.getActiveViewOfType(
					MarkdownView
				)?.editor;
			if (editor) {
				const context = getCursorContext(editor);
				prompt = prompt ? `${prompt}\n${context}` : context;
			}
		}
		if (prompt) formData.append("prompt", prompt);

		if (this.plugin.settings.temperature !== 0)
			formData.append(
				"temperature",
				String(this.plugin.settings.temperature)
			);
		if (this.plugin.settings.responseFormat !== "json")
			formData.append(
				"response_format",
				this.plugin.settings.responseFormat
			);

		try {
			// If the saveAudioFile setting is true, save the audio file
			if (this.plugin.settings.saveAudioFile) {
				await this.ensureFolderExists(
					this.plugin.settings.audioSavePath
				);
				const arrayBuffer = await blob.arrayBuffer();
				await this.plugin.app.vault.adapter.writeBinary(
					audioFilePath,
					new Uint8Array(arrayBuffer)
				);
				// No notice for intermediate save — final "Transcription complete" covers it
			}
		} catch (err) {
			console.error("Error saving audio file:", err);
			new Notice(
				"✘ Couldn't save audio: " +
					(err instanceof Error ? err.message : String(err))
			);
		}

		try {
			if (this.plugin.settings.debugMode) {
				new Notice("Transcribing...");
			}
			const response = await axios.post(
				this.plugin.settings.apiUrl,
				formData,
				{
					headers: {
						"Content-Type": "multipart/form-data",
						...(this.plugin.settings.apiKey
							? {
									Authorization: `Bearer ${this.plugin.settings.apiKey}`,
							  }
							: {}),
					},
				}
			);

			const originalText: string = response.data.text;
			let finalText = originalText;

			// Post-process with LLM if enabled
			if (this.plugin.settings.postProcessing) {
				const processor = createPostProcessor(this.plugin.settings);
				if (!processor) {
					new Notice(
						"✘ Add your post-processing API key in settings"
					);
					return;
				}
				try {
					if (this.plugin.settings.debugMode) {
						new Notice("Post-processing...");
					}
					finalText = await processor.process(
						originalText,
						this.plugin.settings.postProcessingPrompt
					);
				} catch (err) {
					console.error("Post-processing failed:", err);
					new Notice(
						"✘ Post-processing failed, using original transcription"
					);
					finalText = originalText;
				}
			}

			// Auto-generate title for the note filename
			let generatedTitle = baseFileName;
			const needsTitle = toDailyNote
				? this.plugin.settings.dailyNoteEntryTemplate.includes(
						"{{title}}"
				  )
				: this.plugin.settings.createNoteFile;
			if (this.plugin.settings.autoGenerateTitle && needsTitle) {
				const processor = createPostProcessor(this.plugin.settings);
				if (processor) {
					try {
						const title = await processor.generateTitle(
							finalText,
							this.plugin.settings.titleGenerationPrompt
						);
						if (title) {
							generatedTitle = title;
						}
					} catch (err) {
						console.error("Title generation failed:", err);
					}
				}
			}

			// Build note content with templates
			const outputText =
				this.plugin.settings.keepOriginalTranscription &&
				finalText !== originalText
					? `${finalText}\n\n---\n\n*Original transcription:*\n${originalText}`
					: finalText;

			if (toDailyNote) {
				const appended = await this.appendToDaily(
					outputText,
					generatedTitle,
					audioFilePath,
					options.openNote ?? false
				);
				// Fall through to the regular output when the daily note
				// can't be used, so the transcription is never lost
				if (appended) return;
			}

			if (this.plugin.settings.createNoteFile) {
				await this.ensureFolderExists(
					this.plugin.settings.noteSavePath
				);

				const vars = buildTemplateVariables(
					outputText,
					generatedTitle,
					audioFilePath
				);

				// Resolve filename template
				const resolvedFilename =
					sanitizeFileName(
						resolveTemplate(
							this.plugin.settings.noteFilenameTemplate,
							vars
						)
					) || baseFileName;

				const folder = this.plugin.settings.noteSavePath;
				const resolvedNoteFilePath = `${
					folder ? `${folder}/` : ""
				}${resolvedFilename}.md`;

				// Resolve note content template
				const noteContent = resolveTemplate(
					this.plugin.settings.noteTemplate,
					vars
				).trim();

				await this.plugin.app.vault.create(
					resolvedNoteFilePath,
					noteContent
				);
			}

			// Paste at cursor if there's an active editor
			const view =
				this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
			const editor = view?.editor;
			if (editor) {
				const cursorPosition = editor.getCursor();
				editor.replaceRange(outputText, cursorPosition);

				const newPosition = {
					line: cursorPosition.line,
					ch: cursorPosition.ch + outputText.length,
				};
				editor.setCursor(newPosition);

				// Name the open note after its content if it's still "Untitled"
				if (
					this.plugin.settings.autoGenerateTitle &&
					!this.plugin.settings.createNoteFile
				) {
					await this.renameIfUntitled(view.file, finalText);
				}
			}

			new Notice("Transcription complete");
		} catch (err) {
			console.error("Error parsing audio:", err);
			new Notice(
				"✘ Transcription failed: " +
					(err instanceof Error ? err.message : String(err))
			);
		}
	}

	// Appends the transcription to today's daily note. Returns false when the
	// daily note isn't available so the caller can fall back.
	private async appendToDaily(
		outputText: string,
		title: string,
		audioFilePath: string,
		openNote: boolean
	): Promise<boolean> {
		const vars = buildTemplateVariables(outputText, title, audioFilePath);
		const entry = resolveTemplate(
			this.plugin.settings.dailyNoteEntryTemplate,
			vars
		).trim();
		try {
			const file = await appendToDailyNote(this.plugin.app, entry);
			if (openNote) {
				await this.plugin.app.workspace.getLeaf(false).openFile(file);
			}
			new Notice(`Added to ${file.basename}`);
			return true;
		} catch (err) {
			console.error("Couldn't append to daily note:", err);
			new Notice(
				"✘ Couldn't append to daily note: " +
					(err instanceof Error ? err.message : String(err))
			);
			return false;
		}
	}

	// Post-processes the selection, or the whole note body when nothing is selected,
	// and inserts the result below it
	async postProcessEditor(editor: Editor, file: TFile | null): Promise<void> {
		const processor = createPostProcessor(this.plugin.settings);
		if (!processor) {
			new Notice("✘ Add your post-processing API key in settings");
			return;
		}

		const selection = editor.getSelection();
		const { body } = splitFrontmatter(editor.getValue());
		const input = selection || body;
		if (!input.trim()) {
			new Notice("✘ Nothing to post-process");
			return;
		}

		const notice = new Notice("Post-processing...", 0);
		try {
			const output = await processor.process(
				input,
				this.plugin.settings.postProcessingPrompt
			);
			// Keep the original and insert the result after it
			const end = selection
				? editor.getCursor("to")
				: editor.offsetToPos(editor.getValue().length);
			const before = editor.getRange({ line: 0, ch: 0 }, end);
			const inserted = `${blockSeparator(before)}${output}`;
			editor.replaceRange(inserted, end);
			editor.setCursor(
				editor.offsetToPos(editor.posToOffset(end) + inserted.length)
			);

			if (this.plugin.settings.autoGenerateTitle) {
				await this.renameIfUntitled(file, output);
			}
			new Notice("Post-processing complete");
		} catch (err) {
			console.error("Post-processing failed:", err);
			new Notice(
				"✘ Post-processing failed: " +
					(err instanceof Error ? err.message : String(err))
			);
		} finally {
			notice.hide();
		}
	}

	private async renameIfUntitled(
		file: TFile | null,
		text: string
	): Promise<void> {
		if (!file || !isUntitledName(file.basename)) return;
		const processor = createPostProcessor(this.plugin.settings);
		if (!processor) return;

		try {
			const title = await processor.generateTitle(
				text,
				this.plugin.settings.titleGenerationPrompt
			);
			if (!title) return;

			const folder =
				file.parent && file.parent.path !== "/"
					? `${file.parent.path}/`
					: "";
			let path = `${folder}${title}.md`;
			for (
				let i = 1;
				this.plugin.app.vault.getAbstractFileByPath(path);
				i++
			) {
				path = `${folder}${title} ${i}.md`;
			}
			await this.plugin.app.fileManager.renameFile(file, path);
		} catch (err) {
			console.error("Title generation failed:", err);
		}
	}
}
