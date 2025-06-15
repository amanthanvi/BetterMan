import React, { useState } from "react";
import {
	FileTextIcon,
	StarIcon,
	ClockIcon,
	ChevronRightIcon,
	LightningBoltIcon,
	CodeIcon,
	EyeOpenIcon,
	BookmarkIcon,
	Share1Icon,
	CopyIcon,
	CheckCircledIcon,
} from "@radix-ui/react-icons";
import { Link } from "react-router-dom";
import { useSearchStore } from "@/stores/searchStore";
import { useAppStore } from "@/stores/appStore";
import { searchAPI, documentAPI } from "@/services/api";
import { cn } from "../../utils/cn";
import {
	formatDocumentTitle,
	cleanGroffFormatting,
} from "@/utils/groffCleaner";
import toast from "react-hot-toast";
import type { Document } from "@/types";

// Using the Document type from types/index.ts instead of custom interface

const SectionBadge: React.FC<{ section: number } = ({ section }) => {
	const sectionInfo: Record<
		number,
		{ label: string; color: string; icon: React.ReactElement }
	> = {
		1: {
			label: "Commands",
			color: "blue",
			icon: <CodeIcon className="w-3 h-3" />,
		},
		2: {
			label: "System Calls",
			color: "purple",
			icon: <FileTextIcon className="w-3 h-3" />,
		},
		3: {
			label: "Library Functions",
			color: "green",
			icon: <FileTextIcon className="w-3 h-3" />,
		},
		4: {
			label: "Special Files",
			color: "orange",
			icon: <FileTextIcon className="w-3 h-3" />,
		},
		5: {
			label: "File Formats",
			color: "red",
			icon: <FileTextIcon className="w-3 h-3" />,
		},
		6: {
			label: "Games",
			color: "pink",
			icon: <FileTextIcon className="w-3 h-3" />,
		},
		7: {
			label: "Miscellaneous",
			color: "gray",
			icon: <FileTextIcon className="w-3 h-3" />,
		},
		8: {
			label: "System Admin",
			color: "indigo",
			icon: <FileTextIcon className="w-3 h-3" />,
		},
	};

	const info = sectionInfo[section] || {
		label: `Section ${section}`,
		color: "gray",
		icon: <FileTextIcon className="w-3 h-3" />,
	};

	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
				`bg-${info.color}-100 text-${info.color}-700 dark:bg-${info.color}-900 dark:text-${info.color}-300`
			)}
		>
			{info.icon}
			{info.label}
		</span>
	);
};

