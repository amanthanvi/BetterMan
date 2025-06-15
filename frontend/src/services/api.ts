import type {
	SearchResult,
	Document,
	HealthStatus,
	ApiResponse,
	SearchFilters,
} from "@/types";
import { config } from "@/utils/config";

const API_BASE_URL = config.apiUrl;

// Generic API client
class ApiClient {
	private baseURL: string;

	constructor(baseURL: string) {
		this.baseURL = baseURL;
	}

	private async request<T>(
		endpoint: string,
		options: RequestInit = {}
	): Promise<T> {
		const url = `${this.baseURL}${endpoint}`;

		const response = await fetch(url, {
			method: options.method || "GET",
			headers: {
				Accept: "application/json",
				"Accept-Encoding": "identity", // Disable compression
				...(options.body ? { "Content-Type": "application/json" } : {}),
				...options.headers,
			},
			body: options.body,
		});

		if (!response.ok) {
			const errorText = await response
				.text()
				.catch(() => "Unknown error");
			throw new Error(
				`HTTP ${response.status}: ${response.statusText} - ${errorText}`
			);
		}

		const text = await response.text();

		if (!text || text.length === 0) {
			return {} as T;
		}

		try {
			return JSON.parse(text);
		} catch (e) {
			console.error("Failed to parse JSON:", text);
			throw new Error("Invalid JSON response");
		}
	}

	get<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
		const url = params
			? `${endpoint}?${new URLSearchParams(params)}`
			: endpoint;
		return this.request<T>(url, { method: "GET" });
	}

	post<T>(endpoint: string, data?: any): Promise<T> {
		return this.request<T>(endpoint, {
			method: "POST",
			body: data ? JSON.stringify(data) : undefined,
		});
	}

	put<T>(endpoint: string, data?: any): Promise<T> {
		return this.request<T>(endpoint, {
			method: "PUT",
			body: data ? JSON.stringify(data) : undefined,
		});
	}

	delete<T>(endpoint: string): Promise<T> {
		return this.request<T>(endpoint, { method: "DELETE" });
	}
}

const apiClient = new ApiClient(API_BASE_URL);

// Search API
export const searchAPI = {
	search: async (
		query: string,
		options: {
			page?: number;
			per_page?: number;
			section?: number | number[];
			doc_set?: string[];
		} = {}
	) => {
		const params: Record<string, string> = {
			q: query,
			page: String(options.page || 1),
			per_page: String(options.per_page || 20),
		};

		// Handle section - can be single number or array
		if (options.section !== undefined && options.section !== null && options.section !== 'all') {
			if (Array.isArray(options.section)) {
				// If array, use the first value (backend only supports single section)
				if (options.section.length > 0 && options.section[0] !== 'all') {
					params.section = String(options.section[0]);
				}
			} else {
				// Single number or string - only add if it's a valid number
				const sectionValue = String(options.section);
				if (sectionValue !== 'all' && !isNaN(Number(sectionValue))) {
					params.section = sectionValue;
				}
			}
		}

		if (options.doc_set?.length) {
			params.doc_set = options.doc_set.join(",");
		}

		const result = await apiClient.get<SearchResult>("/api/search/", params);
		return result;
	},

	suggest: async (query: string) => {
		if (!query.trim() || query.length < 2) return [];

		try {
			const result = await apiClient.get<{ suggestions: string[] }>(
				"/api/search/suggest",
				{ q: query }
			);
			return result.suggestions || [];
		} catch (error) {
			console.error("Suggestions failed:", error);
			return [];
		}
	},

	instantSearch: async (
		query: string,
		limit: number = 10
	) => {
		try {
			return await apiClient.get("/api/search/instant", { q: query, limit });
		} catch (error) {
			console.error("Instant search failed:", error);
			return {
				query,
				results: [],
				suggestions: [],
				shortcuts: [],
				natural_language: [],
				categories: [],
				instant: true,
				timestamp: new Date().toISOString(),
			};
		}
	},

	autocomplete: async (
		prefix: string,
		limit: number = 10,
		context?: {
			recent_commands?: string[];
			current_command?: string;
		}
	) => {
		try {
			const params: any = { prefix, limit };
			if (context) {
				params.context = JSON.stringify(context);
			}
			return await apiClient.get("/api/search/autocomplete", params);
		} catch (error) {
			console.error("Autocomplete failed:", error);
			return [];
		}
	},

	fuzzySearch: async (
		query: string,
		options: {
			section?: number;
			limit?: number;
			offset?: number;
			threshold?: number;
		} = {}
	) => {
		try {
			const params = {
				q: query,
				...options,
			};
			return await apiClient.get("/api/search/fuzzy", params);
		} catch (error) {
			console.error("Fuzzy search failed:", error);
			throw error;
		}
	},
};

