import React, {
	useState,
	useEffect,
	useRef,
	useCallback,
	useMemo,
	Fragment,
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
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
	vscDarkPlus,
	oneLight,
} from "react-syntax-highlighter/dist/esm/styles/prism";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { useAppStore } from "@/stores/appStore";
import { cn } from "@/utils/cn";
import type { Document } from "@/types";
import { parseGroffSections, parseGroffContent } from "@/utils/groffParser";
import { EnhancedCodeBlock } from "./EnhancedCodeBlock";
import { isBrowser, isDocumentReady } from "@/utils/browser";

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
	isCollapsed?: boolean;
}

interface CodeBlock {
	id: string;
	code: string;
	language: string;
	lineNumbers?: number;
}

// Enhanced section icons mapping
const sectionIcons: Record<string, React.ReactNode> = {
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

// Language detection for code blocks
const detectLanguage = (code: string): string => {
	// Check for shebang
	if (code.startsWith("#!/")) {
		if (code.includes("bash") || code.includes("sh")) return "bash";
		if (code.includes("python")) return "python";
		if (code.includes("node")) return "javascript";
		if (code.includes("ruby")) return "ruby";
		if (code.includes("perl")) return "perl";
	}

	// Check for common patterns
	const patterns: Record<string, RegExp[]> = {
		bash: [/^\s*\$\s+/, /^\s*#\s+/, /\b(echo|cd|ls|grep|find|sed|awk)\b/],
		c: [/#include\s*<.*>/, /int\s+main\s*\(/, /printf\s*\(/],
		cpp: [/#include\s*<.*>/, /std::/, /cout\s*<</],
		python: [/def\s+\w+\s*\(/, /import\s+\w+/, /print\s*\(/],
		javascript: [/function\s+\w+/, /const\s+\w+/, /console\.log/],
		json: [/^\s*\{[\s\S]*\}\s*$/, /^\s*\[[\s\S]*\]\s*$/],
		yaml: [/^---/, /^\w+:\s*$/m],
		xml: [/<\?xml/, /<\/?\w+>/],
	};

	for (const [lang, langPatterns] of Object.entries(patterns)) {
		if (langPatterns.some((pattern) => pattern.test(code))) {
			return lang;
		}
	}

	return "text";
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
	const [contentSearch, setContentSearch] = useState("");
	const [searchResults, setSearchResults] = useState<string[]>([]);
	const [fontSize, setFontSize] = useState<"sm" | "base" | "lg">("base");
	const [copied, setCopied] = useState(false);
	const [scrollProgress, setScrollProgress] = useState(0);
	const [showScrollTop, setShowScrollTop] = useState(false);
	const [viewMode, setViewMode] = useState<
		"comfortable" | "compact" | "spacious"
	>("comfortable");
	const [showLineNumbers, setShowLineNumbers] = useState(true);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
		new Set()
	);
	const [headerScrolled, setHeaderScrolled] = useState(false);

	// Refs for better performance
	const contentRef = useRef<HTMLDivElement>(null);
	const observerRef = useRef<IntersectionObserver | null>(null);
	const tocRef = useRef<HTMLElement>(null);
	const searchInputRef = useRef<HTMLInputElement>(null);

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

	// Enhanced content parsing with better code block detection
	const parseDocumentContent = useCallback(
		(doc: Document): DocumentSection[] => {
			const sections: DocumentSection[] = [];

			if (doc.sections && doc.sections.length > 0) {
				// Parse structured sections
				const parsedSections = parseGroffSections(doc.sections, {
					preserveFormatting: true,
					convertToMarkdown: true,
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
						isCollapsed: false,
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
									isCollapsed: false,
								});
							}
						);
					}
				});
			} else if (doc.raw_content) {
				// Enhanced raw content parsing
				const cleanContent = parseGroffContent(doc.raw_content, {
					preserveFormatting: true,
					convertToMarkdown: true,
				});

				// Split by common section headers
				const sectionRegex = /^#+\s+(.+)$/gm;
				let match;
				let lastIndex = 0;
				const tempSections: Array<{ title: string; content: string }> = [];

				while ((match = sectionRegex.exec(cleanContent)) !== null) {
					if (lastIndex < match.index) {
						const content = cleanContent.slice(lastIndex, match.index).trim();
						if (tempSections.length > 0 && content) {
							tempSections[tempSections.length - 1].content = content;
						}
					}
					tempSections.push({ title: match[1], content: "" });
					lastIndex = match.index + match[0].length;
				}

				// Add remaining content
				if (lastIndex < cleanContent.length && tempSections.length > 0) {
					tempSections[tempSections.length - 1].content = cleanContent
						.slice(lastIndex)
						.trim();
				}

				// Convert to sections
				tempSections.forEach((section) => {
					const sectionId = `section-${section.title
						.toLowerCase()
						.replace(/\s+/g, "-")}`;
					sections.push({
						id: sectionId,
						title: section.title,
						content: section.content,
						level: 2,
						type: section.title.toLowerCase() as DocumentSection["type"],
						isCollapsed: false,
					});
				});

				// If no sections found, create a single section
				if (sections.length === 0) {
					sections.push({
						id: "section-content",
						title: "Content",
						content: cleanContent,
						level: 2,
						type: "description",
						isCollapsed: false,
					});
				}
			}

			return sections;
		},
		[]
	);

	// Generate enhanced TOC
	const generateTOC = useCallback(
		(sections: DocumentSection[]): TableOfContentsItem[] => {
			const tocItems: TableOfContentsItem[] = [];
			const levelStack: TableOfContentsItem[] = [];

			sections.forEach((section) => {
				const item: TableOfContentsItem = {
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
				};

				// Build hierarchy
				while (
					levelStack.length > 0 &&
					levelStack[levelStack.length - 1].level >= item.level
				) {
					levelStack.pop();
				}

				if (levelStack.length === 0) {
					tocItems.push(item);
				} else {
					const parent = levelStack[levelStack.length - 1];
					if (!parent.children) parent.children = [];
					parent.children.push(item);
				}

				levelStack.push(item);
			});

			return tocItems;
		},
		[activeSection]
	);

	// Initialize document
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

	// Enhanced intersection observer
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

	// Scroll handlers
	useEffect(() => {
		const handleScroll = () => {
			if (!isBrowser() || !isDocumentReady()) return;
			
			const scrollTop = window.pageYOffset || window.scrollY || 0;
			const documentElement = window.document.documentElement;
			
			if (!documentElement) return;
			
			const docHeight = Math.max(
				documentElement.scrollHeight - window.innerHeight,
				0
			);
			const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;

			setScrollProgress(progress);
			setShowScrollTop(scrollTop > 800);
			setHeaderScrolled(scrollTop > 50);
		};

		// Only add listener if in browser
		if (isBrowser()) {
			window.addEventListener("scroll", handleScroll, { passive: true });
			// Delay initial call to ensure DOM is ready
			if (isDocumentReady()) {
				handleScroll();
			} else {
				// Wait for next frame if document not ready
				requestAnimationFrame(() => {
					handleScroll();
				});
			}
		}

		return () => {
			if (isBrowser()) {
				window.removeEventListener("scroll", handleScroll);
			}
		};
	}, []);

	// Enhanced keyboard shortcuts
	useEffect(() => {
		const handleKeyPress = (e: KeyboardEvent) => {
			// Global shortcuts
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
						if (contentSearch) {
							setContentSearch("");
						} else {
							searchInputRef.current?.focus();
						}
						break;
					case "+":
					case "=":
						e.preventDefault();
						setFontSize(
							fontSize === "sm" ? "base" : fontSize === "base" ? "lg" : "lg"
						);
						break;
					case "-":
						e.preventDefault();
						setFontSize(
							fontSize === "lg" ? "base" : fontSize === "base" ? "sm" : "sm"
						);
						break;
					case "0":
						e.preventDefault();
						setFontSize("base");
						break;
				}
			}

			// Navigation shortcuts
			if (!e.ctrlKey && !e.metaKey && !e.altKey) {
				switch (e.key) {
					case "g":
						if (e.shiftKey) {
							// Shift+G - go to bottom
							const documentElement = window.document.documentElement;
							if (documentElement) {
								window.scrollTo({
									top: documentElement.scrollHeight,
									behavior: "smooth",
								});
							}
						} else {
							// Double 'g' - go to top
							if (
								(window as any).lastGPress &&
								Date.now() - (window as any).lastGPress < 300
							) {
								window.scrollTo({ top: 0, behavior: "smooth" });
							}
							(window as any).lastGPress = Date.now();
						}
						break;
					case "/":
						e.preventDefault();
						searchInputRef.current?.focus();
						break;
					case "Escape":
						if (contentSearch) {
							setContentSearch("");
						}
						break;
				}
			}
		};

		window.addEventListener("keydown", handleKeyPress);
		return () => window.removeEventListener("keydown", handleKeyPress);
	}, [showToc, fontSize, contentSearch]);

	// Search functionality
	useEffect(() => {
		if (!contentSearch) {
			setSearchResults([]);
			return;
		}

		const results: string[] = [];
		const searchLower = contentSearch.toLowerCase();

		sections.forEach((section) => {
			if (
				section.title.toLowerCase().includes(searchLower) ||
				section.content.toLowerCase().includes(searchLower)
			) {
				results.push(section.id);
			}
		});

		setSearchResults(results);
	}, [contentSearch, sections]);

	// Section collapse handler
	const toggleSectionCollapse = useCallback((sectionId: string) => {
		setCollapsedSections((prev) => {
			const next = new Set(prev);
			if (next.has(sectionId)) {
				next.delete(sectionId);
			} else {
				next.add(sectionId);
			}
			return next;
		});
	}, []);

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
		addToast("Document downloaded", "success");
	}, [sections, document.name, addToast]);

	const scrollToTop = useCallback(() => {
		window.scrollTo({ top: 0, behavior: "smooth" });
	}, []);

	// Filter TOC items based on search
	const filterTocItems = useCallback(
		(items: TableOfContentsItem[], search: string): TableOfContentsItem[] => {
			if (!search) return items;

			const searchLower = search.toLowerCase();
			return items.reduce((acc: TableOfContentsItem[], item) => {
				const matches = item.title.toLowerCase().includes(searchLower);
				const childMatches = item.children
					? filterTocItems(item.children, search)
					: [];

				if (matches || childMatches.length > 0) {
					acc.push({
						...item,
						children: childMatches.length > 0 ? childMatches : item.children,
					});
				}

				return acc;
			}, []);
		},
		[]
	);

	const filteredTocItems = useMemo(
		() => filterTocItems(tocItems, tocSearch),
		[tocItems, tocSearch, filterTocItems]
	);

	// Calculate read time
	const readTime = useMemo(() => {
		const text = sections.map((s) => s.content).join(" ");
		const words = text
			.split(/\s+/)
			.filter((word) => word.length > 0).length;
		return Math.ceil(words / 200);
	}, [sections]);

	// Enhanced content rendering with better code block detection
	const renderSectionContent = useCallback(
		(content: string, sectionId: string) => {
			if (!content.trim()) {
				return (
					<p className="text-gray-500 dark:text-gray-400 italic">
						No content available for this section.
					</p>
				);
			}

			// Enhanced code block detection
			const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
			const inlineCodeRegex = /`([^`]+)`/g;
			const parts: React.ReactNode[] = [];
			let lastIndex = 0;
			let codeBlockCount = 0;

			// Process code blocks
			let match;
			while ((match = codeBlockRegex.exec(content)) !== null) {
				// Add text before code block
				if (match.index > lastIndex) {
					const textBefore = content.slice(lastIndex, match.index);
					parts.push(
						<div key={`text-${lastIndex}`} className="space-y-4">
							{renderTextWithHighlight(textBefore, sectionId)}
						</div>
					);
				}

				// Detect language if not specified
				const specifiedLang = match[1];
				const code = match[2].trim();
				const language = specifiedLang || detectLanguage(code);

				// Add enhanced code block
				parts.push(
					<div
						key={`code-${match.index}`}
						className="ultimate-code-block my-6"
					>
						<div className="ultimate-code-header">
							<span className="ultimate-code-language">
								{language}
							</span>
							<div className="ultimate-code-actions">
								<CopyButton text={code} />
							</div>
						</div>
						<EnhancedCodeBlock
							code={code}
							language={language}
							showLineNumbers={showLineNumbers}
							showTryIt={language === "bash" || language === "sh"}
							className={cn("ultimate-code-content", !showLineNumbers && "hide-line-numbers")}
						/>
					</div>
				);

				lastIndex = match.index + match[0].length;
				codeBlockCount++;
			}

			// Add remaining text
			if (lastIndex < content.length) {
				const remainingText = content.slice(lastIndex);
				parts.push(
					<div key={`text-${lastIndex}`} className="space-y-4">
						{renderTextWithHighlight(remainingText, sectionId)}
					</div>
				);
			}

			// If no code blocks found, render as formatted text
			if (parts.length === 0) {
				return (
					<div className="space-y-4">
						{renderTextWithHighlight(content, sectionId)}
					</div>
				);
			}

			return <div className="space-y-6">{parts}</div>;
		},
		[showLineNumbers, contentSearch, searchResults]
	);

	// Render text with search highlighting
	const renderTextWithHighlight = useCallback(
		(text: string, sectionId: string) => {
			const paragraphs = text.split("\n\n").filter((p) => p.trim());

			return paragraphs.map((paragraph, i) => {
				// Check for lists
				const isListItem = /^[\s]*[-*+•]\s+/.test(paragraph);
				const isNumberedList = /^[\s]*\d+\.\s+/.test(paragraph);

				if (isListItem || isNumberedList) {
					const items = paragraph.split("\n").filter((line) => line.trim());
					return (
						<ul
							key={`list-${i}`}
							className={cn(
								"space-y-2",
								isNumberedList ? "list-decimal" : "list-disc",
								"list-inside"
							)}
						>
							{items.map((item, j) => (
								<li key={j} className="text-gray-700 dark:text-gray-300">
									{highlightText(
										item.replace(/^[\s]*[-*+•\d.]\s+/, ""),
										contentSearch,
										searchResults.includes(sectionId)
									)}
								</li>
							))}
						</ul>
					);
				}

				// Check for options/flags (common in man pages)
				const isOption = /^\s*-\w/.test(paragraph);
				if (isOption) {
					const lines = paragraph.split("\n");
					return (
						<div key={`options-${i}`} className="space-y-3">
							{lines.map((line, j) => {
								const optionMatch = line.match(/^(\s*)((-\w+,?\s*)+)(.*)/);
								if (optionMatch) {
									return (
										<div key={j} className="flex items-start gap-4">
											<code className="flex-shrink-0 px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-sm font-mono text-blue-600 dark:text-blue-400">
												{optionMatch[2]}
											</code>
											<span className="text-gray-700 dark:text-gray-300">
												{highlightText(
													optionMatch[4].trim(),
													contentSearch,
													searchResults.includes(sectionId)
												)}
											</span>
										</div>
									);
								}
								return (
									<p key={j} className="text-gray-700 dark:text-gray-300">
										{highlightText(
											line,
											contentSearch,
											searchResults.includes(sectionId)
										)}
									</p>
								);
							})}
						</div>
					);
				}

				// Regular paragraph
				return (
					<p key={`p-${i}`} className="text-gray-700 dark:text-gray-300 leading-relaxed">
						{highlightText(
							paragraph,
							contentSearch,
							searchResults.includes(sectionId)
						)}
					</p>
				);
			});
		},
		[contentSearch, searchResults]
	);

	// Highlight search terms
	const highlightText = useCallback(
		(text: string, search: string, isInResult: boolean) => {
			if (!search || !isInResult) return text;

			const parts = text.split(new RegExp(`(${search})`, "gi"));
			return parts.map((part, i) =>
				part.toLowerCase() === search.toLowerCase() ? (
					<mark
						key={i}
						className="bg-yellow-200 dark:bg-yellow-900 text-gray-900 dark:text-gray-100 px-1 rounded"
					>
						{part}
					</mark>
				) : (
					part
				)
			);
		},
		[]
	);

	// Copy button component
	const CopyButton: React.FC<{ text: string }> = ({ text }) => {
		const [copied, setCopied] = useState(false);

		const handleCopy = async () => {
			try {
				await navigator.clipboard.writeText(text);
				setCopied(true);
				setTimeout(() => setCopied(false), 2000);
			} catch (err) {
				console.error("Failed to copy:", err);
			}
		};

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
		<div
			className={cn(
				"ultimate-document-viewer min-h-screen",
				`font-size-${fontSize}`,
				`view-mode-${viewMode}`,
				isFullscreen && "fixed inset-0 z-50",
				className
			)}
		>
			{/* Progress Bar */}
			<div
				className="ultimate-progress-bar"
				style={{ scaleX: scrollProgress / 100 }}}
			/>

			{/* Mobile TOC Overlay */}
			<>
				{showToc && (
					<div}}}}
						className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30 lg:hidden"
						onClick={() => setShowToc(false)}
					/>
				)}
			</>

			{/* Enhanced Fixed Header */}
			<header className={cn("ultimate-header", headerScrolled && "scrolled")}>
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
					<div className="flex items-center justify-between">
						{/* Left side - Document info */}
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

							<div className="min-w-0 flex-1">
								{/* Breadcrumbs */}
								<div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
									<HomeIcon className="w-3 h-3" />
									<ChevronRightIcon className="w-3 h-3" />
									<span>Commands</span>
									<ChevronRightIcon className="w-3 h-3" />
									<span className="font-medium text-gray-700 dark:text-gray-300">
										{document.name}
									</span>
								</div>

								{/* Title */}
								<h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 truncate font-mono mt-1">
									{document.title}
								</h1>

								{/* Summary and badges */}
								<div className="flex items-center gap-3 mt-2">
									{document.summary && (
										<p className="text-gray-600 dark:text-gray-400 text-sm truncate flex-1">
											{document.summary}
										</p>
									)}
									<div className="flex items-center gap-2 shrink-0">
										{document.section &&
											document.section !== "json" && (
												<Badge
													variant="default"
													className="ultimate-badge ultimate-badge-primary text-xs"
												>
													Section {document.section}
												</Badge>
											)}
										{document.doc_set && (
											<Badge
												variant="default"
												className="ultimate-badge ultimate-badge-primary text-xs capitalize"
											>
												{document.doc_set}
											</Badge>
										)}
									</div>
								</div>
							</div>
						</div>

						{/* Right side - Actions */}
						<div className="flex items-center gap-2 shrink-0 ml-4">
							{/* View controls */}
							<div className="hidden sm:flex items-center gap-1 mr-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
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
									className="relative text-xs px-2 py-1 rounded-lg hover:bg-white dark:hover:bg-gray-700 transition-colors"
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

								<div className="w-px h-4 bg-gray-300 dark:bg-gray-600" />

								<Button
									variant="ghost"
									size="sm"
									onClick={() =>
										setShowLineNumbers(!showLineNumbers)
									}
									className={cn(
										"px-2 py-1 rounded-lg transition-all",
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
									className="px-2 py-1 rounded-lg hover:bg-white dark:hover:bg-gray-700 transition-colors"
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
								title="Copy all content"
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
								title="Download as text"
							>
								<DownloadIcon className="w-5 h-5" />
							</Button>
						</div>
					</div>

					{/* Search bar */}
					<div className="mt-4 relative">
						<MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
						<Input
							ref={searchInputRef}
							type="text"
							placeholder="Search in document... (Press / to focus)"
							value={contentSearch}
							onChange={(e) => setContentSearch(e.target.value)}
							className="ultimate-search-input w-full"
						/>
						{contentSearch && (
							<div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
								<span className="text-xs text-gray-500 dark:text-gray-400">
									{searchResults.length} results
								</span>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => setContentSearch("")}
									className="p-1 h-auto rounded-lg"
								>
									<Cross2Icon className="w-3 h-3" />
								</Button>
							</div>
						)}
					</div>
				</div>
			</header>

			{/* Enhanced Table of Contents */}
			<>
				{showToc && (
					<aside
						ref={tocRef}}}}}
						className={cn(
							"ultimate-toc",
							"fixed left-0 top-[120px] bottom-0 w-80 flex flex-col overflow-hidden",
							"lg:top-[140px]"
						)}
					>
						{/* TOC Header */}
						<div className="ultimate-toc-header flex-shrink-0 p-6 border-b border-gray-200/60 dark:border-gray-700/60">
							<div className="flex items-center justify-between mb-4">
								<h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
									<ReaderIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
									Table of Contents
								</h2>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => setShowToc(false)}
									className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors p-1.5"
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

							{/* Document stats */}
							<div className="flex items-center gap-2 mt-4">
								<Badge
									variant="info"
									className="ultimate-badge ultimate-badge-primary text-xs"
								>
									<ClockIcon className="w-3 h-3 mr-1" />
									{readTime} min read
								</Badge>
								<Badge
									variant="success"
									className="ultimate-badge ultimate-badge-success text-xs"
								>
									{sections.length} sections
								</Badge>
								{searchResults.length > 0 && (
									<Badge
										variant="warning"
										className="ultimate-badge ultimate-badge-warning text-xs"
									>
										{searchResults.length} matches
									</Badge>
								)}
							</div>
						</div>

						{/* TOC Items */}
						<div className="flex-1 overflow-y-auto overscroll-contain">
							<div className="p-4 space-y-1">
								<>
									{filteredTocItems.length > 0 ? (
										<TocItemList
											items={filteredTocItems}
											activeSection={activeSection}
											onItemClick={handleSectionClick}
											searchResults={searchResults}
										/>
									) : (
										<div}}
											className="text-center py-8 text-gray-500 dark:text-gray-400"
										>
											<MagnifyingGlassIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
											<p className="text-sm">
												No sections found
											</p>
										</div>
									)}
								</>
							</div>
						</div>

						{/* TOC Footer with shortcuts */}
						<div className="flex-shrink-0 p-4 border-t border-gray-200/60 dark:border-gray-700/60 bg-gray-50/80 dark:bg-gray-800/80">
							<div className="grid grid-cols-2 gap-2 text-xs text-gray-500 dark:text-gray-400">
								<div className="flex items-center gap-1">
									<kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs">
										⌘K
									</kbd>
									<span>Toggle TOC</span>
								</div>
								<div className="flex items-center gap-1">
									<kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs">
										/
									</kbd>
									<span>Search</span>
								</div>
								<div className="flex items-center gap-1">
									<kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs">
										⌘+
									</kbd>
									<span>Increase font</span>
								</div>
								<div className="flex items-center gap-1">
									<kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs">
										⌘-
									</kbd>
									<span>Decrease font</span>
								</div>
							</div>
						</div>
					</aside>
				)}
			</>

			{/* Main Content Area */}
			<div
				className={cn(
					"ultimate-content min-h-screen transition-all duration-300 ease-out",
					showToc && "toc-open"
				)}
			>
				{/* Document Content */}
				<main className="relative">
					<div
						ref={contentRef}
						className={cn(
							"max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8",
							fontSize === "sm" && "text-sm",
							fontSize === "lg" && "text-lg",
							viewMode === "compact" && "space-y-4 py-6",
							viewMode === "comfortable" && "space-y-6 py-8",
							viewMode === "spacious" && "space-y-8 py-12"
						)}
					>
						{sections.length > 0 ? (
							<>
								{sections.map((section, index) => {
									const isCollapsed = collapsedSections.has(section.id);
									const isSearchResult = searchResults.includes(section.id);

									return (
										<section
											key={section.id}}}}
											id={section.id}
											className={cn(
												"ultimate-section scroll-mt-32",
												isSearchResult && "ring-2 ring-yellow-400 dark:ring-yellow-600 rounded-xl"
											)}
										>
											{/* Section header */}
											<div
												className={cn(
													"ultimate-section-header cursor-pointer",
													section.level === 3 && "ml-8"
												)}
												onClick={() => toggleSectionCollapse(section.id)}
											>
												{/* Section icon */}
												<div className="ultimate-section-icon">
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
														"ultimate-section-title flex-1",
														section.level === 2 &&
															"text-2xl",
														section.level === 3 &&
															"text-xl"
													)}
												>
													{section.title}
												</h2>

												{/* Collapse indicator */}
												<div}}
												>
													<ChevronDownIcon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
												</div>
											</div>

											{/* Section content */}
											<>
												{!isCollapsed && (
													<div}}}}
														className={cn(
															"ultimate-section-content overflow-hidden",
															section.level === 3 && "ml-8"
														)}
													>
														{renderSectionContent(
															section.content,
															section.id
														)}
													</div>
												)}
											</>
										</section>
									);
								})}
							</>
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
			<>
				{showScrollTop && (
					<button}}}
						onClick={scrollToTop}
						className="scroll-to-top"
						title="Scroll to top"
					>
						<ArrowUpIcon className="w-5 h-5" />
					</button>
				)}
			</>
		</div>
	);
};

// TOC Item List Component
const TocItemList: React.FC<{
	items: TableOfContentsItem[];
	activeSection: string;
	onItemClick: (id: string) => void;
	searchResults: string[];
	level?: number;
}> = ({ items, activeSection, onItemClick, searchResults, level = 0 }) => {
	return (
		<>
			{items.map((item, index) => {
				const isActive = item.id === activeSection;
				const isSearchResult = searchResults.includes(item.id);

				return (
					<Fragment key={item.id}>
						<button}}}}
							onClick={() => onItemClick(item.id)}
							className={cn(
								"toc-item group flex items-center gap-3 w-full text-left p-3 rounded-xl transition-all duration-200 relative overflow-hidden",
								"hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:shadow-md hover:scale-[1.02]",
								isActive && "active",
								isSearchResult && "ring-2 ring-yellow-400 dark:ring-yellow-600",
								level > 0 && "ml-6 text-sm"
							)}
						>
							{/* Active indicator */}
							{isActive && (
								<div
									className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500 to-purple-500 rounded-r"}
								/>
							)}

							{/* Icon */}
							<div
								className={cn(
									"flex-shrink-0 p-1.5 rounded-lg transition-all duration-200",
									isActive
										? "bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-300 scale-110"
										: "bg-gray-100 dark:bg-gray-800 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/60 group-hover:scale-105"
								)}
							>
								{item.icon}
							</div>

							{/* Title */}
							<span className={cn(
								"flex-1 truncate leading-tight",
								isActive && "font-semibold"
							)}>
								{item.title}
							</span>

							{/* Chevron for interactive feedback */}
							<ChevronRightIcon
								className={cn(
									"w-4 h-4 opacity-0 group-hover:opacity-100 transition-all duration-200 transform",
									"group-hover:translate-x-1",
									isActive &&
										"opacity-100 text-blue-600 dark:text-blue-400"
								)}
							/>
						</button>

						{/* Render children */}
						{item.children && item.children.length > 0 && (
							<TocItemList
								items={item.children}
								activeSection={activeSection}
								onItemClick={onItemClick}
								searchResults={searchResults}
								level={level + 1}
							/>
						)}
					</Fragment>
				);
			})}
		</>
	);
};