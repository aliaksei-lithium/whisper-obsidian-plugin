import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import { PostProcessor, createPostProcessor } from "../src/PostProcessor";
import { DEFAULT_SETTINGS } from "../src/SettingsManager";

vi.mock("axios");

const anthropic = new PostProcessor({
	apiKey: "key",
	model: "claude-sonnet-5-5",
	url: "https://api.anthropic.com/v1/messages",
	provider: "anthropic",
});

describe("PostProcessor (anthropic)", () => {
	beforeEach(() => {
		vi.mocked(axios.post).mockReset();
	});

	it("returns text when the first block is text", async () => {
		vi.mocked(axios.post).mockResolvedValue({
			data: { content: [{ type: "text", text: "Hello" }] },
		});
		expect(await anthropic.process("hi", "prompt")).toBe("Hello");
	});

	it("skips thinking blocks before the text block", async () => {
		vi.mocked(axios.post).mockResolvedValue({
			data: {
				content: [
					{ type: "thinking", thinking: "", signature: "sig" },
					{ type: "text", text: "#Терапия\n\nНачинаю с нуля." },
				],
			},
		});
		expect(await anthropic.process("hi", "prompt")).toBe(
			"#Терапия\n\nНачинаю с нуля."
		);
	});

	it("joins multiple text blocks", async () => {
		vi.mocked(axios.post).mockResolvedValue({
			data: {
				content: [
					{ type: "text", text: "Part one. " },
					{ type: "text", text: "Part two." },
				],
			},
		});
		expect(await anthropic.process("hi", "prompt")).toBe(
			"Part one. Part two."
		);
	});
});

describe("generateTitle", () => {
	beforeEach(() => {
		vi.mocked(axios.post).mockReset();
	});

	it("returns a filename-safe title", async () => {
		vi.mocked(axios.post).mockResolvedValue({
			data: {
				content: [{ type: "text", text: "Therapy: notes/ideas\n" }],
			},
		});
		expect(await anthropic.generateTitle("text", "prompt")).toBe(
			"Therapy- notes-ideas"
		);
	});
});

describe("createPostProcessor", () => {
	it("returns null without an API key for the provider", () => {
		expect(
			createPostProcessor({ ...DEFAULT_SETTINGS, anthropicApiKey: "" })
		).toBeNull();
	});

	it("creates a processor when the provider has a key", () => {
		expect(
			createPostProcessor({ ...DEFAULT_SETTINGS, anthropicApiKey: "k" })
		).toBeInstanceOf(PostProcessor);
	});
});
