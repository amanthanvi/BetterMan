// Configuration helper for environment variables

export const config = {
  // API URL configuration
  get apiUrl(): string {
    // In production on Vercel, use relative URLs to use the same domain
    if (import.meta.env.PROD && typeof window !== 'undefined') {
      return '';
    }
    
    // In development or if explicitly set
    return import.meta.env.VITE_API_URL || 'http://localhost:8000';
  },
  
  // Get full API endpoint
  getApiEndpoint(path: string): string {
    const base = this.apiUrl;
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${cleanPath}`;
  },
  
  // Check if we're in production
  get isProduction(): boolean {
    return import.meta.env.PROD;
  },
  
  // Check if we're in development
  get isDevelopment(): boolean {
    return import.meta.env.DEV;
  },
};