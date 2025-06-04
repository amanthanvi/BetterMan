import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
	vscDarkPlus,
	vs,
} from "react-syntax-highlighter/dist/esm/styles/prism";
import {
	StarIcon,
	Share1Icon,
	DownloadIcon,
	CopyIcon,
	ChevronUpIcon,
	ChevronDownIcon,
	MixerHorizontalIcon,
	EyeOpenIcon,
	BookmarkIcon,
	CopyIcon as DocumentDuplicateIcon,
} from "@radix-ui/react-icons";
import { Button } from "@/components/ui/Button";
import { useAppStore } from "@/stores/appStore";
import { documentAPI } from "@/services/api";
import { cn } from "@/utils/cn";
import type { Document } from "@/types";

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
	const [document, setDocument] = useState(initialDocument);
	const [content, setContent] = useState<string>("");
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [showToc, setShowToc] = useState(true);
	const [tocItems, setTocItems] = useState<TableOfContentsItem[]>([]);
	const [activeSection, setActiveSection] = useState<string>("");
	const [showLineNumbers, setShowLineNumbers] = useState(true);
	const [fontSize, setFontSize] = useState<"sm" | "base" | "lg">("base");

	const contentRef = useRef<HTMLDivElement>(null);
	const observerRef = useRef<IntersectionObserver | null>(null);

	const {
		darkMode,
		isFavorite,
		addFavorite,
		removeFavorite,
		addRecentDoc,
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

	// Generate table of contents
	useEffect(() => {
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
	}, [content]);

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

	// Scroll to section
	const scrollToSection = (id: string) => {
		const element = window.document.getElementById(id);
		if (element) {
			element.scrollIntoView({
				behavior: "smooth",
				block: "start",
			});
		}
	};

	// Toggle favorite
	const toggleFavorite = () => {
		if (isFavorite(document.id)) {
			removeFavorite(document.id);
		} else {
			addFavorite(document.id);
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
						<div className="prose dark:prose-invert max-w-none">
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
								"my-2 leading-relaxed",
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
		<div className={cn("flex min-h-screen", className)}>
			{/* Table of Contents */}
			{showToc && tocItems.length > 0 && (
				<motion.aside
					initial={{ x: -250, opacity: 0 }}
					animate={{ x: 0, opacity: 1 }}
					className="w-64 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 p-4 sticky top-0 h-screen overflow-y-auto"
				>
					<h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">
						Table of Contents
					</h3>
					<nav className="space-y-1">
						{tocItems.map((item) => (
							<button
								key={item.id}
								onClick={() => scrollToSection(item.id)}
								className={cn(
									"block w-full text-left text-sm py-1 px-2 rounded transition-colors",
									"hover:bg-gray-200 dark:hover:bg-gray-800",
									item.id === activeSection &&
										"bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
									item.level > 1 && "ml-4",
									item.level > 2 && "ml-8"
								)}
							>
								{item.title}
							</button>
						))}
					</nav>
				</motion.aside>
			)}

			{/* Main Content */}
			<div className="flex-1 max-w-none">
				{/* Document Header */}
				<header className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 p-4 z-10">
					<div className="flex items-center justify-between">
						<div className="flex-1 min-w-0">
							<h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 font-mono">
								{document.title}
							</h1>
							<p className="text-gray-600 dark:text-gray-400 mt-1">
								{document.summary}
							</p>
							<div className="flex items-center space-x-4 mt-2 text-sm text-gray-500 dark:text-gray-400">
								<span>Section {document.section}</span>
								<span>•</span>
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
									<BookmarkIcon className="w-4 h-4" />
								</Button>
							</div>

							{/* Actions */}
							<Button
								variant="ghost"
								size="sm"
								onClick={toggleFavorite}
								className={
									isFavorite(document.id)
										? "text-yellow-500"
										: ""
								}
							>
								<StarIcon
									className={cn(
										"w-4 h-4",
										isFavorite(document.id) &&
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

				{/* Document Content */}
				<main className="p-6">
					<motion.div
						ref={contentRef}
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						className="max-w-4xl mx-auto"
					>
						{content ? (
							processContent(content)
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
