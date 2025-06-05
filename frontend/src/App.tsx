import React, { useState, useEffect, lazy, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import { ErrorBoundary } from "react-error-boundary";
import "./App.css";

// Import components
import { NavBar } from "@/components/layout/NavBar";
import { CommandPalette } from "@/components/search/CommandPalette";
import { useAppStore } from "@/stores/appStore";
import { ErrorFallback } from "@/components/ui/ErrorFallback";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PerformanceMonitor } from "@/components/ui/PerformanceMonitor";
import { ToastContainer } from "@/components/ui/Toast";
import { clearOldFavorites } from "@/utils/clearOldFavorites";
import { clearNumericFavorites } from "@/utils/clearNumericFavorites";
import type { Document } from "@/types";

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
	const { darkMode, initialize, commandPaletteOpen, setCommandPaletteOpen, toasts, removeToast } =
		useAppStore();

	// Initialize app store on mount
	useEffect(() => {
		// Clean up old favorites before initializing
		clearOldFavorites();
		initialize();
	}, [initialize]);

	// Ensure dark mode class is always in sync
	useEffect(() => {
		if (darkMode) {
			document.documentElement.classList.add('dark');
		} else {
			document.documentElement.classList.remove('dark');
		}
	}, [darkMode]);

	// Global keyboard shortcuts
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Command palette: Cmd/Ctrl + K
			if ((e.metaKey || e.ctrlKey) && e.key === "k") {
				e.preventDefault();
				setCommandPaletteOpen(true);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

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
				<div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-150 w-full flex flex-col">
					{/* Navigation */}
					<NavBar />

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

									{/* 404 - Not Found */}
									<Route
										path="*"
										element={<NotFoundPage />}
									/>
								</Routes>
							</Suspense>
						</main>
					</div>

					{/* Command Palette */}
					<CommandPalette
						open={commandPaletteOpen}
						onOpenChange={setCommandPaletteOpen}
					/>

					{/* Toast Notifications */}
					<ToastContainer toasts={toasts} removeToast={removeToast} />

					{/* Performance Monitor (dev only) */}
					<PerformanceMonitor />
				</div>
			</Router>
		</ErrorBoundary>
	);
}


export default App;
