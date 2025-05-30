import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { ErrorBoundary } from "react-error-boundary";
import "./App.css";

// Import components
import { NavBar } from "@/components/layout/NavBar";
import { CommandPalette } from "@/components/CommandPalette";
import { useAppStore } from "@/stores/appStore";
import { ErrorFallback } from "@/components/ui/ErrorFallback";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { Document } from "@/types";

// Import pages
import { HomePage } from "@/pages/HomePage";
import { AnalyticsPage } from "@/pages/AnalyticsPage";
import { NotFoundPage } from "@/pages/NotFoundPage";

interface AppDocument extends Document {
	name: string;
}

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

	useEffect(() => {
		const fetchDocs = async () => {
			try {
				const apiUrl =
					(import.meta.env.VITE_API_URL as string) ||
					"http://localhost:8000";
				const response = await fetch(`${apiUrl}/api/docs`);
				if (!response.ok) {
					throw new Error(`HTTP error! status: ${response.status}`);
				}
				const data = await response.json();
				setDocs(data);
			} catch (error) {
				console.error("Error fetching documentation:", error);
			} finally {
				setLoading(false);
			}
		};

		fetchDocs();
	}, []);

	return (
		<ErrorBoundary
			FallbackComponent={ErrorFallback}
			onError={(error: Error, errorInfo: any) => {
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

								{/* Documentation List */}
								<Route
									path="/docs"
									element={
										<div className="w-full">
											<h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">
												Available Documentation
											</h2>
											{loading ? (
												<LoadingSpinner />
											) : (
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
																		Section:{" "}
																		{
																			doc.section
																		}
																	</p>
																)}
																<p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
																	{doc.summary ||
																		"No description available."}
																</p>
																<div className="mt-4">
																	<Link
																		to={`/docs/${doc.name}`}
																		className="inline-flex items-center px-3 py-1 border border-transparent text-sm leading-5 font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200 dark:text-indigo-200 dark:bg-indigo-900 dark:hover:bg-indigo-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
																	>
																		View
																		Documentation
																	</Link>
																</div>
															</div>
														</div>
													))}
												</div>
											)}
										</div>
									}
								/>

								{/* 404 - Not Found */}
								<Route path="*" element={<NotFoundPage />} />
							</Routes>
						</main>
					</div>

					{/* Footer */}
					<footer className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 py-6 px-4 sm:px-6 lg:px-8 transition-colors duration-150 mt-auto">
						<div className="w-full flex flex-col md:flex-row justify-between items-center">
							<div className="mb-4 md:mb-0">
								<p className="text-gray-500 dark:text-gray-400 text-sm">
									&copy; {new Date().getFullYear()} BetterMan
									Project
								</p>
							</div>
							<div className="flex space-x-6">
								<Link
									to="/about"
									className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 text-sm"
								>
									About
								</Link>
								<Link
									to="/contributing"
									className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 text-sm"
								>
									Contributing
								</Link>
								<a
									href="https://github.com/amanthanvi/BetterMan"
									target="_blank"
									rel="noopener noreferrer"
									className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 text-sm"
								>
									GitHub
								</a>
								<Link
									to="/license"
									className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 text-sm"
								>
									License
								</Link>
								<Link
									to="/settings"
									className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 text-sm"
								>
									Settings
								</Link>
							</div>
						</div>
					</footer>

					{/* Command Palette */}
					<CommandPalette
						isOpen={commandPaletteOpen}
						onClose={() => setCommandPaletteOpen(false)}
					/>

					{/* Toast notifications */}
					<Toaster
						position="top-right"
						toastOptions={{
							className: "dark:bg-gray-800 dark:text-white",
							duration: 4000,
						}}
					/>
				</div>
			</Router>
		</ErrorBoundary>
	);
}

export default App;
