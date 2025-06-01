import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
	ChevronRightIcon,
	ChevronLeftIcon,
	HamburgerMenuIcon,
	Cross2Icon,
	BookmarkIcon,
	Share1Icon,
	CopyIcon,
	CheckCircledIcon,
	DownloadIcon,
	FileIcon,
	MagnifyingGlassIcon,
	ZoomInIcon,
	ZoomOutIcon,
	FileTextIcon,
	CodeIcon,
	SunIcon,
	MoonIcon,
} from "@radix-ui/react-icons";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
	tomorrow,
	prism,
} from "react-syntax-highlighter/dist/esm/styles/prism";
import { useParams, Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import toast from "react-hot-toast";
import { documentAPI } from "@/services/api";
import { useAppStore } from "@/stores/appStore";
import { cn } from "../../utils/cn";
import type { Document as ApiDocument } from "@/types";

interface Section {
	id: string;
	title: string;
	level: number;
	content?: string;
}

interface ManDocument extends ApiDocument {
	name: string;
	sections: Section[];
	related: any[];
	lastUpdated: string;
	viewCount: number;
	content: string;
}

// Helper function to parse sections from markdown content
const parseSectionsFromContent = (content: string): Section[] => {
	const sections: Section[] = [];
	const lines = content.split("\n");
	let currentLevel = 0;

	lines.forEach((line, index) => {
		const h1Match = line.match(/^# (.+)$/);
		const h2Match = line.match(/^## (.+)$/);
		const h3Match = line.match(/^### (.+)$/);

		if (h1Match) {
			sections.push({
				id: h1Match[1].toLowerCase().replace(/\s+/g, "-"),
				title: h1Match[1],
				level: 1,
			});
		} else if (h2Match) {
			sections.push({
				id: h2Match[1].toLowerCase().replace(/\s+/g, "-"),
				title: h2Match[1],
				level: 2,
			});
		} else if (h3Match) {
			sections.push({
				id: h3Match[1].toLowerCase().replace(/\s+/g, "-"),
				title: h3Match[1],
				level: 3,
			});
		}
	});

	return sections;
};

export const PremiumDocumentViewer: React.FC = () => {
	const { name, section } = useParams<{ name: string; section: string }>();
	const [document, setDocument] = useState<ManDocument | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [isSidebarOpen, setIsSidebarOpen] = useState(true);
	const [isCopied, setIsCopied] = useState(false);
	const {
		preferences,
		darkMode,
		toggleDarkMode,
		isFavorite,
		addFavorite,
		removeFavorite,
		updatePreferences,
	} = useAppStore();
	const [activeSection, setActiveSection] = useState<string>("");
	const [searchQuery, setSearchQuery] = useState("");
	const [searchResults, setSearchResults] = useState<number[]>([]);
	const [currentSearchIndex, setCurrentSearchIndex] = useState(0);

	const contentRef = useRef<HTMLDivElement>(null);
	const sectionRefs = useRef<Record<string, HTMLElement>>({});

	useEffect(() => {
		fetchDocument();
	}, [name, section]);

	useEffect(() => {
		// Setup intersection observer for section tracking
		const observer = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					if (entry.isIntersecting) {
						setActiveSection(entry.target.id);
					}
				});
			},
			{
				rootMargin: "-20% 0px -70% 0px",
			}
		);

		Object.values(sectionRefs.current).forEach((ref) => {
			if (ref) observer.observe(ref);
		});

		return () => observer.disconnect();
	}, [document]);

	const fetchDocument = async () => {
		setIsLoading(true);
		try {
			const response = await documentAPI.getDocument(name, section);
			// Transform the API response to match our ManDocument interface
			const doc: ManDocument = {
				...response,
				id: response.id || `${name}-${section}`,
				name: name || "",
				sections: [], // Will be populated from content parsing
				related: [], // Will be populated separately if needed
				lastUpdated: response.last_updated || new Date().toISOString(),
				viewCount: 0,
				content: response.content || "",
			};
			// Parse sections from content if needed
			if (doc.content) {
				const sections = parseSectionsFromContent(doc.content);
				doc.sections = sections;
			}
			setDocument(doc);
			// Document loaded successfully
		} catch (error) {
			toast.error("Failed to load document");
		} finally {
			setIsLoading(false);
		}
	};

	const handleFavorite = async () => {
		if (!document) return;

		try {
			if (isFavorite(String(document.id))) {
				removeFavorite(String(document.id));
				toast.success("Removed from favorites");
			} else {
				addFavorite(String(document.id));
				toast.success("Added to favorites");
			}
		} catch (error) {
			toast.error("Failed to update favorites");
		}
	};

	const handleCopy = () => {
		if (!document) return;

		navigator.clipboard.writeText(document.content);
		setIsCopied(true);
		toast.success("Content copied to clipboard");
		setTimeout(() => setIsCopied(false), 2000);
	};

	const handleShare = async () => {
		if (!document) return;

		const url = window.location.href;

		if (navigator.share) {
			try {
				await navigator.share({
					title: document.title,
					text: document.summary,
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

	const handlePrint = () => {
		window.print();
	};

	const handleDownload = async () => {
		if (!document) return;

		try {
			const response = await documentAPI.downloadDocument(name, section);
			const blob = await response.blob();

			const url = window.URL.createObjectURL(blob);
			const link = window.document.createElement("a");
			link.href = url;
			link.setAttribute(
				"download",
				`${document.name}.${document.section}.md`
			);
			window.document.body.appendChild(link);
			link.click();
			link.remove();

			toast.success("Document downloaded");
		} catch (error) {
			toast.error("Failed to download document");
		}
	};

	const handleSearch = (query: string) => {
		setSearchQuery(query);
		if (!query || !contentRef.current) {
			setSearchResults([]);
			return;
		}

		// Simple text search implementation
		const text = contentRef.current.innerText.toLowerCase();
		const queryLower = query.toLowerCase();
		const results: number[] = [];
		let index = 0;

		while ((index = text.indexOf(queryLower, index)) !== -1) {
			results.push(index);
			index += queryLower.length;
		}

		setSearchResults(results);
		setCurrentSearchIndex(0);

		if (results.length > 0) {
			// Scroll to first result
			// This would require more complex implementation with text highlighting
			toast.success(`Found ${results.length} results`);
		} else {
			toast.error("No results found");
		}
	};

	const scrollToSection = (sectionId: string) => {
		const element = sectionRefs.current[sectionId];
		if (element) {
			element.scrollIntoView({ behavior: "smooth", block: "start" });
		}
	};

	if (isLoading) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<motion.div
					animate={{ rotate: 360 }}
					transition={{
						duration: 1,
						repeat: Infinity,
						ease: "linear",
					}}
					className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full"
				/>
			</div>
		);
	}

	if (!document) {
		return (
			<div className="flex flex-col items-center justify-center min-h-screen">
				<FileTextIcon className="w-24 h-24 text-gray-400 mb-4" />
				<h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
					Document not found
				</h1>
				<p className="text-gray-600 dark:text-gray-400 mb-6">
					The requested document could not be found.
				</p>
				<Link
					to="/"
					className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
				>
					Go back home
				</Link>
			</div>
		);
	}

	return (
		<div className="flex h-screen bg-gray-50 dark:bg-gray-900">
			{/* Sidebar - Table of Contents */}
			<AnimatePresence>
				{isSidebarOpen && (
					<motion.aside
						initial={{ x: -300 }}
						animate={{ x: 0 }}
						exit={{ x: -300 }}
						transition={{ type: "spring", damping: 25 }}
						className="w-80 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 overflow-y-auto"
					>
						<div className="sticky top-0 bg-white dark:bg-gray-800 z-10 p-6 border-b border-gray-200 dark:border-gray-700">
							<div className="flex items-center justify-between mb-4">
								<h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
									Table of Contents
								</h2>
								<button
									onClick={() => setIsSidebarOpen(false)}
									className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
								>
									<Cross2Icon className="w-5 h-5 text-gray-500" />
								</button>
							</div>

							{/* Search in document */}
							<div className="relative">
								<MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
								<input
									type="text"
									placeholder="Search in document..."
									value={searchQuery}
									onChange={(e) =>
										handleSearch(e.target.value)
									}
									className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
								/>
							</div>
						</div>

						<nav className="p-6">
							{document.sections.map((section) => (
								<motion.button
									key={section.id}
									whileHover={{ x: 4 }}
									onClick={() => scrollToSection(section.id)}
									className={cn(
										"w-full text-left py-2 px-3 rounded-lg transition-colors",
										activeSection === section.id
											? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 font-medium"
											: "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700",
										section.level === 1 && "font-semibold",
										section.level === 2 && "ml-4",
										section.level === 3 && "ml-8 text-sm"
									)}
								>
									<div className="flex items-center gap-2">
										{section.level === 1 && (
											<CodeIcon className="w-4 h-4" />
										)}
										{section.level === 2 && (
											<ChevronRightIcon className="w-3 h-3" />
										)}
										<span className="truncate">
											{section.title}
										</span>
									</div>
								</motion.button>
							))}
						</nav>
					</motion.aside>
				)}
			</AnimatePresence>

			{/* Main Content */}
			<div className="flex-1 flex flex-col overflow-hidden">
				{/* Header Toolbar */}
				<header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-4">
							{!isSidebarOpen && (
								<button
									onClick={() => setIsSidebarOpen(true)}
									className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
								>
									<HamburgerMenuIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
								</button>
							)}

							<div>
								<h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
									{document.name}({document.section})
								</h1>
								<p className="text-gray-600 dark:text-gray-400">
									{document.title}
								</p>
							</div>
						</div>

						<div className="flex items-center gap-2">
							{/* Font Size Controls */}
							<div className="flex items-center gap-1 mr-4">
								<button
									onClick={() => {
										const current = preferences.fontSize;
										const newSize =
											current === "large"
												? "medium"
												: current === "medium"
												? "small"
												: "small";
										updatePreferences({
											fontSize: newSize,
										});
									}}
									className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
									title="Decrease font size"
								>
									<ZoomOutIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
								</button>
								<span className="px-2 text-sm text-gray-600 dark:text-gray-400">
									{preferences.fontSize}
								</span>
								<button
									onClick={() => {
										const current = preferences.fontSize;
										const newSize =
											current === "small"
												? "medium"
												: current === "medium"
												? "large"
												: "large";
										updatePreferences({
											fontSize: newSize,
										});
									}}
									className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
									title="Increase font size"
								>
									<ZoomInIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
								</button>
							</div>

							{/* Action Buttons */}
							<motion.button
								whileHover={{ scale: 1.05 }}
								whileTap={{ scale: 0.95 }}
								onClick={handleFavorite}
								className={cn(
									"p-2 rounded-lg transition-colors",
									document && isFavorite(String(document.id))
										? "text-yellow-500 bg-yellow-100 dark:bg-yellow-900/50"
										: "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
								)}
								title="Add to favorites"
							>
								<BookmarkIcon
									className={cn(
										"w-5 h-5",
										document &&
											isFavorite(String(document.id)) &&
											"fill-current"
									)}
								/>
							</motion.button>

							<motion.button
								whileHover={{ scale: 1.05 }}
								whileTap={{ scale: 0.95 }}
								onClick={handleCopy}
								className="p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
								title="Copy content"
							>
								{isCopied ? (
									<CheckCircledIcon className="w-5 h-5 text-green-500" />
								) : (
									<CopyIcon className="w-5 h-5" />
								)}
							</motion.button>

							<motion.button
								whileHover={{ scale: 1.05 }}
								whileTap={{ scale: 0.95 }}
								onClick={handleShare}
								className="p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
								title="Share"
							>
								<Share1Icon className="w-5 h-5" />
							</motion.button>

							<motion.button
								whileHover={{ scale: 1.05 }}
								whileTap={{ scale: 0.95 }}
								onClick={handleDownload}
								className="p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
								title="Download"
							>
								<DownloadIcon className="w-5 h-5" />
							</motion.button>

							<motion.button
								whileHover={{ scale: 1.05 }}
								whileTap={{ scale: 0.95 }}
								onClick={handlePrint}
								className="p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
								title="Print"
							>
								<FileIcon className="w-5 h-5" />
							</motion.button>

							<button
								onClick={toggleDarkMode}
								className="p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
								title="Toggle theme"
							>
								{darkMode ? (
									<SunIcon className="w-5 h-5" />
								) : (
									<MoonIcon className="w-5 h-5" />
								)}
							</button>
						</div>
					</div>
				</header>

				{/* Document Content */}
				<div className="flex-1 overflow-y-auto">
					<article
						ref={contentRef}
						className="max-w-4xl mx-auto px-8 py-12"
						style={{
							fontSize:
								preferences.fontSize === "small"
									? "14px"
									: preferences.fontSize === "large"
									? "18px"
									: "16px",
							fontFamily:
								preferences.fontFamily === "mono"
									? "monospace"
									: preferences.fontFamily === "serif"
									? "serif"
									: "system-ui",
						}}
					>
						{/* Document Header */}
						<div className="mb-8 pb-8 border-b border-gray-200 dark:border-gray-700">
							<h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">
								{document.title}
							</h1>
							{document.summary && (
								<p className="text-xl text-gray-600 dark:text-gray-400 leading-relaxed">
									{document.summary}
								</p>
							)}
							<div className="flex items-center gap-6 mt-6 text-sm text-gray-500 dark:text-gray-400">
								<span>
									Last updated:{" "}
									{new Date(
										document.lastUpdated
									).toLocaleDateString()}
								</span>
								<span>•</span>
								<span>
									{document.viewCount.toLocaleString()} views
								</span>
							</div>
						</div>

						{/* Rendered Content */}
						<div className="prose prose-lg dark:prose-invert max-w-none">
							<ReactMarkdown
								remarkPlugins={[remarkGfm]}
								components={{
									h1: ({ children, ...props }) => {
										const id =
											children
												?.toString()
												.toLowerCase()
												.replace(/\s+/g, "-") || "";
										return (
											<h1
												id={id}
												ref={(el) => {
													if (el)
														sectionRefs.current[
															id
														] = el;
												}}
												className="text-3xl font-bold mt-8 mb-4"
												{...props}
											>
												{children}
											</h1>
										);
									},
									h2: ({ children, ...props }) => {
										const id =
											children
												?.toString()
												.toLowerCase()
												.replace(/\s+/g, "-") || "";
										return (
											<h2
												id={id}
												ref={(el) => {
													if (el)
														sectionRefs.current[
															id
														] = el;
												}}
												className="text-2xl font-semibold mt-6 mb-3"
												{...props}
											>
												{children}
											</h2>
										);
									},
									h3: ({ children, ...props }) => {
										const id =
											children
												?.toString()
												.toLowerCase()
												.replace(/\s+/g, "-") || "";
										return (
											<h3
												id={id}
												ref={(el) => {
													if (el)
														sectionRefs.current[
															id
														] = el;
												}}
												className="text-xl font-medium mt-4 mb-2"
												{...props}
											>
												{children}
											</h3>
										);
									},
									code: (props: any) => {
										const { inline, className, children } =
											props;
										const match = /language-(\w+)/.exec(
											className || ""
										);
										return !inline && match ? (
											<SyntaxHighlighter
												style={
													darkMode ? tomorrow : prism
												}
												language={match[1]}
												PreTag="div"
												className="rounded-lg my-4"
												{...props}
											>
												{String(children).replace(
													/\n$/,
													""
												)}
											</SyntaxHighlighter>
										) : (
											<code
												className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-sm"
												{...props}
											>
												{children}
											</code>
										);
									},
									pre: ({ children }) => <>{children}</>,
									a: ({ href, children }) => (
										<a
											href={href}
											className="text-blue-600 dark:text-blue-400 hover:underline"
											target={
												href?.startsWith("http")
													? "_blank"
													: undefined
											}
											rel={
												href?.startsWith("http")
													? "noopener noreferrer"
													: undefined
											}
										>
											{children}
										</a>
									),
								}}
							>
								{document.content}
							</ReactMarkdown>
						</div>

						{/* Related Documents */}
						{document.related && document.related.length > 0 && (
							<div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700">
								<h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
									Related Documentation
								</h2>
								<div className="grid gap-4 md:grid-cols-2">
									{document.related.map((related) => (
										<Link
											key={related.id}
											to={`/docs/${related.name}/${related.section}`}
											className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
										>
											<h3 className="font-semibold text-gray-900 dark:text-gray-100">
												{related.name}({related.section}
												)
											</h3>
											<p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
												{related.title}
											</p>
										</Link>
									))}
								</div>
							</div>
						)}
					</article>
				</div>
			</div>
		</div>
	);
};
