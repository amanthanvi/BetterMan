import React, {
	useState,
	useEffect,
	useRef,
	useCallback,
	useMemo,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
	BookmarkIcon,
	Share1Icon,
	DownloadIcon,
	EyeOpenIcon,
	HamburgerMenuIcon,
	CopyIcon,
	CheckIcon,
	ChevronRightIcon,
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
} from "@radix-ui/react-icons";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
	vscDarkPlus,
	vs,
} from "react-syntax-highlighter/dist/esm/styles/prism";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { useAppStore } from "@/stores/appStore";
import { cn } from "@/utils/cn";
import type { Document } from "@/types";
import { parseGroffSections } from "@/utils/groffParser";

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
	isActive?: boolean;
	isExpanded?: boolean;
}

interface DocumentSection {
	id: string;
	title: string;
	content: string;
	level: number;
	type?:
		| "header"
		| "synopsis"
		| "description"
		| "options"
		| "examples"
		| "see-also"
		| "notes"
		| "bugs"
		| "author"
		| "copyright";
}

// Section icons mapping for beautiful visual hierarchy
const sectionIcons: Record<string, React.ReactNode> = {
	header: <LayersIcon className="w-4 h-4" />,
	name: <TargetIcon className="w-4 h-4" />,
	synopsis: <CodeIcon className="w-4 h-4" />,
	description: <TextIcon className="w-4 h-4" />,
	options: <CubeIcon className="w-4 h-4" />,
	examples: <RocketIcon className="w-4 h-4" />,
	"exit status": <InfoCircledIcon className="w-4 h-4" />,
	environment: <LayersIcon className="w-4 h-4" />,
	notes: <InfoCircledIcon className="w-4 h-4" />,
	bugs: <ExclamationTriangleIcon className="w-4 h-4" />,
	"see also": <LightningBoltIcon className="w-4 h-4" />,
	author: <HeartIcon className="w-4 h-4" />,
	copyright: <StarIcon className="w-4 h-4" />,
};

