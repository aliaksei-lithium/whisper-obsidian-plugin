import { describe, it, expect, vi } from "vitest";
import { TFile } from "obsidian";
import {
	getDailyNotePath,
	resolveDailyNoteTemplate,
	appendBlock,
	readDailyNoteSettings,
	getOrCreateDailyNote,
	appendToDailyNote,
	DateFormatter,
} from "../src/DailyNote";

function tfile(path: string): TFile {
	const file = new TFile();
	file.path = path;
	const name = path.substring(path.lastIndexOf("/") + 1);
	file.basename = name.replace(/\.md$/, "");
	file.extension = "md";
	return file;
}

// Fake moment: supports the handful of format tokens used in the tests
function fakeDate(
	values: Record<string, string> = {
		"YYYY-MM-DD": "2026-11-03",
		"YYYY/MM/YYYY-MM-DD": "2026/11/2026-11-03",
		"DD.MM.YYYY": "03.11.2026",
		"HH:mm": "09:41",
		dddd: "Tuesday",
	}
): DateFormatter {
	return { format: (f: string) => values[f] ?? `<${f}>` };
}

function fakeApp(files: Record<string, string> = {}, dailyNotes: any = {}) {
	const vault = {
		getAbstractFileByPath: vi.fn((path: string) =>
			path in files ? tfile(path) : null
		),
		read: vi.fn(async (file: TFile) => files[file.path]),
		create: vi.fn(async (path: string, content: string) => {
			files[path] = content;
			return tfile(path);
		}),
		createFolder: vi.fn(async () => {}),
		process: vi.fn(async (file: TFile, fn: (d: string) => string) => {
			files[file.path] = fn(files[file.path]);
			return files[file.path];
		}),
	};
	const app = {
		vault,
		internalPlugins: {
			getPluginById: (id: string) =>
				id === "daily-notes" ? dailyNotes : null,
		},
	};
	return { app: app as any, vault, files };
}

describe("getDailyNotePath", () => {
	it("joins folder and formatted date", () => {
		expect(
			getDailyNotePath(
				{ folder: "Daily", format: "YYYY-MM-DD", template: "" },
				fakeDate()
			)
		).toBe("Daily/2026-11-03.md");
	});

	it("works without a folder", () => {
		expect(
			getDailyNotePath(
				{ folder: "", format: "YYYY-MM-DD", template: "" },
				fakeDate()
			)
		).toBe("2026-11-03.md");
	});

	it("supports folders inside the date format", () => {
		expect(
			getDailyNotePath(
				{
					folder: "/Journal/",
					format: "YYYY/MM/YYYY-MM-DD",
					template: "",
				},
				fakeDate()
			)
		).toBe("Journal/2026/11/2026-11-03.md");
	});
});

describe("resolveDailyNoteTemplate", () => {
	it("replaces date, time and title tokens", () => {
		expect(
			resolveDailyNoteTemplate(
				"# {{title}}\n{{date}} {{time}}",
				fakeDate(),
				"2026-11-03"
			)
		).toBe("# 2026-11-03\n2026-11-03 09:41");
	});

	it("supports custom formats", () => {
		expect(
			resolveDailyNoteTemplate(
				"{{date:DD.MM.YYYY}} {{ date : dddd }}",
				fakeDate(),
				"x"
			)
		).toBe("03.11.2026 Tuesday");
	});
});

describe("appendBlock", () => {
	it("starts with the block in an empty note", () => {
		expect(appendBlock("", "## 09:41\nhello")).toBe("## 09:41\nhello\n");
	});

	it("leaves one blank line before the block", () => {
		expect(appendBlock("# Day\n", "entry")).toBe("# Day\n\nentry\n");
		expect(appendBlock("# Day", "entry")).toBe("# Day\n\nentry\n");
		expect(appendBlock("# Day\n\n", "entry")).toBe("# Day\n\nentry\n");
	});
});

describe("readDailyNoteSettings", () => {
	it("returns null when the core plugin is disabled", () => {
		const { app } = fakeApp({}, { enabled: false });
		expect(readDailyNoteSettings(app)).toBeNull();
	});

	it("returns null when the core plugin is missing", () => {
		const { app } = fakeApp({}, null);
		expect(readDailyNoteSettings(app)).toBeNull();
	});

	it("falls back to defaults for empty options", () => {
		const { app } = fakeApp({}, { enabled: true, instance: {} });
		expect(readDailyNoteSettings(app)).toEqual({
			folder: "",
			format: "YYYY-MM-DD",
			template: "",
		});
	});

	it("reads folder, format and template", () => {
		const { app } = fakeApp(
			{},
			{
				enabled: true,
				instance: {
					options: {
						folder: "Daily ",
						format: "DD.MM.YYYY",
						template: "Templates/Daily",
					},
				},
			}
		);
		expect(readDailyNoteSettings(app)).toEqual({
			folder: "Daily",
			format: "DD.MM.YYYY",
			template: "Templates/Daily",
		});
	});
});

describe("getOrCreateDailyNote", () => {
	it("returns the existing note without creating anything", async () => {
		const { app, vault } = fakeApp({ "Daily/2026-11-03.md": "x" });
		const file = await getOrCreateDailyNote(
			app,
			{ folder: "Daily", format: "YYYY-MM-DD", template: "" },
			fakeDate()
		);
		expect(file.path).toBe("Daily/2026-11-03.md");
		expect(vault.create).not.toHaveBeenCalled();
	});

	it("creates the folder and note from the template", async () => {
		const { app, vault, files } = fakeApp({
			"Templates/Daily.md": "# {{title}}\n\n## Log\n",
		});
		const file = await getOrCreateDailyNote(
			app,
			{
				folder: "Daily",
				format: "YYYY-MM-DD",
				template: "Templates/Daily",
			},
			fakeDate()
		);
		expect(vault.createFolder).toHaveBeenCalledWith("Daily");
		expect(file.path).toBe("Daily/2026-11-03.md");
		expect(files["Daily/2026-11-03.md"]).toBe("# 2026-11-03\n\n## Log\n");
	});

	it("creates an empty note when the template is missing", async () => {
		const { app, files } = fakeApp();
		await getOrCreateDailyNote(
			app,
			{ folder: "", format: "YYYY-MM-DD", template: "Nope" },
			fakeDate()
		);
		expect(files["2026-11-03.md"]).toBe("");
	});
});

describe("appendToDailyNote", () => {
	it("throws when the daily notes plugin is disabled", async () => {
		const { app } = fakeApp({}, { enabled: false });
		await expect(appendToDailyNote(app, "entry")).rejects.toThrow(
			"Daily notes"
		);
	});

	it("appends to the existing note for today", async () => {
		const { app, files } = fakeApp(
			{},
			{ enabled: true, instance: { options: { format: "YYYY-MM-DD" } } }
		);
		const today = new Date().toISOString().split("T")[0];
		files[`${today}.md`] = "# Today\n";
		const file = await appendToDailyNote(app, "## 09:41\nhello");
		expect(file.path).toBe(`${today}.md`);
		expect(files[`${today}.md`]).toBe("# Today\n\n## 09:41\nhello\n");
	});
});
