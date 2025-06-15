import React, {
	useState,
	useEffect,
	useRef,
	useCallback,
	useMemo,
	memo,
	Fragment,
	Suspense,
	lazy,
} from "react";
import {
	BookmarkIcon,
	Share1Icon,
	DownloadIcon,
	EyeOpenIcon,
	HamburgerMenuIcon,
	CopyIcon,
	CheckIcon,
	ChevronRightIcon,
	ChevronDownIcon,
	MagnifyingGlassIcon,
	Cross2Icon,
	ArrowUpIcon,
	TextIcon,
	CodeIcon,
	LightningBoltIcon,
	RocketIcon,
	StarIcon,
	HeartIcon,
	InfoCircledIcon,
	ExclamationTriangleIcon,
	TargetIcon,
	LayersIcon,
	CubeIcon,
	ClockIcon,
	ReaderIcon,
	MixerHorizontalIcon,
	HomeIcon,
	FileIcon,
	CounterClockwiseClockIcon,
	MoonIcon,
	SunIcon,
	ArchiveIcon,
	UpdateIcon,
} from "@radix-ui/react-icons";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { useAppStore } from "@/stores/appStore";
import { cn } from "@/utils/cn";
import type { Document } from "@/types";
import { parseGroffSections, parseGroffContent } from "@/utils/groffParser";
import { useVirtualizer } from "@tanstack/react-virtual";

// Lazy load heavy components
const EnhancedCodeBlock = lazy(() =>
	import("./EnhancedCodeBlock").then((mod) => ({ default: mod.EnhancedCodeBlock }))
);

interface DocumentViewerProps {
	document: Document;
	className?: string;
}

interface TableOfContentsItem {
	id: string;
	title: string;
	level: number;
	icon?: React.ReactNode;
	children?: TableOfContentsItem[];
}

interface DocumentSection {
	id: string;
	title: string;
	content: string;
	level: number;
	type?: string;
}

// Constants and static data
const SECTION_ICONS: Record<string, React.ReactNode> = {
	header: <LayersIcon className="w-5 h-5" />,
	name: <TargetIcon className="w-5 h-5" />,
	synopsis: <CodeIcon className="w-5 h-5" />,
	description: <TextIcon className="w-5 h-5" />,
	options: <CubeIcon className="w-5 h-5" />,
	examples: <RocketIcon className="w-5 h-5" />,
	"exit status": <InfoCircledIcon className="w-5 h-5" />,
	environment: <LayersIcon className="w-5 h-5" />,
	files: <FileIcon className="w-5 h-5" />,
	"return value": <UpdateIcon className="w-5 h-5" />,
	"see also": <LightningBoltIcon className="w-5 h-5" />,
	notes: <InfoCircledIcon className="w-5 h-5" />,
	bugs: <ExclamationTriangleIcon className="w-5 h-5" />,
	author: <HeartIcon className="w-5 h-5" />,
	copyright: <StarIcon className="w-5 h-5" />,
	history: <CounterClockwiseClockIcon className="w-5 h-5" />,
};

