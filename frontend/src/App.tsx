import React, { useState, useEffect, lazy, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { ErrorBoundary } from "react-error-boundary";
import "./App.css";

// Import components
import { NavBar } from "@/components/layout/NavBar";
import { CommandPalette } from "@/components/search/CommandPalette";
import { useAppStore } from "@/stores/appStore";
import { ErrorFallback } from "@/components/ui/ErrorFallback";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { Document } from "@/types";

// Import test page directly for debugging
import { TestPage } from "@/pages/TestPage";

// Lazy load pages for code splitting
const HomePage = lazy(() => import("@/pages/HomePage").then(m => ({ default: m.HomePage })));
const AnalyticsPage = lazy(() => import("@/pages/AnalyticsPage").then(m => ({ default: m.AnalyticsPage })));
const NotFoundPage = lazy(() => import("@/pages/NotFoundPage").then(m => ({ default: m.NotFoundPage })));
const DocumentPage = lazy(() => import("@/pages/DocumentPage").then(m => ({ default: m.DocumentPage })));
const SettingsPage = lazy(() => import("@/pages/SettingsPage").then(m => ({ default: m.SettingsPage })));
const FavoritesPage = lazy(() => import("@/pages/FavoritesPage").then(m => ({ default: m.FavoritesPage })));

// Lazy load heavy components
const SearchInterface = lazy(() => import("@/components/search/SearchInterface").then(m => ({ default: m.SearchInterface })));

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
	const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
	const { darkMode } = useAppStore();

	// Add dark mode class to document root
	useEffect(() => {
		const root = window.document.documentElement;
		if (darkMode) {
			root.classList.add("dark");
		} else {
			root.classList.remove("dark");
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

	// Skip fetching docs on startup - will be loaded via search
	useEffect(() => {
		setLoading(false);
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
										element={
											<DocumentList docs={docs} loading={loading} />
										}
									/>

									{/* Document Viewer */}
									<Route
										path="/docs/:name"
										element={<DocumentPage />}
									/>

									{/* Search Page */}
									<Route
										path="/search"
										element={<SearchInterface />}
									/>

									{/* 404 - Not Found */}
									<Route path="*" element={<NotFoundPage />} />
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
					<Toaster
						position="bottom-right"
						toastOptions={{
							className: "",
							style: {
								background: darkMode ? "#1f2937" : "#fff",
								color: darkMode ? "#f3f4f6" : "#111827",
							},
						}}
					/>
				</div>
			</Router>
		</ErrorBoundary>
	);
}

// Document List Component (kept in App for now, can be moved later)
const DocumentList: React.FC<{ docs: AppDocument[]; loading: boolean }> = ({ docs, loading }) => {
	if (loading) {
		return <LoadingSpinner />;
	}

	return (
		<div className="w-full">
			<h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">
				Available Documentation
			</h2>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{docs.map((doc) => (
					<div
						key={doc.id}
						className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow"
					>
						<div className="px-4 py-5 sm:p-6">
							<h3 className="text-lg font-medium text-gray-900 dark:text-white">
								{doc.title}
							</h3>
							{doc.section && (
								<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
									Section: {doc.section}
								</p>
							)}
							<p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
								{doc.summary || "No description available."}
							</p>
							<div className="mt-4">
								<Link
									to={`/docs/${doc.name}`}
									className="inline-flex items-center px-3 py-1 border border-transparent text-sm leading-5 font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200 dark:text-indigo-200 dark:bg-indigo-900 dark:hover:bg-indigo-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
								>
									View Documentation
								</Link>
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
};

export default App;