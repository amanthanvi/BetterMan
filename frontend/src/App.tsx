import React, { useState, useEffect, lazy, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "react-error-boundary";
import { VersionCheck } from "./components/VersionCheck";
import "./App.css";

// Import components
import { NavBar } from "@/components/layout/NavBar";
import { MagicalSearchModal } from "@/components/search/MagicalSearchModal";
import { KeyboardShortcutsModal } from "@/components/ui/KeyboardShortcutsModal";
import { useAppStore } from "@/stores/appStore";
import { ErrorFallback } from "@/components/ui/ErrorFallback";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PerformanceMonitor } from "@/components/ui/PerformanceMonitor";
import { ToastContainer } from "@/components/ui/Toast";
import { OfflineIndicator } from "@/components/ui/OfflineIndicator";
import { clearOldFavorites } from "@/utils/clearOldFavorites";
import { useKeyboardShortcuts, defaultShortcuts } from "@/utils/keyboardShortcuts";
import { applyTheme } from "@/design-system/theme";
import { preloadCriticalRoutes, addResourceHints, setupHoverPrefetching } from "@/utils/preload";
import { useServiceWorker } from "@/hooks/useServiceWorker";
import type { Document } from "@/types";

// Import authentication
import { SupabaseProvider } from "@/providers/SupabaseProvider";
import { AuthProvider } from "@/providers/AuthProvider";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

// Import test page directly for debugging
import { TestPage } from "@/pages/TestPage";

// Lazy load pages for code splitting
const HomePage = lazy(() =>
	import("@/pages/HomePage").then((m) => ({ default: m.HomePage }))
);
const AnalyticsPage = lazy(() =>
	import("@/pages/AnalyticsPage").then((m) => ({ default: m.AnalyticsPage }))
);
const NotFoundPage = lazy(() =>
	import("@/pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage }))
);
const DocumentPage = lazy(() =>
	import("@/pages/DocumentPage").then((m) => ({ default: m.DocumentPage }))
);
const SettingsPage = lazy(() =>
	import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage }))
);
const FavoritesPage = lazy(() =>
	import("@/pages/FavoritesPage").then((m) => ({ default: m.FavoritesPage }))
);
const DocsListPage = lazy(() =>
	import("@/pages/DocsListPage").then((m) => ({ default: m.DocsListPage }))
);

// Auth pages
const SignIn = lazy(() =>
	import("@/pages/auth/SignIn").then((m) => ({ default: m.SignIn }))
);
const SignUp = lazy(() =>
	import("@/pages/auth/SignUp").then((m) => ({ default: m.SignUp }))
);
const UserProfile = lazy(() =>
	import("@/pages/auth/UserProfile").then((m) => ({ default: m.UserProfile }))
);
const Setup2FA = lazy(() =>
	import("@/pages/auth/Setup2FA").then((m) => ({ default: m.Setup2FA }))
);
const AuthCallback = lazy(() =>
	import("@/pages/auth/AuthCallback").then((m) => ({ default: m.AuthCallback }))
);

// Lazy load heavy components
const SearchInterface = lazy(() =>
	import("@/components/search/SearchInterface").then((m) => ({
		default: m.SearchInterface,
	}))
);

interface AppDocument extends Document {
	name: string;
}

// Loading component for suspense
const PageLoader = () => (
	<div className="flex items-center justify-center min-h-[400px]">
		<LoadingSpinner size="lg" />
	</div>
);

