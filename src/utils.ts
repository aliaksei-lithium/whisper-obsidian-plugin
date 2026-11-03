export function getCursorContext(
	editor: { getValue: () => string; getCursor: () => { line: number } },
	contextLines: number = 5
): string {
	const lines = editor.getValue().split("\n");
	const cursorLine = editor.getCursor().line;
	const start = Math.max(0, cursorLine - contextLines);
	const end = Math.min(lines.length, cursorLine + contextLines + 1);
	return lines.slice(start, end).join("\n").trim();
}

export function getExtensionFromMimeType(mimeType: string | undefined): string {
	if (!mimeType) return "webm";
	const base = mimeType.split(";")[0];
	const subtype = base.split("/")[1];
	const extensionMap: Record<string, string> = {
		"mp4a.40.2": "m4a",
		mpeg: "mp3",
		"x-m4a": "m4a",
	};
	return extensionMap[subtype] || subtype;
}

export interface TemplateVariables {
	date: string;
	time: string;
	datetime: string;
	clock: string;
	title: string;
	transcription: string;
	audioFile: string;
}

export function buildTemplateVariables(
	transcription: string,
	title: string,
	audioFilePath: string
): TemplateVariables {
	const now = new Date();
	const date = now.toISOString().split("T")[0];
	const time = now.toTimeString().split(" ")[0].replace(/:/g, "-");
	const clock = now.toTimeString().slice(0, 5);
	const datetime = `${date} ${now.toTimeString().split(" ")[0]}`;
	return {
		date,
		time,
		datetime,
		clock,
		title,
		transcription,
		audioFile: audioFilePath,
	};
}

export function resolveTemplate(
	template: string,
	vars: TemplateVariables
): string {
	return template
		.replace(/\{\{date\}\}/g, vars.date)
		.replace(/\{\{time\}\}/g, vars.time)
		.replace(/\{\{datetime\}\}/g, vars.datetime)
		.replace(/\{\{clock\}\}/g, vars.clock)
		.replace(/\{\{title\}\}/g, vars.title)
		.replace(/\{\{transcription\}\}/g, vars.transcription)
		.replace(/\{\{audioFile\}\}/g, vars.audioFile);
}

export function getBaseFileName(filePath: string) {
	const fileName = filePath.substring(filePath.lastIndexOf("/") + 1);
	const dotIndex = fileName.lastIndexOf(".");
	return dotIndex > 0 ? fileName.substring(0, dotIndex) : fileName;
}

export function sanitizeFileName(name: string): string {
	return name.replace(/[/\\?%*:|"<>\n]/g, "-").trim();
}

// Matches Obsidian's default names for new notes: "Untitled", "Untitled 3"
export function isUntitledName(basename: string): boolean {
	return /^Untitled( \d+)?$/.test(basename);
}

// Splits leading YAML frontmatter from the note body
export function splitFrontmatter(text: string): {
	frontmatter: string;
	body: string;
} {
	const match = text.match(/^---\r?\n[\s\S]*?\r?\n---(\r?\n|$)/);
	if (!match) return { frontmatter: "", body: text };
	return {
		frontmatter: match[0],
		body: text.slice(match[0].length),
	};
}

// Separator that leaves one blank line between existing text and a new block
export function blockSeparator(before: string): string {
	if (!before || before.endsWith("\n\n")) return "";
	return before.endsWith("\n") ? "\n" : "\n\n";
}