const ResultCard: React.FC<{ result: Document; index: number } = ({
	result,
	index,
}) => {
	const { isFavorite, addFavorite, removeFavorite } = useAppStore();
	const [isCopied, setIsCopied] = useState(false);
	const [isHovered, setIsHovered] = useState(false);
	const favoriteKey = result.name ? `${result.name}.${result.section}` : result.id;
	const isFavorited = isFavorite(favoriteKey);

	const handleFavorite = async (e: React.MouseEvent) => {
		e.preventDefault();

		if (!result.name) {
			toast.error("Cannot favorite this document");
			return;
		}

		try {
			if (isFavorited) {
				removeFavorite(favoriteKey);
				toast.success("Removed from favorites");
			} else {
				addFavorite(favoriteKey);
				toast.success("Added to favorites");
			}
		} catch (error) {
			toast.error("Failed to update favorites");
		}
	};

	const handleCopyCommand = (e: React.MouseEvent) => {
		e.preventDefault();
		const commandName = result.name || result.id;
		navigator.clipboard.writeText(`man ${result.section} ${commandName}`);
		setIsCopied(true);
		toast.success("Command copied to clipboard");
		setTimeout(() => setIsCopied(false), 2000);
	};

	const handleShare = async (e: React.MouseEvent) => {
		e.preventDefault();
		const commandName = result.name || result.id;
		const url = `${window.location.origin}/docs/${commandName}.${result.section}`;

		if (navigator.share) {
			try {
				await navigator.share({
					title: formatDocumentTitle(result),
					text: result.summary
						? cleanGroffFormatting(result.summary)
						: "",
					url: url,
				});
			} catch (error) {
				// User cancelled or error
			}
		} else {
			navigator.clipboard.writeText(url);
			toast.success("Link copied to clipboard");
		}
	};

	return (
		<div
			onHoverStart={() => setIsHovered(true)}
			onHoverEnd={() => setIsHovered(false)}
			className="group relative"
		>
			<Link
				to={`/docs/${result.name || result.id}.${result.section}`}
				className="block bg-white dark:bg-gray-800 rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden"
			>
				{/* Card Header */}
				<div className="p-6 pb-4">
					<div className="flex items-start justify-between gap-4">
						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-3 mb-2">
								<h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">
									{formatDocumentTitle(result)}
								</h3>
								<SectionBadge section={result.section} />
								{result.matches &&
									result.matches.length > 0 && (
										<span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
											<LightningBoltIcon className="w-3 h-3"} />
											Match
										</span>
									)}
							</div>

							{result.summary && (
								<p className="text-base font-medium text-gray-700 dark:text-gray-300 mb-2">
									{cleanGroffFormatting(result.summary)}
								</p>
							)}
						</div>

						{/* Score Badge */}
						<div className="flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-yellow-400 to-orange-400 rounded-full shadow-md"
						>
							<StarIcon className="w-4 h-4 text-white fill-white" />
							<span className="text-sm font-bold text-white">
								{result.score.toFixed(1)}
							</span>
						</div>
					</div>

					{/* Matches */}
					{result.matches && result.matches.length > 0 && (
						<div className="mt-3 space-y-1">
							<div className="text-sm">
								<span className="text-gray-500 dark:text-gray-400">
									Matches:
								</span>
								{result.matches
									.slice(0, 2)
									.map((match, idx) => (
										<p key={idx}
                    className="mt-1 text-gray-600 dark:text-gray-400 font-mono text-xs overflow-hidden text-ellipsis"
										>
											{cleanGroffFormatting(match)}
										</p>
									))}
							</div>
						</div>
					)}
				</div>

				{/* Card Footer - Action Bar */}
				<div className="bg-gray-50 dark:bg-gray-700/50 px-6 py-3 flex items-center justify-between">
					<div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
						<span className="flex items-center gap-1">
							<EyeOpenIcon className="w-4 h-4" />
							{result.access_count || 0} views
						</span>
						<span className="flex items-center gap-1">
							<ClockIcon className="w-4 h-4" />
							Updated {result.last_updated ? new Date(result.last_updated).toLocaleDateString() : 'Recently'}
						</span>
					</div>

					<div className="flex items-center gap-2">
						<button>
							onClick={handleFavorite}
							className={cn(
								"p-2 rounded-lg transition-colors",
								isFavorited
									? "text-blue-500 bg-blue-100 dark:bg-blue-900/50"
									: "text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600"
							)}
							title="Add to favorites"
						>
							<BookmarkIcon className={cn(
									"w-4 h-4",
									isFavorited && "fill-current"
								)} />
						</button>

						<button>
							onClick={handleCopyCommand}
							className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
							title="Copy command"
						>
							{isCopied ? (
								<CheckCircledIcon className="w-4 h-4 text-green-500" />
							) : (
								<CopyIcon className="w-4 h-4" />
							)}
						</button>

						<button>
							onClick={handleShare}
							className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
							title="Share"
						>
							<Share1Icon className="w-4 h-4" />
						</button>
					</div>
				</div>
			</Link>

			{/* Hover Effect - Glow */}
			<>
				{isHovered && (
					<div className="absolute inset-0 -z-10 rounded-xl bg-gradient-to-r from-blue-400/20 to-purple-400/20 blur-xl"
					/>
				)}
			</>
		</div>
	);
};

export const PremiumSearchResults: React.FC = () => {
	const {
		results,
		loading: isSearching,
		query: searchQuery,
	} = useSearchStore();

	if (isSearching) {
		return (
			<div className="flex flex-col items-center justify-center py-20">
				<div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full"
				/>
				<p className="mt-4 text-gray-600 dark:text-gray-400">
					Searching through documentation...
				</p>
			</div>
		);
	}

	if (!results.length && searchQuery) {
		return (
			<div className="text-center py-20"
			>
				<div className="w-24 h-24 mx-auto mb-6 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
					<FileTextIcon className="w-12 h-12 text-gray-400" />
				</div>
				<h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
					No results found
				</h3>
				<p className="text-gray-600 dark:text-gray-400 mb-6">
					Try adjusting your search query or filters
				</p>
				<div className="space-y-2 text-sm text-gray-500 dark:text-gray-400">
					<p>Suggestions:</p>
					<ul className="list-disc list-inside space-y-1">
						<li>Check your spelling</li>
						<li>Try more general keywords</li>
						<li>Remove some filters</li>
					</ul>
				</div>
			</div>
		);
	}

	if (!results.length) {
		return null;
	}

	return (
		<div className="space-y-6">
			{/* Results Header */}
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
						Search Results
					</h2>
					<p className="text-gray-600 dark:text-gray-400">
						Found {results.length} results for "{searchQuery}"
					</p>
				</div>

				{/* Sort Options */}
				<select className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
					<option value="relevance">Most Relevant</option>
					<option value="popular">Most Popular</option>
					<option value="recent">Recently Updated</option>
					<option value="alphabetical">Alphabetical</option>
				</select>
			</div>

			{/* Results Grid */}
			<div className="grid gap-6 md:grid-cols-2">
				{results.map((result, index) => (
					<ResultCard key={result.id} result={result} index={index} />
				))}
			</div>

			{/* Pagination - TODO: Implement when backend supports pagination */}
		</div>
	);
};