// Document API
export const documentAPI = {
	getAll: async (params?: {
		category?: string;
		section?: string;
		search?: string;
		limit?: number;
		offset?: number;
	}) => {
		return apiClient.get<Document[]>("/api/docs", params);
	},

	getFavorites: async () => {
		return apiClient.get<any[]>("/api/favorites");
	},

	addFavorite: async (documentId: number) => {
		return apiClient.post("/api/favorites", { document_id: documentId });
	},

	removeFavorite: async (documentId: number) => {
		return apiClient.delete(`/api/favorites/${documentId}`);
	},

	downloadDocument: async (
		name: string | undefined,
		section: string | undefined,
		options: RequestInit = {}
	) => {
		if (!name || !section)
			throw new Error("Document name and section required");
		// Backend expects doc_id in format "name.section"
		const docId = `${name}.${section}`;
		const url = `${API_BASE_URL}/api/docs/${docId}/download`;
		return fetch(url, options);
	},

	getDocument: async (
		name: string | undefined,
		section: string | undefined
	) => {
		if (!name || !section)
			throw new Error("Document name and section required");
		// Backend expects doc_id in format "name.section"
		const docId = `${name}.${section}`;
		return apiClient.get<Document>(`/api/docs/${docId}`);
	},

	// Removed getDocumentContent as content is included in getDocument response

	getRelatedDocuments: async (docId: string) => {
		const result = await apiClient.get<{ documents: Document[] }>(
			`/api/docs/${docId}/related`
		);
		return result.documents || [];
	},
};

// System API
export const systemAPI = {
	getHealth: () => {
		return apiClient.get<HealthStatus>("/health");
	},

	getStats: () => {
		return apiClient.get("/api/stats");
	},
};

// Analytics API
export const analyticsAPI = {
	trackSearch: (query: string, resultCount: number) => {
		return apiClient.post("/api/analytics/search", {
			query,
			result_count: resultCount,
			timestamp: new Date().toISOString(),
		});
	},

	trackDocumentView: (docId: string) => {
		return apiClient.post("/api/analytics/view", {
			document_id: docId,
			timestamp: new Date().toISOString(),
		});
	},

	getOverview: (days: number = 7) => {
		return apiClient.get(`/api/analytics/overview?days=${days}`);
	},

	getPopularCommands: (limit: number = 10, days: number = 7) => {
		return apiClient.get(`/api/analytics/popular-commands?limit=${limit}&days=${days}`);
	},
};

// Cache management
class CacheManager {
	private cache = new Map<
		string,
		{ data: any; timestamp: number; ttl: number }
	>();

	set<T>(key: string, data: T, ttlMs = 5 * 60 * 1000): void {
		this.cache.set(key, {
			data,
			timestamp: Date.now(),
			ttl: ttlMs,
		});
	}

	get<T>(key: string): T | null {
		const entry = this.cache.get(key);
		if (!entry) return null;

		if (Date.now() - entry.timestamp > entry.ttl) {
			this.cache.delete(key);
			return null;
		}

		return entry.data as T;
	}

	clear(): void {
		this.cache.clear();
	}

	has(key: string): boolean {
		return this.get(key) !== null;
	}
}

export const cache = new CacheManager();

// Enhanced search API with caching
export const cachedSearchAPI = {
	search: async (query: string, options: any = {}) => {
		const cacheKey = `search:${query}:${JSON.stringify(options)}`;

		// Try cache first
		const cached = cache.get<SearchResult>(cacheKey);
		if (cached) {
			return cached;
		}

		// Fetch from API
		const result = await searchAPI.search(query, options);

		// Cache the result
		cache.set(cacheKey, result, 2 * 60 * 1000); // 2 minutes

		return result;
	},
};

// Export api as named export for backward compatibility
export const api = apiClient;

export default apiClient;
