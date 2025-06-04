import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
	ClockIcon,
	StarIcon,
	ActivityLogIcon as TrendingUpIcon,
	FileTextIcon as DocumentTextIcon,
	CodeIcon as CommandLineIcon,
	MagicWandIcon as SparklesIcon,
} from "@radix-ui/react-icons";

// Components - Using the new premium components
import { AdvancedSearch } from "@/components/search/AdvancedSearch";
import { PremiumSearchResults } from "@/components/search/PremiumSearchResults";
import { Button } from "@/components/ui/Button";
import { SearchErrorBoundary } from "@/components/ui/SearchErrorBoundary";

// Stores
import { useSearchStore } from "@/stores/searchStore";
import { useAppStore } from "@/stores/appStore";

// Utils
import { cn } from "@/utils/cn";
import type { Document } from "@/types";

// API
import { analyticsAPI } from "@/services/api";

interface HomePageProps {
	docs?: any[];
	loading?: boolean;
}

export const HomePage: React.FC<HomePageProps> = ({
	docs: _docs,
	loading: _docsLoading,
}) => {
	const navigate = useNavigate();
	const [showWelcome, setShowWelcome] = useState(true);
	const [popularCommands, setPopularCommands] = useState<any[]>([]);
	const [stats, setStats] = useState({
		totalDocs: 0,
		totalSearches: 0,
		avgResponseTime: "0ms",
		totalPageViews: 0,
		activeUsers: 0,
	});
	const [loadingAnalytics, setLoadingAnalytics] = useState(true);

	const {
		query,
		results,
		loading: searchLoading,
		performSearch,
	} = useSearchStore();

	const { recentDocs, favorites, searchHistory, setCommandPaletteOpen } =
		useAppStore();

	const hasSearched = query.length > 0;
	const hasResults = results.length > 0;

	// Fetch analytics data on mount
	useEffect(() => {
		const fetchAnalytics = async () => {
			try {
				setLoadingAnalytics(true);
				
				// Fetch popular commands
				const popularData = await analyticsAPI.getPopularCommands(6, 7);
				if (popularData.commands && popularData.commands.length > 0) {
					setPopularCommands(popularData.commands.map((cmd: any) => ({
						id: cmd.id,
						title: cmd.name,
						name: cmd.name,
						summary: cmd.summary || "No description available",
						searches: cmd.view_count,
						section: cmd.section || 1,
						trend: cmd.trend,
						uniqueUsers: cmd.unique_users,
					})));
				}

				// Fetch overview stats
				const overview = await analyticsAPI.getOverview(7);
				setStats({
					totalDocs: overview.total_documents || 0,
					totalSearches: overview.total_searches || 0,
					avgResponseTime: `${overview.avg_response_time || 0}ms`,
					totalPageViews: overview.total_page_views || 0,
					activeUsers: overview.active_users || 0,
				});
			} catch (error) {
				console.error("Failed to fetch analytics:", error);
				// Use fallback data on error
				setPopularCommands([
					{
						id: "ls",
						title: "ls",
						name: "ls",
						summary: "List directory contents",
						searches: 0,
						section: 1,
					},
					{
						id: "grep",
						title: "grep",
						name: "grep",
						summary: "Search text patterns",
						searches: 0,
						section: 1,
					},
					{
						id: "find",
						title: "find",
						name: "find",
						summary: "Search for files",
						searches: 0,
						section: 1,
					},
				]);
			} finally {
				setLoadingAnalytics(false);
			}
		};

		fetchAnalytics();
		// Refresh analytics every 5 minutes
		const interval = setInterval(fetchAnalytics, 5 * 60 * 1000);
		
		return () => clearInterval(interval);
	}, []);

	const handleDocumentSelect = (doc: Document) => {
		navigate(`/docs/${doc.id}`);
	};

	const handleQuickSearch = (command: string) => {
		performSearch(command);
	};

	return (
		<div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-900 dark:to-blue-950">
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
				{/* Hero Section */}
				{!hasSearched && (
					<motion.div
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						className="text-center mb-12"
					>
						<div className="max-w-4xl mx-auto">
							{/* Logo and title */}
							<motion.div
								initial={{ scale: 0.9 }}
								animate={{ scale: 1 }}
								transition={{ duration: 0.5 }}
								className="mb-8"
							>
								<div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
									<CommandLineIcon className="w-10 h-10 text-white" />
								</div>
								<h1 className="text-4xl md:text-6xl font-bold text-gray-900 dark:text-gray-100 mb-4">
									Better
									<span className="text-blue-600 dark:text-blue-400">
										Man
									</span>
								</h1>
								<p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
									The fastest, most intuitive way to search
									and explore documentation. Find exactly what
									you need in seconds.
								</p>
							</motion.div>

							{/* Premium Search interface */}
							<motion.div
								initial={{ opacity: 0, y: 20 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ delay: 0.2 }}
								className="mb-8"
							>
								<SearchErrorBoundary onRetry={() => window.location.reload()}>
									<AdvancedSearch />
								</SearchErrorBoundary>
							</motion.div>

							{/* Quick actions */}
							<motion.div
								initial={{ opacity: 0, y: 20 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ delay: 0.3 }}
								className="flex flex-wrap justify-center gap-2 mb-8"
							>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => setCommandPaletteOpen(true)}
									className="text-gray-600 dark:text-gray-400"
								>
									<SparklesIcon className="w-4 h-4 mr-2" />
									Command Palette (⌘K)
								</Button>
								{searchHistory.slice(0, 3).map((query) => (
									<Button
										key={query}
										variant="ghost"
										size="sm"
										onClick={() => handleQuickSearch(query)}
										className="text-gray-600 dark:text-gray-400"
									>
										<ClockIcon className="w-4 h-4 mr-2" />
										{query}
									</Button>
								))}
							</motion.div>

							{/* Stats */}
							<motion.div
								initial={{ opacity: 0, y: 20 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ delay: 0.4 }}
								className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-2xl mx-auto"
							>
								<div className="text-center">
									<div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
										{loadingAnalytics ? (
										<span className="animate-pulse">...</span>
									) : (
										stats.totalDocs.toLocaleString()
									)}
									</div>
									<div className="text-sm text-gray-600 dark:text-gray-400">
										Documentation Pages
									</div>
								</div>
								<div className="text-center">
									<div className="text-2xl font-bold text-green-600 dark:text-green-400">
										{loadingAnalytics ? (
										<span className="animate-pulse">...</span>
									) : (
										stats.totalPageViews.toLocaleString()
									)}
									</div>
									<div className="text-sm text-gray-600 dark:text-gray-400">
										Page Views (7 days)
									</div>
								</div>
								<div className="text-center">
									<div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
										{loadingAnalytics ? (
										<span className="animate-pulse">...</span>
									) : (
										stats.avgResponseTime
									)}
									</div>
									<div className="text-sm text-gray-600 dark:text-gray-400">
										Average Response Time
									</div>
								</div>
							</motion.div>
						</div>
					</motion.div>
				)}

				{/* Premium Search Results */}
				{hasSearched && (
					<div className="mb-8">
						<div className="mb-6 max-w-4xl mx-auto">
							<SearchErrorBoundary onRetry={() => window.location.reload()}>
								<AdvancedSearch />
							</SearchErrorBoundary>
						</div>
						<SearchErrorBoundary onRetry={() => window.location.reload()}>
							<PremiumSearchResults />
						</SearchErrorBoundary>
					</div>
				)}

				{/* Content sections for non-search state */}
				{!hasSearched && (
					<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
						{/* Popular Commands */}
						<motion.section
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ delay: 0.5 }}
							className="lg:col-span-2"
						>
							<div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
								<div className="flex items-center space-x-2 mb-6">
									<TrendingUpIcon className="w-5 h-5 text-orange-500" />
									<h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
										Popular Commands
									</h2>
								</div>
								<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
									{loadingAnalytics ? (
										// Loading skeleton
										Array.from({ length: 6 }).map((_, index) => (
											<div
												key={index}
												className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 animate-pulse"
											>
												<div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-20 mb-2"></div>
												<div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
											</div>
										))
									) : popularCommands.length > 0 ? (
										popularCommands.map((command, index) => (
										<motion.button
											key={command.id}
											initial={{ opacity: 0, x: -20 }}
											animate={{ opacity: 1, x: 0 }}
											transition={{
												delay: 0.6 + index * 0.1,
											}}
											onClick={() =>
												handleQuickSearch(command.name || command.title)
											}
											className="text-left p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md transition-all duration-200 group"
										>
											<div className="flex items-center justify-between mb-2">
												<h3 className="font-mono font-semibold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400">
													{command.name || command.title}
												</h3>
												<span className="text-xs text-gray-500 dark:text-gray-400">
													{command.searches} views
												</span>
											</div>
											<p className="text-sm text-gray-600 dark:text-gray-400">
												{command.summary}
											</p>
										</motion.button>
									))
									) : (
										<p className="text-gray-500 dark:text-gray-400 text-center py-8">
											No analytics data available yet. Start searching!
										</p>
									)}
								</div>
							</div>
						</motion.section>

						{/* Sidebar */}
						<motion.aside
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ delay: 0.7 }}
							className="space-y-6"
						>
							{/* Recent Documents */}
							{recentDocs.length > 0 && (
								<div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
									<div className="flex items-center space-x-2 mb-4">
										<ClockIcon className="w-5 h-5 text-blue-500" />
										<h3 className="font-semibold text-gray-900 dark:text-gray-100">
											Recent
										</h3>
									</div>
									<div className="space-y-3">
										{recentDocs.slice(0, 5).map((doc) => (
											<button
												key={doc.id}
												onClick={() =>
													handleDocumentSelect(doc)
												}
												className="w-full text-left p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
											>
												<div className="font-mono text-sm font-medium text-gray-900 dark:text-gray-100">
													{doc.title}
												</div>
												<div className="text-xs text-gray-500 dark:text-gray-400 truncate">
													{doc.summary}
												</div>
											</button>
										))}
									</div>
								</div>
							)}

							{/* Favorites */}
							{favorites.length > 0 && (
								<div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
									<div className="flex items-center space-x-2 mb-4">
										<StarIcon className="w-5 h-5 text-yellow-500" />
										<h3 className="font-semibold text-gray-900 dark:text-gray-100">
											Favorites
										</h3>
									</div>
									<div className="space-y-2">
										{favorites.slice(0, 5).map((docId) => (
											<button
												key={docId}
												onClick={() =>
													navigate(`/docs/${docId}`)
												}
												className="w-full text-left p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
											>
												<div className="font-mono text-sm font-medium text-gray-900 dark:text-gray-100">
													{docId}
												</div>
											</button>
										))}
									</div>
									<Button
										variant="ghost"
										size="sm"
										onClick={() => navigate("/favorites")}
										className="w-full mt-3"
									>
										View All
									</Button>
								</div>
							)}

							{/* Getting Started */}
							<div className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 rounded-xl border border-blue-200 dark:border-blue-800 p-6">
								<div className="flex items-center space-x-2 mb-4">
									<SparklesIcon className="w-5 h-5 text-blue-500" />
									<h3 className="font-semibold text-gray-900 dark:text-gray-100">
										Getting Started
									</h3>
								</div>
								<div className="space-y-3 text-sm">
									<div className="flex items-start space-x-2">
										<div className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold">
											1
										</div>
										<div>
											<div className="font-medium text-gray-900 dark:text-gray-100">
												Search for commands
											</div>
											<div className="text-gray-600 dark:text-gray-400">
												Type any command name or keyword
											</div>
										</div>
									</div>
									<div className="flex items-start space-x-2">
										<div className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold">
											2
										</div>
										<div>
											<div className="font-medium text-gray-900 dark:text-gray-100">
												Use keyboard shortcuts
											</div>
											<div className="text-gray-600 dark:text-gray-400">
												Press ⌘K for quick access
											</div>
										</div>
									</div>
									<div className="flex items-start space-x-2">
										<div className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold">
											3
										</div>
										<div>
											<div className="font-medium text-gray-900 dark:text-gray-100">
												Save favorites
											</div>
											<div className="text-gray-600 dark:text-gray-400">
												Star commands you use often
											</div>
										</div>
									</div>
								</div>
							</div>
						</motion.aside>
					</div>
				)}
			</div>
		</div>
	);
};