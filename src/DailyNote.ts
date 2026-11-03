import { App, TFile, moment, normalizePath } from "obsidian";
import { blockSeparator } from "./utils";

export const DEFAULT_DAILY_NOTE_FORMAT = "YYYY-MM-DD";

export interface DailyNoteSettings {
	folder: string;
	format: string;
	template: string;
}

// Minimal view of a moment instance so the pure helpers stay testable
export interface DateFormatter {
	format(format: string): string;
}

// Reads the core Daily notes plugin configuration. Returns null when the
// core plugin is disabled, since the user clearly doesn't use daily notes.
export function readDailyNoteSettings(app: App): DailyNoteSettings | null {
	const plugin = (
		app as unknown as {
			internalPlugins?: {
				getPluginById?: (id: string) => {
					enabled?: boolean;
					instance?: { options?: Partial<DailyNoteSettings> };
				} | null;
			};
		}
	).internalPlugins?.getPluginById?.("daily-notes");
	if (!plugin || plugin.enabled === false) return null;

	const options = plugin.instance?.options ?? {};
	return {
		folder: (options.folder ?? "").trim(),
		format: (options.format ?? "").trim() || DEFAULT_DAILY_NOTE_FORMAT,
		template: (options.template ?? "").trim(),
	};
}

// Vault path of the daily note for the given date. The format may contain
// folders (e.g. "YYYY/MM/YYYY-MM-DD"), exactly like the core plugin allows.
export function getDailyNotePath(
	settings: DailyNoteSettings,
	date: DateFormatter
): string {
	const name = date.format(settings.format);
	const folder = settings.folder.replace(/^\/+|\/+$/g, "");
	return normalizePath(`${folder ? `${folder}/` : ""}${name}.md`);
}

// Resolves the {{date}}, {{time}} and {{title}} tokens the core Daily notes
// plugin supports, including the optional ":format" suffix.
export function resolveDailyNoteTemplate(
	template: string,
	date: DateFormatter,
	title: string
): string {
	return template
		.replace(/\{\{\s*title\s*\}\}/g, title)
		.replace(/\{\{\s*date\s*(?::\s*([^}]+?))?\s*\}\}/g, (_, fmt) =>
			date.format(fmt?.trim() || DEFAULT_DAILY_NOTE_FORMAT)
		)
		.replace(/\{\{\s*time\s*(?::\s*([^}]+?))?\s*\}\}/g, (_, fmt) =>
			date.format(fmt?.trim() || "HH:mm")
		);
}

// Appends a block to the end of a note, leaving one blank line before it
export function appendBlock(existing: string, block: string): string {
	return `${existing}${blockSeparator(existing)}${block}\n`;
}

async function readTemplate(
	app: App,
	templatePath: string,
	date: DateFormatter,
	title: string
): Promise<string> {
	if (!templatePath) return "";
	const path = normalizePath(
		templatePath.endsWith(".md") ? templatePath : `${templatePath}.md`
	);
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) return "";
	return resolveDailyNoteTemplate(await app.vault.read(file), date, title);
}

export async function getOrCreateDailyNote(
	app: App,
	settings: DailyNoteSettings,
	date: DateFormatter = moment()
): Promise<TFile> {
	const path = getDailyNotePath(settings, date);
	const existing = app.vault.getAbstractFileByPath(path);
	if (existing instanceof TFile) return existing;

	const slash = path.lastIndexOf("/");
	const folder = slash > 0 ? path.substring(0, slash) : "";
	if (folder && !app.vault.getAbstractFileByPath(folder)) {
		await app.vault.createFolder(folder);
	}

	const title = path.substring(slash + 1, path.length - ".md".length);
	const content = await readTemplate(app, settings.template, date, title);
	return app.vault.create(path, content);
}

// Appends a block to today's daily note, creating the note if needed
export async function appendToDailyNote(
	app: App,
	block: string
): Promise<TFile> {
	const settings = readDailyNoteSettings(app);
	if (!settings) {
		throw new Error("Enable the Daily notes core plugin");
	}
	const file = await getOrCreateDailyNote(app, settings);
	await app.vault.process(file, (data) => appendBlock(data, block));
	return file;
}
