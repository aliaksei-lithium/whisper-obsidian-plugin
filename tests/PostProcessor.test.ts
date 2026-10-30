import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import { PostProcessor } from "../src/PostProcessor";

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
