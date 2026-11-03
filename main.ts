import { Notice, Platform, Plugin, TFile } from "obsidian";
import { Timer } from "src/Timer";
import { Controls } from "src/Controls";
import { AudioHandler, SendAudioOptions } from "src/AudioHandler";
import { WhisperSettingsTab } from "src/WhisperSettingsTab";
import { SettingsManager, PluginSettings } from "src/SettingsManager";
import { NativeAudioRecorder } from "src/AudioRecorder";
import { RecordingStatus, StatusBar } from "src/StatusBar";
import { getExtensionFromMimeType } from "src/utils";
export default class Whisper extends Plugin {
	settings: PluginSettings;
	settingsManager: SettingsManager;
	timer: Timer;
	recorder: NativeAudioRecorder;
	audioHandler: AudioHandler;
	controls: Controls | null = null;
	statusBar: StatusBar;
	// Output options for the recording in progress (set by URI/commands)
	private pendingOptions: SendAudioOptions = {};

	async onload() {
		this.settingsManager = new SettingsManager(this);
		this.settings = await this.settingsManager.loadSettings();

		this.addRibbonIcon("mic", "Open recording controls", () => {
			this.openControls();
		});

		this.addSettingTab(new WhisperSettingsTab(this.app, this));

		this.timer = new Timer();
		this.audioHandler = new AudioHandler(this);
		this.recorder = new NativeAudioRecorder();
		const deviceId =
			this.settings.audioDeviceId === "default"
				? null
				: this.settings.audioDeviceId;
		this.recorder.setDeviceId(deviceId);

		this.statusBar = new StatusBar(this);

		// Timer reacts to recording state changes
		this.statusBar.onChange((status) => {
			switch (status) {
				case RecordingStatus.Recording:
					this.timer.start();
					break;
				case RecordingStatus.Paused:
					this.timer.pause();
					break;
				case RecordingStatus.Processing:
				case RecordingStatus.Idle:
					this.timer.reset();
					break;
			}
		});

		this.addCommands();
		this.registerUriHandler();

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (!(file instanceof TFile)) return;

				const audioExtensions = [
					".mp3",
					".mp4",
					".mpeg",
					".mpga",
					".m4a",
					".wav",
					".webm",
					".ogg",
				];
				if (!audioExtensions.some((ext) => file.path.endsWith(ext)))
					return;

				menu.addItem((item) => {
					item.setTitle("Transcribe audio file 🔊")
						.setIcon("document")
						.onClick(async () => {
							const audioBlob = new Blob([
								await file.vault.readBinary(file),
							]);
							await this.audioHandler.sendAudioData(
								audioBlob,
								file.name
							);
						});
				});
			})
		);

		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor, info) => {
				menu.addItem((item) => {
					item.setTitle(
						editor.somethingSelected()
							? "Post-process selection"
							: "Post-process note"
					)
						.setIcon("sparkles")
						.onClick(() =>
							this.audioHandler.postProcessEditor(
								editor,
								info.file
							)
						);
				});
			})
		);
	}

	onunload() {
		if (this.controls) {
			this.controls.close();
		}
		this.statusBar.remove();
	}

	// --- Recording state transitions (single source of truth) ---

	async startRecording(options: SendAudioOptions = {}) {
		if (
			this.statusBar.status === RecordingStatus.Recording ||
			this.statusBar.status === RecordingStatus.Paused
		) {
			new Notice("Already recording");
			return;
		}
		this.pendingOptions = options;
		try {
			await this.recorder.startRecording();
			this.statusBar.updateStatus(RecordingStatus.Recording);
			new Notice("Recording...");
		} catch (err) {
			this.pendingOptions = {};
			this.statusBar.updateStatus(RecordingStatus.Idle);
			new Notice("✘ Could not start recording");
		}
	}

	async stopRecording() {
		if (
			this.statusBar.status !== RecordingStatus.Recording &&
			this.statusBar.status !== RecordingStatus.Paused
		) {
			return;
		}
		this.statusBar.updateStatus(RecordingStatus.Processing);
		const options = this.pendingOptions;
		this.pendingOptions = {};
		const audioBlob = await this.recorder.stopRecording();
		const extension = getExtensionFromMimeType(this.recorder.getMimeType());
		const fileName = `${new Date()
			.toISOString()
			.replace(/[:.]/g, "-")}.${extension}`;
		await this.audioHandler.sendAudioData(audioBlob, fileName, options);
		this.statusBar.updateStatus(RecordingStatus.Idle);
	}

	get isRecording(): boolean {
		return (
			this.statusBar.status === RecordingStatus.Recording ||
			this.statusBar.status === RecordingStatus.Paused
		);
	}

	async toggleRecording(options: SendAudioOptions = {}) {
		if (this.isRecording) {
			await this.stopRecording();
		} else {
			await this.startRecording(options);
		}
	}

	async pauseRecording() {
		if (this.statusBar.status === RecordingStatus.Recording) {
			await this.recorder.pauseRecording();
			this.statusBar.updateStatus(RecordingStatus.Paused);
			new Notice("Recording paused");
		} else if (this.statusBar.status === RecordingStatus.Paused) {
			await this.recorder.pauseRecording();
			this.statusBar.updateStatus(RecordingStatus.Recording);
			new Notice("Recording resumed");
		}
	}

	async cancelRecording() {
		if (
			this.statusBar.status !== RecordingStatus.Recording &&
			this.statusBar.status !== RecordingStatus.Paused
		) {
			return;
		}
		this.pendingOptions = {};
		await this.recorder.stopRecording();
		this.statusBar.updateStatus(RecordingStatus.Idle);
		new Notice("Recording cancelled");
	}

	openControls() {
		if (!this.controls) {
			this.controls = new Controls(this);
		}
		this.controls.open();
	}

	// --- Commands ---

	addCommands() {
		this.addCommand({
			id: "start-stop-recording",
			name: "Start/stop recording",
			callback: () => this.toggleRecording(),
			hotkeys: [{ modifiers: ["Alt"], key: "Q" }],
		});

		this.addCommand({
			id: "start-stop-recording-daily-note",
			name: "Start/stop recording to daily note",
			callback: () => this.toggleRecording({ target: "daily" }),
		});

		this.addCommand({
			id: "upload-audio-file",
			name: "Upload audio file",
			callback: () => {
				const fileInput = document.createElement("input");
				fileInput.type = "file";
				fileInput.accept =
					"audio/*,video/*,.mp4,.m4a,.wav,.webm,.ogg,.mp3";
				fileInput.onchange = async (event) => {
					const files = (event.target as HTMLInputElement).files;
					if (files && files.length > 0) {
						const file = files[0];
						const audioBlob = file.slice(0, file.size, file.type);
						await this.audioHandler.sendAudioData(
							audioBlob,
							file.name
						);
					}
				};
				fileInput.click();
			},
		});

		this.addCommand({
			id: "pause-resume-recording",
			name: "Pause/resume recording",
			callback: () => this.pauseRecording(),
		});

		this.addCommand({
			id: "open-recording-controls",
			name: "Open recording controls",
			callback: () => this.openControls(),
		});

		this.addCommand({
			id: "post-process-text",
			name: "Post-process selection or note",
			editorCallback: (editor, ctx) =>
				this.audioHandler.postProcessEditor(editor, ctx.file),
		});
	}

	// On mobile there's no hotkey or status bar, so after a URI-triggered
	// start show the controls modal with its Stop button
	private showControlsOnMobile() {
		if (Platform.isMobile && this.isRecording) {
			this.openControls();
		}
	}

	// Counterpart of showControlsOnMobile for URI-triggered stops
	private closeControlsIfIdle() {
		if (!this.isRecording) {
			this.controls?.close();
		}
	}

	// --- URI Handler ---

	registerUriHandler() {
		this.registerObsidianProtocolHandler("whisper", async (params) => {
			const command = params.command;
			if (!command) {
				this.openControls();
				return;
			}

			// obsidian://whisper?command=start&target=daily
			const options: SendAudioOptions =
				params.target === "daily"
					? { target: "daily", openNote: true }
					: {};

			switch (command) {
				case "start":
					await this.startRecording(options);
					this.showControlsOnMobile();
					break;
				case "toggle":
					await this.toggleRecording(options);
					this.showControlsOnMobile();
					this.closeControlsIfIdle();
					break;
				case "stop":
					await this.stopRecording();
					this.closeControlsIfIdle();
					break;
				case "pause":
					await this.pauseRecording();
					break;
				case "cancel":
					await this.cancelRecording();
					break;
				default:
					new Notice(`✘ Unknown whisper command: ${command}`);
			}
		});
	}
}