function App() {
	const [docs, setDocs] = useState<AppDocument[]>([]);
	const [loading, setLoading] = useState(true);
	const [showSearch, setShowSearch] = useState(false);
	const [showShortcuts, setShowShortcuts] = useState(false);
	
	const { 
		darkMode, 
		initialize, 
		commandPaletteOpen, 
		setCommandPaletteOpen, 
		toasts, 
		removeToast,
		toggleDarkMode,
	} = useAppStore();
	
	// Initialize service worker for offline support
	const { isOnline, offlineReady } = useServiceWorker();

	// Initialize app store on mount
	useEffect(() => {
		// Clean up old favorites before initializing
		clearOldFavorites();
		initialize();
		
		// Performance optimizations
		addResourceHints();
		preloadCriticalRoutes();
		setupHoverPrefetching();
	}, [initialize]);

	// Apply theme on dark mode change
	useEffect(() => {
		applyTheme(darkMode ? 'dark' : 'light');
		if (darkMode) {
			document.documentElement.classList.add('dark');
		} else {
			document.documentElement.classList.remove('dark');
		}
	}, [darkMode]);

	// Custom event listeners for keyboard shortcuts
	useEffect(() => {
		const handleOpenCommandPalette = () => setShowSearch(true);
		const handleToggleDarkMode = () => toggleDarkMode();
		const handleShowKeyboardShortcuts = () => setShowShortcuts(true);
		const handleToggleToc = () => {
			// This will be handled by the document viewer
			const event = new CustomEvent('toggleTocEvent');
			window.dispatchEvent(event);
		};
		const handleToggleBookmark = () => {
			// This will be handled by the document viewer
			const event = new CustomEvent('toggleBookmarkEvent');
			window.dispatchEvent(event);
		};

		window.addEventListener('openCommandPalette', handleOpenCommandPalette);
		window.addEventListener('toggleDarkMode', handleToggleDarkMode);
		window.addEventListener('showKeyboardShortcuts', handleShowKeyboardShortcuts);
		window.addEventListener('toggleToc', handleToggleToc);
		window.addEventListener('toggleBookmark', handleToggleBookmark);

		return () => {
			window.removeEventListener('openCommandPalette', handleOpenCommandPalette);
			window.removeEventListener('toggleDarkMode', handleToggleDarkMode);
			window.removeEventListener('showKeyboardShortcuts', handleShowKeyboardShortcuts);
			window.removeEventListener('toggleToc', handleToggleToc);
			window.removeEventListener('toggleBookmark', handleToggleBookmark);
		};
	}, [toggleDarkMode]);

	// Additional keyboard shortcuts
	useKeyboardShortcuts([
		{
			key: 'Escape',
			description: 'Close modals',
			action: () => {
				if (showSearch) setShowSearch(false);
				if (showShortcuts) setShowShortcuts(false);
				if (commandPaletteOpen) setCommandPaletteOpen(false);
			},
			enabled: showSearch || showShortcuts || commandPaletteOpen,
		},
	], [showSearch, showShortcuts, commandPaletteOpen]);

	// Fetch documentation list on startup
	useEffect(() => {
		const fetchDocs = async () => {
			try {
				const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/docs?limit=100`);
				if (response.ok) {
					const data = await response.json();
					setDocs(data);
				}
			} catch (error) {
				console.error('Failed to fetch docs:', error);
			} finally {
				setLoading(false);
			}
		};

		fetchDocs();
	}, []);

	return (
		<ErrorBoundary
			FallbackComponent={ErrorFallback}
			onError={(error: Error, errorInfo: React.ErrorInfo) => {
				console.error("Application error:", error, errorInfo);
			}}
		>
			<Router>
				<SupabaseProvider>
					<AuthProvider>
						<VersionCheck />
						<div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-150 w-full flex flex-col">
					{/* Navigation */}
					<NavBar onSearchClick={() => setShowSearch(true)} />
					
					{/* Offline Indicator */}
					<OfflineIndicator isOnline={isOnline} />

					{/* Main Content */}
					<div className="flex-grow py-4">
						<main className="w-full px-4 sm:px-6 lg:px-8 transition-colors duration-150">
							<Suspense fallback={<PageLoader />}>
								<Routes>
									{/* Home Page */}
									<Route
										path="/"
										element={
											<HomePage
												docs={docs}
												loading={loading}
											/>
										}
									/>

									{/* Analytics Page */}
									<Route
										path="/analytics"
										element={<AnalyticsPage />}
									/>

									{/* Settings Page */}
									<Route
										path="/settings"
										element={<SettingsPage />}
									/>

									{/* Favorites Page */}
									<Route
										path="/favorites"
										element={<FavoritesPage />}
									/>

									{/* Documentation Routes */}
									<Route
										path="/docs"
										element={<DocsListPage />}
									/>

									{/* Document Viewer - supports both formats */}
									<Route
										path="/docs/:name/:section"
										element={<DocumentPage />}
									/>
									<Route
										path="/docs/:docId"
										element={<DocumentPage />}
									/>

									{/* Search Page */}
									<Route
										path="/search"
										element={<SearchInterface />}
									/>

									{/* Test Page */}
									<Route
										path="/test"
										element={<TestPage />}
									/>


									{/* Auth Routes */}
									<Route
										path="/sign-in"
										element={<SignIn />}
									/>
									<Route
										path="/sign-up"
										element={<SignUp />}
									/>
									<Route
										path="/profile"
										element={
											<ProtectedRoute>
												<UserProfile />
											</ProtectedRoute>
										}
									/>
									<Route
										path="/setup-2fa"
										element={
											<ProtectedRoute>
												<Setup2FA />
											</ProtectedRoute>
										}
									/>
									<Route
										path="/auth/callback"
										element={<AuthCallback />}
									/>

									{/* 404 - Not Found */}
									<Route
										path="*"
										element={<NotFoundPage />}
									/>
								</Routes>
							</Suspense>
						</main>
					</div>

					{/* Magical Search Modal */}
					<MagicalSearchModal
						isOpen={showSearch}
						onClose={() => setShowSearch(false)}
					/>

					{/* Keyboard Shortcuts Modal */}
					<KeyboardShortcutsModal
						isOpen={showShortcuts}
						onClose={() => setShowShortcuts(false)}
					/>

					{/* Toast Notifications */}
					<ToastContainer toasts={toasts} removeToast={removeToast} />

					{/* Performance Monitor (dev only) - Temporarily disabled to debug CORS issues */}
					{/* {process.env.NODE_ENV === 'development' && <PerformanceMonitor />} */}
						</div>
					</AuthProvider>
				</SupabaseProvider>
			</Router>
		</ErrorBoundary>
	);
}

export default App;