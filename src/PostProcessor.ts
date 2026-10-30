import axios from "axios";
import { PluginSettings, PostProcessingProvider } from "./SettingsManager";
import { sanitizeFileName } from "./utils";

function getPostProcessingApiKey(settings: PluginSettings): string {
	switch (settings.postProcessingProvider) {
		case "anthropic":
			return settings.anthropicApiKey;
		case "openai":
			return settings.openAiApiKey;
		case "custom":
			return settings.postProcessingApiKey;
	}
}

// Returns null when the selected provider has no API key
export function createPostProcessor(
	settings: PluginSettings
): PostProcessor | null {
	const apiKey = getPostProcessingApiKey(settings);
	if (!apiKey) return null;
	return new PostProcessor({
		apiKey,
		model: settings.postProcessingModel,
		url: settings.postProcessingUrl,
		provider: settings.postProcessingProvider,
	});
}

export interface PostProcessorConfig {
	apiKey: string;
	model: string;
	url: string;
	provider: PostProcessingProvider;
}

export class PostProcessor {
	private config: PostProcessorConfig;

	constructor(config: PostProcessorConfig) {
		this.config = config;
	}

	async process(text: string, prompt: string): Promise<string> {
		if (this.config.provider === "anthropic") {
			return this.callAnthropic(text, prompt);
		}
		return this.callOpenAI(text, prompt);
	}

	// Returns a title safe to use as a filename, or "" if none was generated
	async generateTitle(text: string, prompt: string): Promise<string> {
		const title = await this.process(text, prompt);
		return sanitizeFileName(title).slice(0, 100).trim();
	}

	private async callOpenAI(text: string, prompt: string): Promise<string> {
		const response = await axios.post(
			this.config.url,
			{
				model: this.config.model,
				messages: [
					{ role: "system", content: prompt },
					{ role: "user", content: text },
				],
			},
			{
				headers: {
					Authorization: `Bearer ${this.config.apiKey}`,
					"Content-Type": "application/json",
				},
			}
		);
		return response.data.choices[0].message.content.trim();
	}

	private async callAnthropic(text: string, prompt: string): Promise<string> {
		const response = await axios.post(
			this.config.url,
			{
				model: this.config.model,
				max_tokens: 8192,
				system: prompt,
				messages: [{ role: "user", content: text }],
			},
			{
				headers: {
					"x-api-key": this.config.apiKey,
					"anthropic-version": "2023-06-01",
					"anthropic-dangerous-direct-browser-access": "true",
					"Content-Type": "application/json",
				},
			}
		);
		// Responses may start with non-text blocks (e.g. "thinking"), so collect only text blocks
		const blocks: { type: string; text?: string }[] =
			response.data.content ?? [];
		return blocks
			.filter((block) => block.type === "text")
			.map((block) => block.text ?? "")
			.join("")
			.trim();
	}
}