const LANGUAGE_PATTERNS: Record<string, RegExp[]> = {
	bash: [/^\s*\$\s+/, /^\s*#\s+/, /\b(echo|cd|ls|grep|find|sed|awk)\b/],
	c: [/#include\s*<.*>/, /int\s+main\s*\(/, /printf\s*\(/],
	cpp: [/#include\s*<.*>/, /std::/, /cout\s*<</],
	python: [/def\s+\w+\s*\(/, /import\s+\w+/, /print\s*\(/],
	javascript: [/function\s+\w+/, /const\s+\w+/, /console\.log/],
	json: [/^\s*\{[\s\S]*\}\s*$/, /^\s*\[[\s\S]*\]\s*$/],
	yaml: [/^---/, /^\w+:\s*$/m],
	xml: [/<\?xml/, /<\/?\w+>/],
};

// Utility functions
const detectLanguage = (code: string): string => {
	if (code.startsWith("#!/")) {
		if (code.includes("bash") || code.includes("sh")) return "bash";
		if (code.includes("python")) return "python";
		if (code.includes("node")) return "javascript";
		if (code.includes("ruby")) return "ruby";
		if (code.includes("perl")) return "perl";
	}

	for (const [lang, patterns] of Object.entries(LANGUAGE_PATTERNS)) {
		if (patterns.some((pattern) => pattern.test(code))) {
			return lang;
		}
	}

	return "text";
};

// Memoized Components
const CopyButton = memo<{ text: string }>(({ text }) => {
	const [copied, setCopied] = useState(false);

	const handleCopy = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch (err) {
			console.error("Failed to copy:", err);
		}
	}, [text]);

	return (
		<Button
			variant="ghost"
			size="sm"
			onClick={handleCopy}
			className="ultimate-button ultimate-button-ghost h-7 px-2 text-xs"
		>
			{copied ? (
				<>
					<CheckIcon className="w-3 h-3 mr-1" />
					Copied
				</>
			) : (
				<>
					<CopyIcon className="w-3 h-3 mr-1" />
					Copy
				</>
			)}
		</Button>
	);
});

CopyButton.displayName = "CopyButton";

const TocItem = memo<{
	item: TableOfContentsItem;
	isActive: boolean;
	isSearchResult: boolean;
	onClick: (id: string) => void;
	level: number;
}>(({ item, isActive, isSearchResult, onClick, level }) => (
	<button
		onClick={() => onClick(item.id)}
		className={cn(
			"toc-item group flex items-center gap-3 w-full text-left p-3 rounded-xl transition-all duration-200 relative overflow-hidden",
			"hover:bg-blue-50 dark:hover:bg-blue-900/30",
			isActive && "active bg-blue-50 dark:bg-blue-900/30",
			isSearchResult && "ring-2 ring-yellow-400 dark:ring-yellow-600",
			level > 0 && "ml-6 text-sm"
		)}
	>
		{isActive && (
			<div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500 to-purple-500 rounded-r" />
		)}

		<div className={cn(
				"flex-shrink-0 p-1.5 rounded-lg transition-all duration-200",
				isActive
					? "bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-300"
					: "bg-gray-100 dark:bg-gray-800"
			)}
		>
			{item.icon}
		</div>

		<span className={cn("flex-1 truncate leading-tight", isActive && "font-semibold")}>
			{item.title}
		</span>

		<ChevronRightIcon className={cn(
				"w-4 h-4 transition-all duration-200",
				isActive ? "opacity-100 text-blue-600 dark:text-blue-400" : "opacity-0"
			)} />
	</button>
));

TocItem.displayName = "TocItem";

// Main Component
export const VirtualizedDocumentViewer: React.FC<DocumentViewerProps> = ({ document, className }) => {
	// State
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [sections, setSections] = useState<DocumentSection[]>([]);
	const [tocItems, setTocItems] = useState<TableOfContentsItem[]>([]);
	const [activeSection, setActiveSection] = useState<string>("");
	const [tocSearch, setTocSearch] = useState("");
	const [contentSearch, setContentSearch] = useState("");
	const [fontSize, setFontSize] = useState<"sm" | "base" | "lg">("base");
	const [copied, setCopied] = useState(false);
	const [showScrollTop, setShowScrollTop] = useState(false);
	const [showLineNumbers, setShowLineNumbers] = useState(true);
	const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

	// Refs
	const parentRef = useRef<HTMLDivElement>(null);
	const tocParentRef = useRef<HTMLDivElement>(null);
	const searchInputRef = useRef<HTMLInputElement>(null);

	// App store
	const {
		isFavorite,
		addFavorite,
		removeFavorite,
		addRecentDoc,
		addToast,
		documentTocOpen: showToc,
		setDocumentTocOpen: setShowToc,
	} = useAppStore();

	const docKey = `${document.name}.${document.section}`;
	const isDocFavorite = isFavorite(docKey);

	// Parse sections only once
	const parsedSections = useMemo(() => {
		const result: DocumentSection[] = [];

		if (document.sections?.length) {
			const parsed = parseGroffSections(document.sections, {
				preserveFormatting: true,
				convertToMarkdown: true,
			});

			parsed.forEach((section) => {
				const sectionId = `section-${section.name.toLowerCase().replace(/\s+/g, "-")}`;
				result.push({
					id: sectionId,
					title: section.name,
					content: section.content || "",
					level: 2,
					type: section.name.toLowerCase(),
				});

				if (section.subsections) {
					section.subsections.forEach((sub: any, subIndex: number) => {
						result.push({
							id: `${sectionId}-sub-${subIndex}`,
							title: sub.name,
							content: sub.content || "",
							level: 3,
							type: section.name.toLowerCase(),
						});
					});
				}
			});
		} else if (document.raw_content) {
			const cleanContent = parseGroffContent(document.raw_content, {
				preserveFormatting: true,
				convertToMarkdown: true,
			});

			// Simple section parsing
			const lines = cleanContent.split("\n");
			let currentSection: { title: string; content: string[] } | null = null;

			lines.forEach((line) => {
				if (line.match(/^#+\s+(.+)$/)) {
					if (currentSection) {
						result.push({
							id: `section-${currentSection.title.toLowerCase().replace(/\s+/g, "-")}`,
							title: currentSection.title,
							content: currentSection.content.join("\n").trim(),
							level: 2,
							type: currentSection.title.toLowerCase(),
						});
					}
					currentSection = { title: line.replace(/^#+\s+/, ""), content: [] };
				} else if (currentSection) {
					currentSection.content.push(line);
				}
			});

			if (currentSection) {
				result.push({
					id: `section-${currentSection.title.toLowerCase().replace(/\s+/g, "-")}`,
					title: currentSection.title,
					content: currentSection.content.join("\n").trim(),
					level: 2,
					type: currentSection.title.toLowerCase(),
				});
			}

			if (result.length === 0) {
				result.push({
					id: "section-content",
					title: "Content",
					content: cleanContent,
					level: 2,
					type: "description",
				});
			}
		}

		return result;
	}, [document]);

	// Generate TOC
	const generateTOC = useCallback(
		(sections: DocumentSection[]): TableOfContentsItem[] => {
			const items: TableOfContentsItem[] = [];
			const levelStack: TableOfContentsItem[] = [];

			sections.forEach((section) => {
				const item: TableOfContentsItem = {
					id: section.id,
					title: section.title,
					level: section.level,
					icon:
						SECTION_ICONS[section.type || ""] ||
						SECTION_ICONS[section.title.toLowerCase()] || (
							<TextIcon className="w-4 h-4" />
						),
					children: [],
				};

				while (levelStack.length > 0 && levelStack[levelStack.length - 1].level >= item.level) {
					levelStack.pop();
				}

				if (levelStack.length === 0) {
					items.push(item);
				} else {
					const parent = levelStack[levelStack.length - 1];
					if (!parent.children) parent.children = [];
					parent.children.push(item);
				}

				levelStack.push(item);
			});

			return items;
		},
		[]
	);

	// Initialize
	useEffect(() => {
		const init = async () => {
			try {
				setLoading(true);
				setError(null);

				if (!document.sections?.length && !document.raw_content) {
					setError("No content available for this document.");
					return;
				}

				setSections(parsedSections);
				setTocItems(generateTOC(parsedSections));
				addRecentDoc(document);
			} catch (err) {
				console.error("Error initializing document:", err);
				setError(err instanceof Error ? err.message : "Failed to load document");
			} finally {
				setLoading(false);
			}
		};

		init();
	}, [document, parsedSections, generateTOC, addRecentDoc]);

	// Virtual scrolling for sections
	const rowVirtualizer = useVirtualizer({
		count: sections.length,
		getScrollElement: () => parentRef.current,
		estimateSize: useCallback(() => 400, []),
		overscan: 5,
		gap: 24,
	});

	// Virtual scrolling for TOC
	const tocVirtualizer = useVirtualizer({
		count: tocItems.length,
		getScrollElement: () => tocParentRef.current,
		estimateSize: useCallback(() => 56, []),
		overscan: 10,
		gap: 4,
	});

	// Search results
	const searchResults = useMemo(() => {
		if (!contentSearch) return new Set<string>();

		const results = new Set<string>();
		const searchLower = contentSearch.toLowerCase();

		sections.forEach((section) => {
			if (
				section.title.toLowerCase().includes(searchLower) ||
				section.content.toLowerCase().includes(searchLower)
			) {
				results.add(section.id);
			}
		});

		return results;
	}, [contentSearch, sections]);

	// Filtered TOC items
	const filteredTocItems = useMemo(() => {
		if (!tocSearch) return tocItems;

		const searchLower = tocSearch.toLowerCase();
		return tocItems.filter((item) => item.title.toLowerCase().includes(searchLower));
	}, [tocItems, tocSearch]);

	// Handlers
	const handleSectionClick = useCallback((sectionId: string) => {
		const index = sections.findIndex((s) => s.id === sectionId);
		if (index !== -1) {
			rowVirtualizer.scrollToIndex(index, { align: "start", behavior: "smooth" });
			setActiveSection(sectionId);
		}
	}, [sections, rowVirtualizer]);

	const handleFavoriteToggle = useCallback(() => {
		if (isDocFavorite) {
			removeFavorite(docKey);
			addToast(`Removed ${document.name} from favorites`, "info");
		} else {
			addFavorite(docKey);
			addToast(`Added ${document.name} to favorites`, "success");
		}
	}, [document.name, isDocFavorite, docKey, addFavorite, removeFavorite, addToast]);

	const handleCopyContent = useCallback(async () => {
		try {
			const textContent = sections.map((s) => `${s.title}\n${s.content}`).join("\n\n");
			await navigator.clipboard.writeText(textContent);
			setCopied(true);
			addToast("Content copied to clipboard", "success");
			setTimeout(() => setCopied(false), 2000);
		} catch (err) {
			addToast("Failed to copy content", "error");
		}
	}, [sections, addToast]);

	// Scroll handler
	useEffect(() => {
		let ticking = false;

		const handleScroll = () => {
			if (!ticking) {
				requestAnimationFrame(() => {
					const scrollTop = parentRef.current?.scrollTop || 0;
					setShowScrollTop(scrollTop > 800);

					// Update active section based on scroll
					const visibleRange = rowVirtualizer.getVirtualItems();
					if (visibleRange.length > 0) {
						const middleItem = visibleRange[Math.floor(visibleRange.length / 2)];
						if (middleItem && sections[middleItem.index]) {
							setActiveSection(sections[middleItem.index].id);
						}
					}

					ticking = false;
				});
				ticking = true;
			}
		};

		const scrollElement = parentRef.current;
		if (scrollElement) {
			scrollElement.addEventListener("scroll", handleScroll, { passive: true });
			return () => scrollElement.removeEventListener("scroll", handleScroll);
		}
	}, [rowVirtualizer, sections]);

	// Keyboard shortcuts
	useEffect(() => {
		const handleKeyPress = (e: KeyboardEvent) => {
			if (e.ctrlKey || e.metaKey) {
				switch (e.key) {
					case "k":
						e.preventDefault();
						setShowToc((prev) => !prev);
						break;
					case "f":
						e.preventDefault();
						searchInputRef.current?.focus();
						break;
				}
			}
		};

		window.addEventListener("keydown", handleKeyPress);
		return () => window.removeEventListener("keydown", handleKeyPress);
	}, [setShowToc]);

	// Render section content
	const renderSectionContent = useCallback(
		(content: string, isSearchResult: boolean) => {
			if (!content.trim()) {
				return <p className="text-gray-500 italic">No content available for this section.</p>;
			}

			// Simple rendering for performance
			const paragraphs = content.split("\n\n").filter(Boolean);

			return (
				<div className="space-y-4">
					{paragraphs.map((paragraph, i) => {
						// Check for code blocks
						if (paragraph.startsWith("```")) {
							const [, lang, ...codeLines] = paragraph.split("\n");
							const code = codeLines.join("\n").replace(/```$/, "");
							const language = lang || detectLanguage(code);

							return (
								<div key={i} className="ultimate-code-block my-4">
									<div className="ultimate-code-header">
										<span className="ultimate-code-language">{language}</span>
										<CopyButton text={code} />
									</div>
									<Suspense
										fallback={
											<div className="ultimate-code-content p-4">
												<pre>{code}</pre>
											</div>
										}
									>
										<EnhancedCodeBlock
											code={code}
											language={language}
											showLineNumbers={showLineNumbers}
											className="ultimate-code-content"
										/>
									</Suspense>
								</div>
							);
						}

						// Regular paragraph
						return (
							<p key={i} className="text-gray-700 dark:text-gray-300 leading-relaxed">
								{isSearchResult && contentSearch
									? highlightText(paragraph, contentSearch)
									: paragraph}
							</p>
						);
					})}
				</div>
			);
		},
		[contentSearch, showLineNumbers]
	);

	// Highlight search terms
	const highlightText = (text: string, search: string) => {
		if (!search) return text;

		const parts = text.split(new RegExp(`(${search})`, "gi"));
		return parts.map((part, i) =>
			part.toLowerCase() === search.toLowerCase() ? (
				<mark key={i} className="bg-yellow-200 dark:bg-yellow-900 px-1 rounded">
					{part}
				</mark>
			) : (
				part
			)
		);
	};

	// Loading state
	if (loading) {
		return (
			<div className="ultimate-loading">
				<div className="ultimate-loading-spinner" />
			</div>
		);
	}

	// Error state
	if (error) {
		return (
			<div className="ultimate-error">
				<ExclamationTriangleIcon className="ultimate-error-icon" />
				<h2 className="ultimate-error-title">Error Loading Document</h2>
				<p className="ultimate-error-message">{error}</p>
			</div>
		);
	}

	return (
		<div className={cn(
				"ultimate-document-viewer min-h-screen",
				`font-size-${fontSize}`,
				className
			)}
		>
			{/* Header */}
			<header className="ultimate-header">
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-4 flex-1 min-w-0">
							<Button
								variant="ghost"
								size="sm"
								onClick={() => setShowToc(!showToc)}
								className={cn(
									"shrink-0 p-2 rounded-xl",
									showToc && "bg-blue-100 dark:bg-blue-900/40"
								)}
							>
								<HamburgerMenuIcon className="w-5 h-5" />
							</Button>

							<div className="min-w-0 flex-1">
								<h1 className="text-2xl font-bold truncate font-mono">
									{document.title}
								</h1>
								{document.summary && (
									<p className="text-sm text-gray-600 dark:text-gray-400 truncate">
										{document.summary}
									</p>
								)}
							</div>
						</div>

						<div className="flex items-center gap-2 shrink-0 ml-4">
							<Button
								variant="ghost"
								size="sm"
								onClick={handleFavoriteToggle}
								className={cn(
									"p-2 rounded-xl",
									isDocFavorite && "bg-yellow-100 dark:bg-yellow-900/40"
								)}
							>
								<BookmarkIcon className={cn("w-5 h-5", isDocFavorite && "fill-current")} />
							</Button>

							<Button variant="ghost" size="sm" onClick={handleCopyContent} className="p-2 rounded-xl">
								{copied ? (
									<CheckIcon className="w-5 h-5 text-green-600" />
								) : (
									<CopyIcon className="w-5 h-5" />
								)}
							</Button>
						</div>
					</div>

					<div className="mt-4 relative">
						<MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
						<Input
							ref={searchInputRef}
							type="text"
							placeholder="Search in document..."
							value={contentSearch}
							onChange={(e) => setContentSearch(e.target.value)}
							className="ultimate-search-input w-full"
						/>
						{contentSearch && (
							<Button
								variant="ghost"
								size="sm"
								onClick={() => setContentSearch("")}
								className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1"
							>
								<Cross2Icon className="w-3 h-3" />
							</Button>
						)}
					</div>
				</div>
			</header>

			{/* TOC Sidebar */}
			<>
				{showToc && (
					<aside className="ultimate-toc fixed left-0 top-[120px] bottom-0 w-80 flex flex-col"
					>
						<div className="p-6 border-b">
							<h2 className="text-lg font-bold mb-4">Table of Contents</h2>
							<Input
								type="text"
								placeholder="Search sections..."
								value={tocSearch}
								onChange={(e) => setTocSearch(e.target.value)}
								className="w-full"
							/>
						</div>

						<div ref={tocParentRef} className="flex-1 overflow-auto"
							style={{ contain: "strict" }}>
							<div
								style={{
									height: `${tocVirtualizer.getTotalSize()}px`,
									width: "100%",
									position: "relative",
								}}
							>
								{tocVirtualizer.getVirtualItems().map((virtualItem) => {
									const item = filteredTocItems[virtualItem.index];
									if (!item) return null;

									return (
										<div key={virtualItem.key}
                    style={{ position: "absolute",
												top: 0,
												left: 0,
												width: "100%",
												height: `${virtualItem.size}px`,
												transform: `translateY(${virtualItem.start}px)`,
										}}	
                    className="px-4"
										>
											<TocItem item={item}
												isActive={item.id === activeSection}
												isSearchResult={searchResults.has(item.id)}
												onClick={handleSectionClick}
												level={0} />
										</div>
									);
								})}
							</div>
						</div>
					</aside>
				)}
			</>

			{/* Main Content */}
			<div className={cn("ultimate-content", showToc && "toc-open")}>
				<div ref={parentRef} className="h-[calc(100vh-140px)] overflow-auto"
					style={{ contain: "strict" }}>
					<div
						style={{
							height: `${rowVirtualizer.getTotalSize()}px`,
							width: "100%",
							position: "relative",
						}}
					>
						{rowVirtualizer.getVirtualItems().map((virtualRow) => {
							const section = sections[virtualRow.index];
							if (!section) return null;

							const isCollapsed = collapsedSections.has(section.id);
							const isSearchResult = searchResults.has(section.id);

							return (
								<div 
									key={virtualRow.key}
									data-index={virtualRow.index}
									ref={rowVirtualizer.measureElement}
									style={{
										position: "absolute",
										top: 0,
										left: 0,
										width: "100%",
										transform: `translateY(${virtualRow.start}px)`,
									}}
									className="px-4 sm:px-6 lg:px-8"
								>
									<section id={section.id} className={cn(
											"ultimate-section",
											isSearchResult && "ring-2 ring-yellow-400 rounded-xl"
										)}
									>
										<div className="ultimate-section-header cursor-pointer"
											onClick={() => {
												setCollapsedSections((prev) => {
													const next = new Set(prev);
													if (next.has(section.id)) {
														next.delete(section.id);
													} else {
														next.add(section.id);
													}
													return next;
												});
											}}
										>
											<div className="ultimate-section-icon">
												{SECTION_ICONS[section.type || ""] || (
													<TextIcon className="w-5 h-5" />
												)}
											</div>

											<h2 className={cn(
													"ultimate-section-title flex-1",
													section.level === 2 && "text-2xl",
													section.level === 3 && "text-xl"
												)}
											>
												{section.title}
											</h2>

											<ChevronDownIcon className={cn(
													"w-5 h-5 transition-transform",
													isCollapsed && "-rotate-90"
												)} />
										</div>

										{!isCollapsed && (
											<div className="ultimate-section-content">
												{renderSectionContent(section.content, isSearchResult)}
											</div>
										)}
									</section>
								</div>
							);
						})}
					</div>
				</div>
			</div>

			{/* Scroll to Top */}
			<>
				{showScrollTop && (
					<button
						onClick={() => {
							parentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
						}}
						className="scroll-to-top"
					>
						<ArrowUpIcon className="w-5 h-5" />
					</button>
				)}
			</>
		</div>
	);
};