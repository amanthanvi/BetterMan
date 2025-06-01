/**
 * Proxy API client that uses base64 encoding to bypass browser extension interference
 */

import type { SearchResult } from "@/types";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Fallback base64 decoder for when atob is blocked
function base64Decode(str: string): string {
	try {
		// Try standard atob first
		return atob(str);
	} catch (e) {
		// Fallback to manual base64 decode if atob is blocked
		const chars =
			"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
		const encoded = str.replace(/=+$/, "");
		let output = "";

		for (
			let bc = 0, bs = 0, buffer, i = 0;
			(buffer = encoded.charAt(i++));

		) {
			buffer = chars.indexOf(buffer);
			if (buffer === -1) continue;
			bs = bc % 4 ? bs * 64 + buffer : buffer;
			if (bc++ % 4)
				output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
		}

		return output;
	}
}

export const proxyAPI = {
	search: async (
		query: string,
		options: {
			page?: number;
			per_page?: number;
			section?: number[];
			doc_set?: string[];
		} = {}
	): Promise<SearchResult> => {
		const params = new URLSearchParams({
			q: query,
			page: String(options.page || 1),
			per_page: String(options.per_page || 20),
		});

		if (options.section?.length) {
			params.append("section", options.section.join(","));
		}

		const url = `${API_BASE_URL}/api/proxy/search?${params}`;

		try {
			const response = await fetch(url, {
				method: "GET",
				headers: {
					Accept: "text/plain",
				},
			});

			if (!response.ok) {
				throw new Error(
					`HTTP ${response.status}: ${response.statusText}`
				);
			}

			// Get base64 encoded text
			const encodedText = await response.text();

			try {
				// Decode from base64
				const jsonStr = base64Decode(encodedText.trim());

				// Parse JSON
				const data = JSON.parse(jsonStr);

				return {
					results: data.results || [],
					total: data.total || 0,
					page: data.page || 1,
					per_page: data.per_page || 20,
					has_more: data.has_more || false,
					query: data.query || query,
					took_ms: data.took_ms,
				};
			} catch (decodeError) {
				console.error("Failed to decode proxy response:", decodeError);
				console.error(
					"Raw response:",
					encodedText.substring(0, 100) + "..."
				);
				throw new Error("Failed to decode proxy response");
			}
		} catch (error) {
			console.error("Proxy search error:", error);
			throw error;
		}
	},

	suggest: async (query: string): Promise<string[]> => {
		if (!query.trim() || query.length < 2) return [];

		const params = new URLSearchParams({ q: query });
		const url = `${API_BASE_URL}/api/proxy/suggest?${params}`;

		try {
			const response = await fetch(url, {
				method: "GET",
				headers: {
					Accept: "text/plain",
				},
			});

			if (!response.ok) {
				throw new Error(
					`HTTP ${response.status}: ${response.statusText}`
				);
			}

			// Get base64 encoded text
			const encodedText = await response.text();

			try {
				// Decode from base64
				const jsonStr = base64Decode(encodedText.trim());

				// Parse JSON
				const data = JSON.parse(jsonStr);

				return data.suggestions || [];
			} catch (decodeError) {
				console.error(
					"Failed to decode proxy suggest response:",
					decodeError
				);
				return [];
			}
		} catch (error) {
			console.error("Proxy suggest error:", error);
			return [];
		}
	},
};