export const UltimateDocumentViewer: React.FC<DocumentViewerProps> = ({
	document,
	className,
}) => {
	// Enhanced state management
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [sections, setSections] = useState<DocumentSection[]>([]);
	const [tocItems, setTocItems] = useState<TableOfContentsItem[]>([]);
	const [activeSection, setActiveSection] = useState<string>("");
	const [tocSearch, setTocSearch] = useState("");
	const [fontSize, setFontSize] = useState<"sm" | "base" | "lg">("base");
	const [copied, setCopied] = useState(false);
	const [scrollProgress, setScrollProgress] = useState(0);
	const [showScrollTop, setShowScrollTop] = useState(false);
	const [viewMode, setViewMode] = useState<
		"comfortable" | "compact" | "spacious"
	>("comfortable");
	const [showLineNumbers, setShowLineNumbers] = useState(true);
	const [isFullscreen, setIsFullscreen] = useState(false);

	// Refs for better performance and DOM manipulation
	const contentRef = useRef<HTMLDivElement>(null);
	const observerRef = useRef<IntersectionObserver | null>(null);
	const tocRef = useRef<HTMLElement>(null);

	// App store integration
	const {
		darkMode,
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

	// Enhanced content parsing
	const parseDocumentContent = useCallback(
		(doc: Document): DocumentSection[] => {
			const sections: DocumentSection[] = [];

			if (doc.sections && doc.sections.length > 0) {
				// Parse structured sections with enhanced groff support
				const parsedSections = parseGroffSections(doc.sections, {
					preserveFormatting: true,
					convertToMarkdown: false,
				});

				parsedSections.forEach((section) => {
					const sectionId = `section-${section.name
						.toLowerCase()
						.replace(/\s+/g, "-")}`;
					const sectionType =
						section.name.toLowerCase() as DocumentSection["type"];

					sections.push({
						id: sectionId,
						title: section.name,
						content: section.content || "",
						level: 2,
						type: sectionType,
					});

					// Process subsections
					if (section.subsections) {
						section.subsections.forEach(
							(sub: any, subIndex: number) => {
								const subId = `${sectionId}-sub-${subIndex}`;
								sections.push({
									id: subId,
									title: sub.name,
									content: sub.content || "",
									level: 3,
									type: sectionType,
								});
							}
						);
					}
				});
			} else if (doc.raw_content) {
				// Parse raw content intelligently
				const rawSections = doc.raw_content.split(
					/\n\n(?=[A-Z][A-Z\s]+)\n/
				);
				rawSections.forEach((section) => {
					const lines = section.split("\n");
					const firstLine = lines[0];

					if (firstLine && firstLine.match(/^[A-Z][A-Z\s]+$/)) {
						const title = firstLine.trim();
						const content = lines.slice(1).join("\n");
						const sectionId = `section-${title
							.toLowerCase()
							.replace(/\s+/g, "-")}`;

						sections.push({
							id: sectionId,
							title,
							content,
							level: 2,
							type: title.toLowerCase() as DocumentSection["type"],
						});
					}
				});
			}

			return sections;
		},
		[]
	);

	// Generate TOC from sections
	const generateTOC = useCallback(
		(sections: DocumentSection[]): TableOfContentsItem[] => {
			return sections.map((section) => ({
				id: section.id,
				title: section.title,
				level: section.level,
				icon: sectionIcons[section.type || ""] ||
					sectionIcons[section.title.toLowerCase()] || (
						<TextIcon className="w-4 h-4" />
					),
				children: [],
				isActive: section.id === activeSection,
				isExpanded: true,
			}));
		},
		[activeSection]
	);

	// Initialize document content
	useEffect(() => {
		const initializeDocument = async () => {
			try {
				setLoading(true);
				setError(null);

				if (!document.sections?.length && !document.raw_content) {
					setError("No content available for this document.");
					return;
				}

				// Parse document content
				const parsedSections = parseDocumentContent(document);
				setSections(parsedSections);

				// Generate TOC
				const tocItems = generateTOC(parsedSections);
				setTocItems(tocItems);

				// Add to recent documents
				addRecentDoc(document);
			} catch (err) {
				console.error("Error initializing document:", err);
				setError(
					err instanceof Error
						? err.message
						: "Failed to load document"
				);
			} finally {
				setLoading(false);
			}
		};

		initializeDocument();
	}, [document, parseDocumentContent, generateTOC, addRecentDoc]);

	// Enhanced intersection observer for section tracking
	useEffect(() => {
		if (!sections.length || typeof window === "undefined") {
			return;
		}

		const observerOptions: IntersectionObserverInit = {
			root: null,
			rootMargin: "-20% 0px -60% 0px",
			threshold: [0, 0.25, 0.5, 0.75, 1],
		};

		const observer = new IntersectionObserver(
			(entries: IntersectionObserverEntry[]) => {
				let maxVisibleEntry: IntersectionObserverEntry | null = null;
				let maxRatio = 0;

				entries.forEach((entry) => {
					if (
						entry.isIntersecting &&
						entry.intersectionRatio > maxRatio
					) {
						maxRatio = entry.intersectionRatio;
						maxVisibleEntry = entry;
					}
				});

				if (maxVisibleEntry !== null) {
					const target = maxVisibleEntry.target as HTMLElement;
					if (target && target.id) {
						setActiveSection(target.id);
					}
				}
			},
			observerOptions
		);

		// Observe all section elements
		sections.forEach((section) => {
			const element = window.document.getElementById(section.id);
			if (element) {
				observer.observe(element);
			}
		});

		observerRef.current = observer;

		return () => observer.disconnect();
	}, [sections]);

	// Scroll progress and scroll-to-top visibility
	useEffect(() => {
		const handleScroll = () => {
			const scrollTop = window.pageYOffset;
			const docHeight =
				window.document.documentElement.scrollHeight -
				window.innerHeight;
			const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;

			setScrollProgress(progress);
			setShowScrollTop(scrollTop > 800);
		};

		window.addEventListener("scroll", handleScroll, { passive: true });
		handleScroll(); // Initial calculation

		return () => window.removeEventListener("scroll", handleScroll);
	}, []);

	// Keyboard shortcuts
	useEffect(() => {
		const handleKeyPress = (e: KeyboardEvent) => {
			if (e.ctrlKey || e.metaKey) {
				switch (e.key) {
					case "k":
						e.preventDefault();
						setShowToc(!showToc);
						break;
					case "b":
						e.preventDefault();
						handleFavoriteToggle();
						break;
					case "f":
						e.preventDefault();
						setIsFullscreen(!isFullscreen);
						break;
					case "+":
					case "=":
						e.preventDefault();
						setFontSize(fontSize === "sm" ? "base" : "lg");
						break;
					case "-":
						e.preventDefault();
						setFontSize(fontSize === "lg" ? "base" : "sm");
						break;
				}
			}
		};

		window.addEventListener("keydown", handleKeyPress);
		return () => window.removeEventListener("keydown", handleKeyPress);
	}, [showToc, fontSize, isFullscreen]);

	// Handler functions
	const handleSectionClick = useCallback((sectionId: string) => {
		const element = window.document.getElementById(sectionId);
		if (element) {
			const elementPosition = element.getBoundingClientRect().top;
			const offsetPosition =
				elementPosition + window.pageYOffset - 100;

			window.scrollTo({
				top: offsetPosition,
				behavior: "smooth",
			});
		}
	}, []);

	const handleFavoriteToggle = useCallback(() => {
		if (!document.name) {
			addToast("Cannot favorite this document - missing name", "error");
			return;
		}

		if (isDocFavorite) {
			removeFavorite(docKey);
			addToast(`Removed ${document.name} from favorites`, "info");
		} else {
			addFavorite(docKey);
			addToast(`Added ${document.name} to favorites`, "success");
		}
	}, [
		document.name,
		isDocFavorite,
		docKey,
		addFavorite,
		removeFavorite,
		addToast,
	]);

	const handleCopyContent = useCallback(async () => {
		try {
			const textContent = sections
				.map((s) => `${s.title}\n${s.content}`)
				.join("\n\n");
			await navigator.clipboard.writeText(textContent);
			setCopied(true);
			addToast("Content copied to clipboard", "success");
			setTimeout(() => setCopied(false), 2000);
		} catch (err) {
			addToast("Failed to copy content", "error");
		}
	}, [sections, addToast]);

	const handleShare = useCallback(async () => {
		try {
			if (navigator.share) {
				await navigator.share({
					title: document.title,
					text: document.summary,
					url: window.location.href,
				});
			} else {
				await navigator.clipboard.writeText(window.location.href);
				addToast("URL copied to clipboard", "success");
			}
		} catch (err) {
			console.error("Failed to share:", err);
		}
	}, [document, addToast]);

	const handleDownload = useCallback(() => {
		const textContent = sections
			.map(
				(s) =>
					`${s.title}\n${"=".repeat(s.title.length)}\n\n${s.content}`
			)
			.join("\n\n");
		const blob = new Blob([textContent], { type: "text/plain" });
		const url = URL.createObjectURL(blob);
		const a = window.document.createElement("a");
		a.href = url;
		a.download = `${document.name || "document"}.txt`;
		window.document.body.appendChild(a);
		a.click();
		window.document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}, [sections, document.name]);

	const scrollToTop = useCallback(() => {
		window.scrollTo({ top: 0, behavior: "smooth" });
	}, []);

	// Filter TOC items based on search
	const filteredTocItems = useMemo(() => {
		if (!tocSearch) {
			return tocItems;
		}

		const searchLower = tocSearch.toLowerCase();
		return tocItems.filter((item) =>
			item.title.toLowerCase().includes(searchLower)
		);
	}, [tocItems, tocSearch]);

	// Calculate read time
	const readTime = useMemo(() => {
		const text = sections.map((s) => s.content).join(" ");
		const words = text
			.split(/\s+/)
			.filter((word) => word.length > 0).length;
		return Math.ceil(words / 200);
	}, [sections]);

	// Content rendering helpers
	const renderSectionContent = useCallback(
		(content: string) => {
			if (!content.trim()) {
				return null;
			}

			// Detect and render code blocks
			const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
			const parts = [];
			let lastIndex = 0;
			let match;

			while ((match = codeBlockRegex.exec(content)) !== null) {
				// Add text before code block
				if (match.index > lastIndex) {
					const textBefore = content.slice(lastIndex, match.index);
					if (textBefore.trim()) {
						parts.push(
							<div
								key={`text-${lastIndex}`}
								className="prose prose-gray dark:prose-invert max-w-none"
							>
								{textBefore.split("\n").map((line, i) => (
									<p key={i} className="mb-2 leading-relaxed">
										{line}
									</p>
								))}
							</div>
						);
					}
				}

				// Add code block
				const language = match[1] || "bash";
				const code = match[2];
				parts.push(
					<div key={`code-${match.index}`} className="my-6">
						<SyntaxHighlighter
							language={language}
							style={darkMode ? vscDarkPlus : vs}
							customStyle={{
								fontSize:
									fontSize === "sm"
										? "0.875rem"
										: fontSize === "lg"
										? "1.125rem"
										: "1rem",
								borderRadius: "0.75rem",
								border: "1px solid",
								borderColor: darkMode ? "#374151" : "#e5e7eb",
							}}
							showLineNumbers={showLineNumbers}
						>
							{code}
						</SyntaxHighlighter>
					</div>
				);

				lastIndex = match.index + match[0].length;
			}

			// Add remaining text
			if (lastIndex < content.length) {
				const remainingText = content.slice(lastIndex);
				if (remainingText.trim()) {
					parts.push(
						<div
							key={`text-${lastIndex}`}
							className="prose prose-gray dark:prose-invert max-w-none"
						>
							{remainingText.split("\n").map((line, i) => (
								<p key={i} className="mb-2 leading-relaxed">
									{line}
								</p>
							))}
						</div>
					);
				}
			}

			// If no code blocks found, render as regular text
			if (parts.length === 0) {
				return (
					<div className="prose prose-gray dark:prose-invert max-w-none">
						{content.split("\n").map((line, i) => (
							<p key={i} className="mb-2 leading-relaxed">
								{line}
							</p>
						))}
					</div>
				);
			}

			return parts;
		},
		[darkMode, fontSize, showLineNumbers]
	);

	if (loading) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<motion.div
					animate={{ rotate: 360 }}
					transition={{
						duration: 1,
						repeat: Infinity,
						ease: "linear",
					}}
					className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full"
				/>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<div className="text-center max-w-md mx-auto p-6">
					<ExclamationTriangleIcon className="w-16 h-16 text-red-500 mx-auto mb-4" />
					<h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
						Error Loading Document
					</h2>
					<p className="text-red-600 dark:text-red-400">{error}</p>
				</div>
			</div>
		);
	}

	return (
		<div
			className={cn(
				"ultimate-document-viewer min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50 dark:from-gray-950 dark:via-gray-900 dark:to-blue-950 relative",
				isFullscreen && "fixed inset-0 z-50",
				className
			)}
		>
			{/* Enhanced Progress Bar */}
			<motion.div
				className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 z-50 origin-left shadow-lg"
				style={{ scaleX: scrollProgress / 100 }}
				transition={{ duration: 0.1 }}
			/>

			{/* Table of Contents Overlay - when TOC is open on mobile */}
			<AnimatePresence>
				{showToc && (
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.3 }}
						className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 lg:hidden"
						onClick={() => setShowToc(false)}
					/>
				)}
			</AnimatePresence>

			{/* Fixed Header - Always on top */}
			<header className="fixed top-0 left-0 right-0 z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border-b border-gray-200/60 dark:border-gray-700/60 shadow-lg">
				<div className="max-w-6xl mx-auto px-6 py-4">
					<div className="flex items-center justify-between">
						{/* Document info */}
						<div className="flex items-center gap-4 flex-1 min-w-0">
							<Button
								variant="ghost"
								size="sm"
								onClick={() => setShowToc(!showToc)}
								className={cn(
									"shrink-0 p-2 rounded-xl transition-all duration-200 hover:scale-105",
									showToc
										? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 shadow-md"
										: "hover:bg-gray-100 dark:hover:bg-gray-800"
								)}
							>
								<HamburgerMenuIcon className="w-5 h-5" />
							</Button>

							<div className="min-w-0">
								<h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 truncate font-mono">
									{document.title}
								</h1>
								{document.summary && (
									<p className="text-gray-600 dark:text-gray-400 text-sm truncate">
										{document.summary}
									</p>
								)}
								<div className="flex items-center gap-3 mt-1">
									{document.section &&
										document.section !== "json" && (
											<Badge
												variant="default"
												className="text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
											>
												Section {document.section}
											</Badge>
										)}
									{document.doc_set && (
										<Badge
											variant="default"
											className="text-xs bg-gray-50 dark:bg-gray-800 capitalize border border-gray-200 dark:border-gray-700"
										>
											{document.doc_set}
										</Badge>
									)}
								</div>
							</div>
						</div>

						{/* Action buttons */}
						<div className="flex items-center gap-1 shrink-0">
							{/* View mode controls */}
							<div className="flex items-center gap-1 mr-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
								<Button
									variant="ghost"
									size="sm"
									onClick={() =>
										setFontSize(
											fontSize === "sm"
												? "base"
												: fontSize === "base"
												? "lg"
												: "sm"
										)
									}
									className="relative text-xs px-2 rounded-lg hover:bg-white dark:hover:bg-gray-700 transition-colors"
									title="Font size"
								>
									<span
										className={cn(
											"font-bold transition-all",
											fontSize === "sm" && "text-xs",
											fontSize === "base" &&
												"text-sm",
											fontSize === "lg" && "text-base"
										)}
									>
										A
									</span>
								</Button>

								<Button
									variant="ghost"
									size="sm"
									onClick={() =>
										setShowLineNumbers(!showLineNumbers)
									}
									className={cn(
										"px-2 rounded-lg transition-all",
										showLineNumbers &&
											"bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
									)}
									title="Toggle line numbers"
								>
									<EyeOpenIcon className="w-4 h-4" />
								</Button>

								<Button
									variant="ghost"
									size="sm"
									onClick={() =>
										setViewMode(
											viewMode === "compact"
												? "comfortable"
												: viewMode === "comfortable"
												? "spacious"
												: "compact"
										)
									}
									className="px-2 rounded-lg hover:bg-white dark:hover:bg-gray-700 transition-colors"
									title="View mode"
								>
									<MixerHorizontalIcon className="w-4 h-4" />
								</Button>
							</div>

							{/* Main actions */}
							<Button
								variant="ghost"
								size="sm"
								onClick={handleFavoriteToggle}
								className={cn(
									"p-2 rounded-xl transition-all duration-200 hover:scale-105",
									isDocFavorite
										? "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 shadow-md"
										: "hover:bg-gray-100 dark:hover:bg-gray-800"
								)}
								title="Toggle favorite"
							>
								<BookmarkIcon
									className={cn(
										"w-5 h-5",
										isDocFavorite && "fill-current"
									)}
								/>
							</Button>

							<Button
								variant="ghost"
								size="sm"
								onClick={handleCopyContent}
								className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 hover:scale-105 transition-all"
								title="Copy content"
							>
								{copied ? (
									<CheckIcon className="w-5 h-5 text-green-600" />
								) : (
									<CopyIcon className="w-5 h-5" />
								)}
							</Button>

							<Button
								variant="ghost"
								size="sm"
								onClick={handleShare}
								className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 hover:scale-105 transition-all"
								title="Share document"
							>
								<Share1Icon className="w-5 h-5" />
							</Button>

							<Button
								variant="ghost"
								size="sm"
								onClick={handleDownload}
								className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 hover:scale-105 transition-all"
								title="Download document"
							>
								<DownloadIcon className="w-5 h-5" />
							</Button>
						</div>
					</div>
				</div>
			</header>

			{/* Table of Contents Sidebar */}
			<AnimatePresence mode="wait">
				{showToc && (
					<motion.aside
						ref={tocRef}
						initial={{ x: -400, opacity: 0 }}
						animate={{ x: 0, opacity: 1 }}
						exit={{ x: -400, opacity: 0 }}
						transition={{
							type: "spring",
							damping: 25,
							stiffness: 250,
						}}
						className="fixed left-0 top-[80px] bottom-0 w-80 bg-white/95 dark:bg-gray-900/95 backdrop-blur-2xl border-r border-gray-200/60 dark:border-gray-700/60 shadow-2xl z-40 flex flex-col overflow-hidden"
						style={{
							contain: "layout style paint",
							transform: "translateZ(0)",
							willChange: "transform",
						}}
					>
						{/* TOC Header */}
						<div className="flex-shrink-0 p-6 border-b border-gray-200/60 dark:border-gray-700/60 bg-gradient-to-r from-blue-50/80 via-white/80 to-purple-50/80 dark:from-blue-950/80 dark:via-gray-900/80 dark:to-purple-950/80">
							<div className="flex items-center justify-between mb-4">
								<h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
									<ReaderIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
									Table of Contents
								</h2>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => setShowToc(false)}
									className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
								>
									<Cross2Icon className="w-4 h-4" />
								</Button>
							</div>

							{/* TOC Search */}
							<div className="relative">
								<MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
								<Input
									type="text"
									placeholder="Search sections..."
									value={tocSearch}
									onChange={(e) =>
										setTocSearch(e.target.value)
									}
									className="pl-10 pr-4 py-2 w-full text-sm bg-white/70 dark:bg-gray-800/70 border-gray-200/60 dark:border-gray-700/60 rounded-xl focus:bg-white dark:focus:bg-gray-800 transition-colors"
								/>
								{tocSearch && (
									<Button
										variant="ghost"
										size="sm"
										onClick={() => setTocSearch("")}
										className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 h-auto rounded-lg"
									>
										<Cross2Icon className="w-3 h-3" />
									</Button>
								)}
							</div>

							{/* Document info badges */}
							<div className="flex items-center gap-2 mt-4">
								<Badge
									variant="info"
									className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700"
								>
									<ClockIcon className="w-3 h-3 mr-1" />
									{readTime} min read
								</Badge>
								<Badge
									variant="success"
									className="text-xs bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-700"
								>
									{sections.length} sections
								</Badge>
							</div>
						</div>

						{/* TOC Items */}
						<div className="flex-1 overflow-y-auto overscroll-contain">
							<div className="p-4 space-y-1">
								<AnimatePresence>
									{filteredTocItems.length > 0 ? (
										filteredTocItems.map((item, index) => (
											<motion.button
												key={item.id}
												initial={{ opacity: 0, x: -20 }}
												animate={{ opacity: 1, x: 0 }}
												exit={{ opacity: 0, x: -20 }}
												transition={{
													delay: index * 0.02,
												}}
												onClick={() =>
													handleSectionClick(item.id)
												}
												className={cn(
													"group flex items-center gap-3 w-full text-left p-3 rounded-xl transition-all duration-200 relative overflow-hidden",
													"hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:shadow-md hover:scale-[1.02]",
													item.id === activeSection
														? "bg-gradient-to-r from-blue-100 to-purple-100 dark:from-blue-900/50 dark:to-purple-900/50 text-blue-700 dark:text-blue-300 shadow-lg font-medium border border-blue-200 dark:border-blue-700"
														: "text-gray-700 dark:text-gray-300 border border-transparent hover:border-blue-200/50 dark:hover:border-blue-700/50",
													item.level > 2 &&
														"ml-4 text-sm"
												)}
											>
												{/* Active indicator */}
												{item.id === activeSection && (
													<motion.div
														layoutId="active-toc-indicator"
														className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500 to-purple-500 rounded-r"
														transition={{
															type: "spring",
															damping: 25,
															stiffness: 350,
														}}
													/>
												)}

												{/* Icon */}
												<div
													className={cn(
														"flex-shrink-0 p-1.5 rounded-lg transition-all duration-200",
														item.id ===
															activeSection
															? "bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-300 scale-110"
															: "bg-gray-100 dark:bg-gray-800 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/60 group-hover:scale-105"
													)}
												>
													{item.icon}
												</div>

												{/* Title */}
												<span className="flex-1 truncate leading-tight">
													{item.title}
												</span>

												{/* Chevron for interactive feedback */}
												<ChevronRightIcon
													className={cn(
														"w-4 h-4 opacity-0 group-hover:opacity-100 transition-all duration-200 transform",
														"group-hover:translate-x-1",
														item.id ===
															activeSection &&
															"opacity-100 text-blue-600 dark:text-blue-400"
													)}
												/>
											</motion.button>
										))
									) : (
										<motion.div
											initial={{ opacity: 0 }}
											animate={{ opacity: 1 }}
											className="text-center py-8 text-gray-500 dark:text-gray-400"
										>
											<MagnifyingGlassIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
											<p className="text-sm">
												No sections found
											</p>
										</motion.div>
									)}
								</AnimatePresence>
							</div>
						</div>

						{/* TOC Footer with shortcuts */}
						<div className="flex-shrink-0 p-4 border-t border-gray-200/60 dark:border-gray-700/60 bg-gray-50/80 dark:bg-gray-800/80">
							<div className="flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
								<div className="flex items-center gap-1">
									<kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs">
										Ctrl
									</kbd>
									<span>+</span>
									<kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs">
										K
									</kbd>
									<span>Toggle TOC</span>
								</div>
							</div>
						</div>
					</motion.aside>
				)}
			</AnimatePresence>

			{/* Main Content Area */}
			<div
				className={cn(
					"min-h-screen pt-20 transition-all duration-300 ease-out",
					showToc ? "lg:ml-80" : "ml-0"
				)}
			>

				{/* Document Content */}
				<main className="relative">
					<div
						ref={contentRef}
						className={cn(
							"max-w-5xl mx-auto px-6 py-8",
							fontSize === "sm" && "text-sm",
							fontSize === "lg" && "text-lg",
							viewMode === "compact" && "space-y-4 py-6",
							viewMode === "comfortable" && "space-y-6 py-8",
							viewMode === "spacious" && "space-y-8 py-12"
						)}
					>
						{sections.length > 0 ? (
							<AnimatePresence>
								{sections.map((section, index) => (
									<motion.section
										key={section.id}
										initial={{ opacity: 0, y: 20 }}
										animate={{ opacity: 1, y: 0 }}
										transition={{ delay: index * 0.05 }}
										id={section.id}
										className={cn(
											"group scroll-mt-24",
											viewMode === "compact" && "mb-6",
											viewMode === "comfortable" &&
												"mb-8",
											viewMode === "spacious" && "mb-12"
										)}
									>
										{/* Section header */}
										<div className="flex items-center gap-3 mb-4 group-hover:translate-x-1 transition-transform duration-200">
											{/* Section icon */}
											<div className="flex-shrink-0 p-2 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/40 dark:to-purple-900/40 rounded-xl border border-blue-200/60 dark:border-blue-700/60 shadow-sm">
												{sectionIcons[
													section.type || ""
												] ||
													sectionIcons[
														section.title.toLowerCase()
													] || (
														<TextIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
													)}
											</div>

											{/* Section title */}
											<h2
												className={cn(
													"font-bold text-gray-900 dark:text-gray-100 flex-1",
													section.level === 2 &&
														"text-2xl",
													section.level === 3 &&
														"text-xl"
												)}
											>
												{section.title}
											</h2>

											{/* Copy section link */}
											<Button
												variant="ghost"
												size="sm"
												onClick={() => {
													const url = `${window.location.origin}${window.location.pathname}#${section.id}`;
													navigator.clipboard.writeText(
														url
													);
													addToast(
														"Section link copied",
														"success"
													);
												}}
												className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
												title="Copy section link"
											>
												<CopyIcon className="w-4 h-4" />
											</Button>
										</div>

										{/* Section content */}
										<div
											className={cn(
												"pl-12 pr-4 py-4 rounded-xl border transition-all duration-200",
												section.id === activeSection
													? "border-blue-200 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/10"
													: "border-gray-200/60 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600",
												viewMode === "compact" &&
													"py-3",
												viewMode === "spacious" && "py-6"
											)}
										>
											{renderSectionContent(
												section.content
											)}
										</div>
									</motion.section>
								))}
							</AnimatePresence>
						) : (
							<div className="text-center py-12 text-gray-500 dark:text-gray-400">
								<InfoCircledIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
								<p className="text-lg">
									No content available for this document.
								</p>
							</div>
						)}
					</div>
				</main>
			</div>

			{/* Scroll to Top Button */}
			<AnimatePresence>
				{showScrollTop && (
					<motion.button
						initial={{ opacity: 0, scale: 0.8 }}
						animate={{ opacity: 1, scale: 1 }}
						exit={{ opacity: 0, scale: 0.8 }}
						onClick={scrollToTop}
						className="fixed bottom-8 right-8 p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-110 z-30"
						title="Scroll to top"
					>
						<ArrowUpIcon className="w-5 h-5" />
					</motion.button>
				)}
			</AnimatePresence>
		</div>
	);
};