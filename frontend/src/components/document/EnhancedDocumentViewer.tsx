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
	CheckIcon,
	DotFilledIcon,
	ChevronRightIcon,
} from "@radix-ui/react-icons";
import { Button } from "@/components/ui/Button";
import { useAppStore } from "@/stores/appStore";
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

export const EnhancedDocumentViewer: React.FC<DocumentViewerProps> = ({
	document: initialDocument,
	className,
}) => {
	const [document] = useState(initialDocument);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [showToc, setShowToc] = useState(typeof window !== 'undefined' ? window.innerWidth > 768 : true);
	const [tocItems, setTocItems] = useState<TableOfContentsItem[]>([]);
	const [activeSection, setActiveSection] = useState<string>("");
	const [showLineNumbers, setShowLineNumbers] = useState(true);
	const [fontSize, setFontSize] = useState<"sm" | "base" | "lg">("base");
	const [copied, setCopied] = useState(false);
	const [scrollProgress, setScrollProgress] = useState(0);

	const contentRef = useRef<HTMLDivElement>(null);
	const observerRef = useRef<IntersectionObserver | null>(null);
	const tocRef = useRef<HTMLDivElement>(null);

	const {
		darkMode,
		isFavorite,
		addFavorite,
		removeFavorite,
		addRecentDoc,
		addToast,
	} = useAppStore();

	// Load document content
	useEffect(() => {
		const loadContent = () => {
			try {
				setLoading(true);
				setError(null);
				
				// Check if document has sections
				if (!document.sections || document.sections.length === 0) {
					setError("No content available for this document.");
					return;
				}

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
		if (!document.sections || document.sections.length === 0) return;

		const items: TableOfContentsItem[] = [];
		document.sections.forEach((section, sectionIndex) => {
			const sectionId = `section-${section.name.toLowerCase().replace(/\s+/g, "-")}`;
			items.push({
				id: sectionId,
				title: section.name,
				level: 2,
			});

			if (section.subsections) {
				section.subsections.forEach((sub, subIndex) => {
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
	}, [document.sections]);

	// Set up intersection observer for active section tracking
	useEffect(() => {
		if (typeof window === 'undefined' || tocItems.length === 0) return;

		// Store all visible sections
		const visibleSections = new Set<string>();

		const observer = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					if (entry.isIntersecting) {
						visibleSections.add(entry.target.id);
					} else {
						visibleSections.delete(entry.target.id);
					}
				});

				// Find the topmost visible section
				if (visibleSections.size > 0) {
					const sortedSections = tocItems
						.filter(item => visibleSections.has(item.id))
						.map(item => {
							const element = window.document.getElementById(item.id);
							if (!element) return null;
							return {
								id: item.id,
								top: element.getBoundingClientRect().top
							};
						})
						.filter(Boolean)
						.sort((a, b) => (a?.top || 0) - (b?.top || 0));

					if (sortedSections.length > 0 && sortedSections[0]) {
						setActiveSection(sortedSections[0].id);
					}
				}
			},
			{
				rootMargin: "-20% 0px -60% 0px",
				threshold: [0, 0.1, 0.5, 1],
			}
		);

		// Observe all section headers
		tocItems.forEach((item) => {
			const element = window.document.getElementById(item.id);
			if (element) {
				observer.observe(element);
			}
		});

		observerRef.current = observer;

		return () => {
			observer.disconnect();
		};
	}, [tocItems]);

	// Track scroll progress
	useEffect(() => {
		if (typeof window === 'undefined') return;

		const handleScroll = () => {
			const scrollTop = window.scrollY || 0;
			const docElement = window.document.documentElement;
			if (!docElement) return;
			
			const docHeight = Math.max(
				docElement.scrollHeight - window.innerHeight,
				1
			);
			const progress = Math.min((scrollTop / docHeight) * 100, 100);
			setScrollProgress(progress);
		};

		// Initial call
		handleScroll();

		window.addEventListener("scroll", handleScroll);
		return () => window.removeEventListener("scroll", handleScroll);
	}, []);

	// Scroll to section
	const scrollToSection = (id: string) => {
		const element = window.document.getElementById(id);
		if (element) {
			const offset = 100; // Account for fixed header
			const y = element.getBoundingClientRect().top + window.scrollY - offset;
			window.scrollTo({ top: y, behavior: "smooth" });
			
			// Manually set active section after a delay to ensure scroll completes
			setTimeout(() => {
				setActiveSection(id);
			}, 100);
		}
	};

	// Toggle favorite
	const toggleFavorite = () => {
		if (!document.name) {
			addToast("Cannot favorite this document - missing name", "error");
			return;
		}
		const docKey = `${document.name}.${document.section}`;
		if (isFavorite(docKey)) {
			removeFavorite(docKey);
			addToast(`Removed ${document.name} from favorites`, "info");
		} else {
			addFavorite(docKey);
			addToast(`Added ${document.name} to favorites`, "success");
		}
	};

	// Copy content
	const copyContent = async () => {
		try {
			const contentText = document.sections
				?.map(section => {
					let text = `${section.name}\n\n${section.content}`;
					if (section.subsections) {
						text += "\n\n" + section.subsections
							.map(sub => `${sub.name}\n\n${sub.content}`)
							.join("\n\n");
					}
					return text;
				})
				.join("\n\n---\n\n");
			
			await navigator.clipboard.writeText(contentText || "");
			setCopied(true);
			addToast("Copied to clipboard", "success");
			setTimeout(() => setCopied(false), 2000);
		} catch (err) {
			console.error("Failed to copy content:", err);
			addToast("Failed to copy content", "error");
		}
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
			addToast("Link copied to clipboard", "success");
		}
	};

	// Print document
	const printDocument = () => {
		window.print();
	};

	// Parse and format content sections
	const renderContentSection = (content: string) => {
		if (!content) return null;

		// Split content into paragraphs and handle different formatting
		const blocks = content.split(/\n\n+/).filter(block => block.trim());
		
		return blocks.map((block, index) => {
			// Check if block is a command/option definition (starts with - or --)
			if (block.match(/^\s*-{1,2}\w/)) {
				const options = block.split('\n').filter(line => line.trim());
				return (
					<div key={index} className="my-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
						{options.map((option, optIndex) => {
							// Split option and description
							const match = option.match(/^(\s*)(--?\S+)(.*)$/);
							if (match) {
								const [, indent, flag, desc] = match;
								return (
									<div key={optIndex} className="flex flex-wrap gap-2 mb-2">
										<code className="inline-block px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-sm font-mono text-blue-600 dark:text-blue-400">
											{flag}
										</code>
										<span className={cn(
											"text-gray-700 dark:text-gray-300",
											fontSize === "sm" && "text-sm",
											fontSize === "lg" && "text-lg"
										)}>
											{desc.trim()}
										</span>
									</div>
								);
							}
							return (
								<div key={optIndex} className={cn(
									"text-gray-700 dark:text-gray-300 mb-1",
									fontSize === "sm" && "text-sm",
									fontSize === "lg" && "text-lg"
								)}>
									{option}
								</div>
							);
						})}
					</div>
				);
			}

			// Check if block looks like code (indented or contains special characters)
			if (block.match(/^\s{4,}|^\t/) || block.includes('$') || block.includes('|')) {
				return (
					<div key={index} className="my-4">
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
								padding: "1rem",
							}}
							showLineNumbers={showLineNumbers}
						>
							{block.trim()}
						</SyntaxHighlighter>
					</div>
				);
			}

			// Check if block is a list
			if (block.match(/^[\d•·]\s/m)) {
				const listItems = block.split('\n').filter(item => item.trim());
				return (
					<ul key={index} className="my-4 space-y-1">
						{listItems.map((item, itemIndex) => (
							<li key={itemIndex} className={cn(
								"flex items-start gap-2 text-gray-700 dark:text-gray-300",
								fontSize === "sm" && "text-sm",
								fontSize === "lg" && "text-lg"
							)}>
								<span className="text-blue-500 dark:text-blue-400 mt-1">•</span>
								<span>{item.replace(/^[\d•·]\s*/, '')}</span>
							</li>
						))}
					</ul>
				);
			}

			// Regular paragraph
			return (
				<p key={index} className={cn(
					"my-4 leading-relaxed text-gray-700 dark:text-gray-300",
					fontSize === "sm" && "text-sm",
					fontSize === "lg" && "text-lg"
				)}>
					{block}
				</p>
			);
		});
	};

	// Render structured sections
	const renderStructuredSections = () => {
		if (!document.sections || document.sections.length === 0) {
			return <div className="text-center py-8 text-gray-500 dark:text-gray-400">
				No content available
			</div>;
		}

		return document.sections.map((section, sectionIndex) => {
			const sectionId = `section-${section.name.toLowerCase().replace(/\s+/g, "-")}`;
			
			return (
				<section 
					key={sectionIndex} 
					className="mb-12"
				>
					<h2
						id={sectionId}
						className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 pb-3 border-b-2 border-gray-200 dark:border-gray-700 scroll-mt-28"
					>
						{section.name}
					</h2>
					<div className="space-y-4">
						{renderContentSection(section.content)}
					</div>
					
					{section.subsections && section.subsections.map((subsection, subIndex) => {
						const subId = `${sectionId}-sub-${subIndex}`;
						return (
							<div key={subIndex} className="mt-8 ml-4 border-l-2 border-gray-200 dark:border-gray-700 pl-4">
								<h3
									id={subId}
									className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4 scroll-mt-28"
								>
									{subsection.name}
								</h3>
								<div className="space-y-4">
									{renderContentSection(subsection.content)}
								</div>
							</div>
						);
					})}
				</section>
			);
		});
	};

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
					className="w-12 h-12 border-3 border-blue-500 border-t-transparent rounded-full"
				/>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<div className="text-center">
					<p className="text-red-600 dark:text-red-400 text-lg">{error}</p>
				</div>
			</div>
		);
	}

	return (
		<div className={cn("relative flex min-h-screen bg-gray-50 dark:bg-gray-950", className)}>
			{/* Progress bar */}
			<div className="fixed top-0 left-0 right-0 h-1 bg-gray-200 dark:bg-gray-800 z-[60]">
				<motion.div 
					className="h-full bg-blue-500"
					initial={{ width: "0%" }}
					animate={{ width: `${scrollProgress}%` }}
					transition={{ duration: 0.1 }}
				/>
			</div>

			{/* Table of Contents - Fixed Sidebar */}
			<div 
				className={cn(
					"fixed inset-y-0 left-0 w-72 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transition-transform duration-300 z-40",
					showToc ? "translate-x-0" : "-translate-x-full"
				)}
			>
				{/* TOC Header */}
				<div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4">
					<h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100 flex items-center gap-2">
						<ChevronRightIcon className="w-5 h-5" />
						Table of Contents
					</h3>
				</div>
				
				{/* TOC Content */}
				<div className="overflow-y-auto h-[calc(100vh-5rem)]">
					<nav className="p-6 space-y-1">
						{tocItems.map((item) => {
							const isActive = item.id === activeSection;
							return (
								<button
									key={item.id}
									onClick={() => scrollToSection(item.id)}
									className={cn(
										"relative block w-full text-left py-2 px-4 rounded-lg transition-colors duration-150",
										"hover:bg-gray-100 dark:hover:bg-gray-800",
										item.level > 2 && "pl-8 text-sm",
										isActive
											? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 font-medium"
											: "text-gray-600 dark:text-gray-400"
									)}
								>
									{isActive && (
										<span className="absolute left-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-blue-500 rounded-full" />
									)}
									<span className={cn("block", isActive ? "pl-4" : "")}>
										{item.title}
									</span>
								</button>
							);
						})}
					</nav>
				</div>
			</div>
			
			{/* Main Content Area */}
			<div 
				className={cn(
					"flex-1 w-full transition-all duration-300",
					showToc ? "pl-72" : "pl-0"
				)}
			>
				{/* Document Header */}
				<header className="sticky top-0 z-30 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 shadow-sm">
					<div className="px-6 py-4">
						<div className="flex items-center justify-between">
							<div className="flex-1 min-w-0 pr-4">
								<h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 font-mono truncate">
									{document.title}
								</h1>
								{document.summary && (
									<p className="text-gray-600 dark:text-gray-400 mt-1 text-sm md:text-base line-clamp-2">
										{document.summary}
									</p>
								)}
								<div className="flex items-center gap-4 mt-2 text-sm text-gray-500 dark:text-gray-500">
									<span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">
										Section {document.section}
									</span>
									{document.doc_set && (
										<>
											<span>•</span>
											<span>{document.doc_set}</span>
										</>
									)}
								</div>
							</div>

							<div className="flex items-center gap-1 flex-shrink-0">
								{/* View options */}
								<div className="flex items-center gap-1 mr-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
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
										className="relative"
									>
										<span className={cn(
											"font-bold",
											fontSize === "sm" && "text-xs",
											fontSize === "base" && "text-sm",
											fontSize === "lg" && "text-base"
										)}>
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
											showLineNumbers && "bg-gray-200 dark:bg-gray-700"
										)}
									>
										<EyeOpenIcon className="w-4 h-4" />
									</Button>
									<Button
										variant="ghost"
										size="sm"
										onClick={() => setShowToc(!showToc)}
										className={cn(
											showToc && "bg-gray-200 dark:bg-gray-700"
										)}
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
										"transition-colors",
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
									{copied ? (
										<CheckIcon className="w-4 h-4 text-green-600" />
									) : (
										<DocumentDuplicateIcon className="w-4 h-4" />
									)}
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
					</div>
				</header>

				{/* Document Content */}
				<main className="px-6 py-8">
					<div
						ref={contentRef}
						className="max-w-4xl mx-auto"
					>
						{renderStructuredSections()}
					</div>
				</main>
			</div>
		</div>
	);
};