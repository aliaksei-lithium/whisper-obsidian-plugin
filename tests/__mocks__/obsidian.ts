// Minimal Obsidian API mocks for testing

export class Plugin {
	app: any = {};
	addStatusBarItem() {
		return document.createElement("div");
	}
	addCommand(_cmd: any) {}
	addRibbonIcon(_icon: string, _title: string, _cb: any) {}
	addSettingTab(_tab: any) {}
	async loadData() {
		return {};
	}
	async saveData(_data: any) {}
}

export class Modal {
	app: any;
	containerEl = document.createElement("div");
	contentEl = document.createElement("div");
	constructor(app: any) {
		this.app = app;
	}
	open() {}
	close() {}
}

export class Notice {
	message: string;
	constructor(message: string) {
		this.message = message;
	}
}

export class MarkdownView {
	editor = {
		getCursor: () => ({ line: 0, ch: 0 }),
		replaceRange: (_text: string, _pos: any) => {},
		setCursor: (_pos: any) => {},
	};
}

export class Setting {
	constructor(_el: HTMLElement) {}
	setName(_n: string) {
		return this;
	}
	setDesc(_d: string) {
		return this;
	}
	addText(_cb: any) {
		return this;
	}
	addToggle(_cb: any) {
		return this;
	}
	addDropdown(_cb: any) {
		return this;
	}
	addTextArea(_cb: any) {
		return this;
	}
	setHeading() {
		return this;
	}
	setDisabled(_d: boolean) {
		return this;
	}
}

export class PluginSettingTab {
	app: any;
	plugin: any;
	containerEl = document.createElement("div");
	constructor(app: any, plugin: any) {
		this.app = app;
		this.plugin = plugin;
	}
}

export class ButtonComponent {
	buttonEl = document.createElement("button");
	constructor(_el: HTMLElement) {}
	setIcon(_i: string) {
		return this;
	}
	setButtonText(_t: string) {
		return this;
	}
	onClick(_cb: any) {
		return this;
	}
	setDisabled(_d: boolean) {
		return this;
	}
}

export class TFolder {
	path: string = "";
}

export class TFile {
	path: string = "";
	basename: string = "";
	extension: string = "md";
	constructor(path: string = "") {
		this.path = path;
		const name = path.substring(path.lastIndexOf("/") + 1);
		const dot = name.lastIndexOf(".");
		this.basename = dot > 0 ? name.substring(0, dot) : name;
		this.extension = dot > 0 ? name.substring(dot + 1) : "";
	}
}

export const Platform = { isMobile: false };

export function normalizePath(path: string): string {
	return path
		.replace(/\\/g, "/")
		.replace(/\/+/g, "/")
		.replace(/^\/+|\/+$/g, "");
}

// Tiny moment stand-in: only the formats the plugin relies on by default
export function moment() {
	const pad = (n: number) => String(n).padStart(2, "0");
	const d = new Date();
	return {
		format(fmt: string) {
			return fmt
				.replace("YYYY", String(d.getFullYear()))
				.replace("MM", pad(d.getMonth() + 1))
				.replace("DD", pad(d.getDate()))
				.replace("HH", pad(d.getHours()))
				.replace("mm", pad(d.getMinutes()));
		},
	};
}
