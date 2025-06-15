import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
	vscDarkPlus,
	vs,
} from "react-syntax-highlighter/dist/esm/styles/prism";
import {
	BookmarkIcon,
	Share1Icon,
	DownloadIcon,
	EyeOpenIcon,
	HamburgerMenuIcon,
	CopyIcon as DocumentDuplicateIcon,
} from "@radix-ui/react-icons";
import { Button } from "@/components/ui/Button";
import { useAppStore } from "@/stores/appStore";
import { cn } from "@/utils/cn";
import type { Document } from "@/types";
import { parseGroffContent, parseGroffSections, parseSectionName } from "@/utils/groffParser";

interface DocumentViewerProps {
	document: Document;
	className?: string;
}

interface TableOfContentsItem {
	id: string;
	title: string;
	level: number;
	element?: HTMLElement;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({
	document: initialDocument,
	className,
}) => {
	const [document] = useState(initialDocument);
	const [content, setContent] = useState<string>("");
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [showToc, setShowToc] = useState(true);
	const [tocItems, setTocItems] = useState<TableOfContentsItem[]>([]);
	const [activeSection, setActiveSection] = useState<string>("");
	const [showLineNumbers, setShowLineNumbers] = useState(true);
	const [fontSize, setFontSize] = useState<"sm" | "base" | "lg">("base");
	const [scrollProgress, setScrollProgress] = useState(0);

	const contentRef = useRef<HTMLDivElement>(null);
	const observerRef = useRef<IntersectionObserver | null>(null);

	const {
		darkMode,
		isFavorite,
		addFavorite,
		removeFavorite,
		addRecentDoc,
		addToast,
		preferences,
	} = useAppStore();

	// Load document content
	useEffect(() => {
		const loadContent = () => {
			try {
				setLoading(true);
				setError(null);

				// Extract content from document sections
				let fullContent = "";
				if (document.sections && document.sections.length > 0) {
					document.sections.forEach((section) => {
						fullContent += `## ${section.name}\n\n${section.content}\n\n`;
						if (section.subsections) {
							section.subsections.forEach((sub) => {
								fullContent += `### ${sub.name}\n\n${sub.content}\n\n`;
							});
						}
					});
				} else if (document.raw_content) {
					fullContent = document.raw_content;
				} else {
					fullContent = "No content available for this document.";
				}

				setContent(fullContent);
				addRecentDoc(document);
			} catch (err) {
				setError(
					err instanceof Error
						? err.message
						: "Failed to load document"
				);
			} finally {
				setLoading(false);
			}
		};

		loadContent();
	}, [document, addRecentDoc]);

	// Generate table of contents from sections
	useEffect(() => {
		if (!document.sections || document.sections.length === 0) {
			// Fallback to DOM-based TOC generation
			if (!content || !contentRef.current) return;

			const headings = Array.from(
				contentRef.current.querySelectorAll("h1, h2, h3, h4, h5, h6")
			);
			const items: TableOfContentsItem[] = headings.map((heading, index) => {
				const id = heading.id || `heading-${index}`;
				if (!heading.id) {
					heading.id = id;
				}

				return {
					id,
					title: heading.textContent || "",
					level: parseInt(heading.tagName.charAt(1)),
					element: heading as HTMLElement,
				};
			});

			setTocItems(items);
		} else {
			// Generate TOC from sections structure with groff parsing
			const items: TableOfContentsItem[] = [];
			const parsedSections = parseGroffSections(document.sections);
			parsedSections.forEach((section, sectionIndex) => {
				const sectionId = `section-${section.name.toLowerCase().replace(/\s+/g, "-")}`;
				items.push({
					id: sectionId,
					title: section.name,
					level: 2,
				});

				if (section.subsections) {
					section.subsections.forEach((sub: any, subIndex: number) => {
						const subId = `${sectionId}-sub-${subIndex}`;
						items.push({
							id: subId,
							title: sub.name,
							level: 3,
						});
					});
				}
			});
			setTocItems(items);
		}
	}, [content, document.sections]);

	// Intersection observer for active section
	useEffect(() => {
		if (tocItems.length === 0) return;

		observerRef.current = new IntersectionObserver(
			(entries) => {
				const visibleEntries = entries.filter(
					(entry) => entry.isIntersecting
				);
				if (visibleEntries.length > 0) {
					const topEntry = visibleEntries.reduce((top, entry) =>
						entry.boundingClientRect.top <
						top.boundingClientRect.top
							? entry
							: top
					);
					setActiveSection(topEntry.target.id);
				}
			},
			{
				rootMargin: "-80px 0px -80% 0px",
				threshold: 0.1,
			}
		);

		tocItems.forEach((item) => {
			if (item.element) {
				observerRef.current?.observe(item.element);
			}
		});

		return () => {
			observerRef.current?.disconnect();
		};
	}, [tocItems]);

	// Track scroll progress
	useEffect(() => {
		const handleScroll = () => {
			const scrollTop = window.pageYOffset || window.document.documentElement.scrollTop;
			const scrollHeight = window.document.documentElement.scrollHeight - window.document.documentElement.clientHeight;
			const progress = scrollHeight > 0 ? scrollTop / scrollHeight : 0;
			setScrollProgress(progress);
		};

		window.addEventListener('scroll', handleScroll);
		handleScroll(); // Initial calculation

		return () => {
			window.removeEventListener('scroll', handleScroll);
		};
	}, []);

	// Scroll to section with offset for sticky header
	const scrollToSection = (id: string) => {
		const element = window.document.getElementById(id);
		if (element) {
			const headerOffset = 140; // Height of sticky header plus progress bar
			const elementPosition = element.getBoundingClientRect().top;
			const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

			window.scrollTo({
				top: offsetPosition,
				behavior: "smooth"
			});
		}
	};

	// Toggle favorite
	const toggleFavorite = () => {
		if (!document.name) {
			addToast('Cannot favorite this document - missing name', 'error');
			return;
		}
		const docKey = `${document.name}.${document.section}`;
		if (isFavorite(docKey)) {
			removeFavorite(docKey);
			addToast(`Removed ${document.name} from favorites`, 'info');
		} else {
			addFavorite(docKey);
			addToast(`Added ${document.name} to favorites`, 'success');
		}
	};

	// Copy content
	const copyContent = async () => {
		try {
			await navigator.clipboard.writeText(content);
			// TODO: Show toast notification
		} catch (err) {
			console.error("Failed to copy content:", err);
		}
	};

	// Print document
	const printDocument = () => {
		window.print();
	};

	// Share document
	const shareDocument = async () => {
		if (navigator.share) {
			try {
				await navigator.share({
					title: document.title,
					text: document.summary,
					url: window.location.href,
				});
			} catch (err) {
				console.error("Failed to share:", err);
			}
		} else {
			// Fallback: copy URL
			await navigator.clipboard.writeText(window.location.href);
		}
	};

	// Render structured sections
	const renderStructuredSections = () => {
		if (!document.sections || document.sections.length === 0) {
			return processContent(content);
		}

		// Parse sections with groff parser
		const parsedSections = parseGroffSections(document.sections);

		return parsedSections.map((section, sectionIndex) => {
			const sectionId = `section-${section.name.toLowerCase().replace(/\s+/g, "-")}`;
			
			return (
				<div key={sectionIndex} className="mb-8">
					<h2
						id={sectionId}
						className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 border-b border-gray-200 dark:border-gray-700 pb-2"
					>
						{section.name}
					</h2>
					<div className="prose prose-gray dark:prose-invert max-w-none">
						{renderContentSection(section.content)}
					</div>
					
					{section.subsections && section.subsections.map((subsection, subIndex) => {
						const subId = `${sectionId}-sub-${subIndex}`;
						return (
							<div key={subIndex} className="ml-4 mt-4">
								<h3
									id={subId}
									className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2"
								>
									{subsection.name}
								</h3>
								<div className="prose prose-gray dark:prose-invert max-w-none">
									{renderContentSection(subsection.content)}
								</div>
							</div>
						);
					})}
				</div>
			);
		});
	};

	// Process content for rendering
	const processContent = (content: string) => {
		// Parse man page content and format it
		const sections = content.split(/\n\n(?=[A-Z][A-Z\s]+)\n/);

		return sections.map((section, index) => {
			const lines = section.split("\n");
			const firstLine = lines[0];

			// Check if this is a section header
			if (firstLine && firstLine.match(/^[A-Z][A-Z\s]+$/)) {
				const header = firstLine.trim();
				const body = lines.slice(1).join("\n");

				return (
					<div key={index} className="mb-8">
						<h2
							id={`section-${header
								.toLowerCase()
								.replace(/\s+/g, "-")}`}
							className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 border-b border-gray-200 dark:border-gray-700 pb-2"
						>
							{header}
						</h2>
						<div className="prose prose-gray dark:prose-invert max-w-none">
							{renderContentSection(body)}
						</div>
					</div>
				);
			}

			return (
				<div key={index} className="mb-4">
					{renderContentSection(section)}
				</div>
			);
		});
	};

	// Render content section with code highlighting
	const renderContentSection = (text: string) => {
		// Detect code blocks (indented lines)
		const lines = text.split("\n");
		let inCodeBlock = false;
		let codeBlock: string[] = [];
		const result: React.ReactNode[] = [];

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const isIndented = line.startsWith("    ") || line.startsWith("\t");

			if (isIndented && !inCodeBlock) {
				inCodeBlock = true;
				codeBlock = [line.trim()];
			} else if (isIndented && inCodeBlock) {
				codeBlock.push(line.trim());
			} else if (!isIndented && inCodeBlock) {
				// End of code block
				result.push(
					<div key={`code-${i}`} className="my-4">
						<SyntaxHighlighter
							language="bash"
							style={darkMode ? vscDarkPlus : vs}
							customStyle={{
								fontSize:
									fontSize === "sm"
										? "0.875rem"
										: fontSize === "lg"
										? "1.125rem"
										: "1rem",
								borderRadius: "0.5rem",
							}}
							showLineNumbers={showLineNumbers}
						>
							{codeBlock.join("\n")}
						</SyntaxHighlighter>
					</div>
				);
				inCodeBlock = false;
				codeBlock = [];

				if (line.trim()) {
					result.push(
						<p
							key={`text-${i}`}
							className={cn(
								"my-2 leading-relaxed text-gray-700 dark:text-gray-300",
								fontSize === "sm" && "text-sm",
								fontSize === "lg" && "text-lg"
							)}
						>
							{line}
						</p>
					);
				}
			} else if (!inCodeBlock && line.trim()) {
				result.push(
					<p
						key={`text-${i}`}
						className={cn(
							"my-2 leading-relaxed",
							fontSize === "sm" && "text-sm",
							fontSize === "lg" && "text-lg"
						)}
					>
						{line}
					</p>
				);
			}
		}

		// Handle remaining code block
		if (inCodeBlock && codeBlock.length > 0) {
			result.push(
				<div key="final-code" className="my-4">
					<SyntaxHighlighter
						language="bash"
						style={darkMode ? vscDarkPlus : vs}
						customStyle={{
							fontSize:
								fontSize === "sm"
									? "0.875rem"
									: fontSize === "lg"
									? "1.125rem"
									: "1rem",
							borderRadius: "0.5rem",
						}}
						showLineNumbers={showLineNumbers}
					>
						{codeBlock.join("\n")}
					</SyntaxHighlighter>
				</div>
			);
		}

		return result;
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center py-12">
				<motion.div
					animate={{ rotate: 360 }}
					transition={{
						duration: 1,
						repeat: Infinity,
						ease: "linear",
					}}
					className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full"
				/>
			</div>
		);
	}

	if (error) {
		return (
			<div className="text-center py-12">
				<p className="text-red-600 dark:text-red-400">{error}</p>
			</div>
		);
	}

	return (
		<div className={cn("relative bg-white dark:bg-gray-900", className)}>
			{/* Table of Contents - Fixed Sidebar */}
			{tocItems.length > 0 && (
				<motion.aside
					initial={false}
					animate={{ 
						x: showToc ? 0 : -256,
						opacity: showToc ? 1 : 0
					}}
					transition={{ duration: 0.2, ease: "easeOut" }}
					className="document-toc fixed left-0 top-24 h-[calc(100vh-6rem)] w-64 bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 overflow-y-auto z-20"
					style={{ pointerEvents: showToc ? 'auto' : 'none' }}
				>
					<div className="sticky top-0 bg-gray-50 dark:bg-gray-800 p-4 border-b border-gray-200 dark:border-gray-700">
						<h3 className="font-semibold text-gray-900 dark:text-gray-100">
							Table of Contents
						</h3>
					</div>
					<nav className="p-4 space-y-1">
						{tocItems.map((item) => (
							<button
								key={item.id}
								onClick={() => scrollToSection(item.id)}
								className={cn(
									"block w-full text-left text-sm py-2 px-3 rounded transition-all duration-200",
									"text-gray-700 dark:text-gray-300",
									"hover:bg-gray-200 dark:hover:bg-gray-700",
									item.id === activeSection &&
										"bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium",
									item.level > 2 && "ml-4 text-xs",
									item.level > 3 && "ml-8"
								)}
							>
								{item.title}
							</button>
						))}
					</nav>
				</motion.aside>
			)}

			{/* Main Content - Adjust margin based on TOC visibility */}
			<div className={cn("flex-1 bg-white dark:bg-gray-900 transition-all duration-300", showToc && tocItems.length > 0 && "ml-64")}>
				{/* Progress Bar */}
				<div className="fixed top-0 left-0 right-0 h-1 bg-gray-200 dark:bg-gray-800 z-40">
					<motion.div
						className="h-full bg-blue-500"
						style={{ 
							transformOrigin: "0%",
							scaleX: scrollProgress
						}}
						transition={{ duration: 0.1 }}
					/>
				</div>
				
				{/* Document Header - Sticky with proper offset */}
				<header className="document-header sticky top-1 z-30 bg-white/98 dark:bg-gray-900/98 backdrop-blur-md border-b border-gray-200 dark:border-gray-700 p-6 shadow-lg">
					<div className="flex items-center justify-between">
						<div className="flex-1 min-w-0">
							<h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 font-mono">
								{document.title}
							</h1>
							<p className="text-gray-600 dark:text-gray-400 mt-1">
								{document.summary}
							</p>
							<div className="flex items-center space-x-4 mt-2 text-sm text-gray-500 dark:text-gray-400">
								{document.section && document.section !== "json" && (
									<>
										<span>Section {document.section}</span>
										<span>•</span>
									</>
								)}
								<span>{document.doc_set}</span>
							</div>
						</div>

						<div className="flex items-center space-x-2">
							{/* View options */}
							<div className="flex items-center space-x-1">
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
								>
									{fontSize === "sm"
										? "A"
										: fontSize === "base"
										? "A"
										: "A"}
								</Button>
								<Button
									variant="ghost"
									size="sm"
									onClick={() =>
										setShowLineNumbers(!showLineNumbers)
									}
								>
									<EyeOpenIcon className="w-4 h-4" />
								</Button>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => setShowToc(!showToc)}
								>
									<HamburgerMenuIcon className="w-4 h-4" />
								</Button>
							</div>

							{/* Actions */}
							<Button
								variant="ghost"
								size="sm"
								onClick={toggleFavorite}
								className={cn(
									document.name && isFavorite(`${document.name}.${document.section}`)
										? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20"
										: "text-gray-600 dark:text-gray-400"
								)}
							>
								<BookmarkIcon
									className={cn(
										"w-4 h-4",
										document.name && isFavorite(`${document.name}.${document.section}`) &&
											"fill-current"
									)}
								/>
							</Button>

							<Button
								variant="ghost"
								size="sm"
								onClick={copyContent}
							>
								<DocumentDuplicateIcon className="w-4 h-4" />
							</Button>

							<Button
								variant="ghost"
								size="sm"
								onClick={shareDocument}
							>
								<Share1Icon className="w-4 h-4" />
							</Button>

							<Button
								variant="ghost"
								size="sm"
								onClick={printDocument}
							>
								<DownloadIcon className="w-4 h-4" />
							</Button>
						</div>
					</div>
				</header>

				{/* Document Content with top padding for sticky header */}
				<main className="p-6 pt-32">
					<motion.div
						ref={contentRef}
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						className="max-w-4xl mx-auto"
					>
						{content || document.sections ? (
							renderStructuredSections()
						) : (
							<div className="text-center py-8 text-gray-500 dark:text-gray-400">
								No content available
							</div>
						)}
					</motion.div>
				</main>
			</div>
		</div>
	);
};
