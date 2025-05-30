/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_API_URL: string;
	readonly VITE_ANALYTICS_ID?: string;
	readonly VITE_ENVIRONMENT?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
