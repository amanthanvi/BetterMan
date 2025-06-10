import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
	BookmarkIcon,
	Share1Icon,
	DownloadIcon,
	EyeOpenIcon,
	HamburgerMenuIcon,
	CopyIcon as DocumentDuplicateIcon,
	CheckIcon,
	ChevronRightIcon,
	ChevronDownIcon,
	MagnifyingGlassIcon,
} from "@radix-ui/react-icons";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";
import { useAppStore } from "@/stores/appStore";
import { cn } from "@/utils/cn";
import type { Document } from "@/types";
import { parseGroffSections, parseSectionName, groffToMarkdown } from "@/utils/groffParser";

interface DocumentViewerProps {
	document: Document;
	className?: string;
}

interface TableOfContentsItem {
	id: string;
	title: string;
	level: number;
	element?: HTMLElement;
	children?: TableOfContentsItem[];
}

export const EnhancedDocumentViewer: React.FC<DocumentViewerProps> = ({
	document: initialDocument,
	className,
}) => {
	const [document] = useState(initialDocument);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [tocCollapsed, setTocCollapsed] = useState(false);
	const [tocItems, setTocItems] = useState<TableOfContentsItem[]>([]);
	const [activeSection, setActiveSection] = useState<string>("");
	const [showLineNumbers, setShowLineNumbers] = useState(true);
	const [fontSize, setFontSize] = useState<"sm" | "base" | "lg">("base");
	const [copied, setCopied] = useState(false);
	const [scrollProgress, setScrollProgress] = useState(0);
	const [tocSearch, setTocSearch] = useState("");

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
		documentTocOpen: showToc,
		setDocumentTocOpen: setShowToc,
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

		// Parse sections with groff parser
		const parsedSections = parseGroffSections(document.sections);

		const items: TableOfContentsItem[] = [];
		parsedSections.forEach((section, sectionIndex) => {
			const sectionId = `section-${section.name.toLowerCase().replace(/\s+/g, "-")}`;
			const sectionItem: TableOfContentsItem = {
				id: sectionId,
				title: section.name,
				level: 2,
				children: []
			};

			if (section.subsections && section.subsections.length > 0) {
				section.subsections.forEach((sub, subIndex) => {
					const subId = `${sectionId}-sub-${subIndex}`;
					sectionItem.children?.push({
						id: subId,
						title: sub.name,
						level: 3,
					});
				});
			}
			
			items.push(sectionItem);
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
					const sortedSections = Array.from(visibleSections)
						.map(id => {
							const element = window.document.getElementById(id);
							if (!element) return null;
							return {
								id,
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
		const observeAllItems = (items: TableOfContentsItem[]) => {
			items.forEach((item) => {
				const element = window.document.getElementById(item.id);
				if (element) {
					observer.observe(element);
				}
				if (item.children) {
					observeAllItems(item.children);
				}
			});
		};

		observeAllItems(tocItems);
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

	// Handle keyboard shortcut events - must be after function definitions
	useEffect(() => {
		const handleToggleToc = () => setShowToc(!showToc);
		const handleToggleBookmark = () => toggleFavorite();

		window.addEventListener('toggleTocEvent', handleToggleToc);
		window.addEventListener('toggleBookmarkEvent', handleToggleBookmark);

		return () => {
			window.removeEventListener('toggleTocEvent', handleToggleToc);
			window.removeEventListener('toggleBookmarkEvent', handleToggleBookmark);
		};
	}, [showToc, toggleFavorite]);

	// Filter TOC items based on search
	const filterTocItems = (items: TableOfContentsItem[], search: string): TableOfContentsItem[] => {
		if (!search) return items;
		
		const searchLower = search.toLowerCase();
		return items.filter(item => {
			const matchesSearch = item.title.toLowerCase().includes(searchLower);
			const hasMatchingChildren = item.children?.some(child => 
				child.title.toLowerCase().includes(searchLower)
			);
			return matchesSearch || hasMatchingChildren;
		});
	};

	// Render TOC item
	const renderTocItem = (item: TableOfContentsItem, isChild = false) => {
		const isActive = item.id === activeSection;
		const hasChildren = item.children && item.children.length > 0;
		const filteredChildren = hasChildren ? filterTocItems(item.children!, tocSearch) : [];
		
		return (
			<div key={item.id} className={cn(isChild && "ml-4")}>
				<button
					onClick={() => scrollToSection(item.id)}
					className={cn(
						"relative block w-full text-left py-2 px-4 rounded-lg transition-all duration-200",
						"hover:bg-gray-100 dark:hover:bg-gray-800",
						isChild && "text-sm",
						isActive
							? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 font-medium"
							: "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
					)}
				>
					<span className={cn("flex items-center gap-2")}>
						{isActive && (
							<motion.span 
								layoutId="active-indicator"
								className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-blue-500 rounded-r"
								transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
							/>
						)}
						<span className={cn(isActive && "pl-2")}>{item.title}</span>
					</span>
				</button>
				{hasChildren && filteredChildren.length > 0 && (
					<div className="mt-1">
						{filteredChildren.map(child => renderTocItem(child, true))}
					</div>
				)}
			</div>
		);
	};

	// Render structured sections with enhanced visual design
	const renderStructuredSections = () => {
		if (!document.sections || document.sections.length === 0) {
			return <div className="text-center py-8 text-gray-500 dark:text-gray-400">
				No content available
			</div>;
		}

		// Parse sections with groff parser and convert to markdown
		const parsedSections = parseGroffSections(document.sections, { convertToMarkdown: true });
		
		// Special handling for different section types
		const renderSectionContent = (section: any, sectionName: string) => {
			const upperName = sectionName.toUpperCase();
			
			// OPTIONS section - render as cards
			if (upperName === 'OPTIONS' || upperName === 'FLAGS') {
				return renderOptionsSection(section.content);
			}
			
			// EXAMPLES section - render as code blocks
			if (upperName === 'EXAMPLES' || upperName === 'EXAMPLE') {
				return renderExamplesSection(section.content);
			}
			
			// SYNOPSIS section - special formatting
			if (upperName === 'SYNOPSIS') {
				return renderSynopsisSection(section.content);
			}
			
			// Default markdown rendering
			return (
				<MarkdownRenderer 
					content={section.content}
					darkMode={darkMode}
					fontSize={fontSize}
				/>
			);
		};
		
		return parsedSections.map((section, sectionIndex) => {
			const sectionId = `section-${section.name.toLowerCase().replace(/\s+/g, "-")}`;
			
			return (
				<section 
					key={sectionIndex} 
					className="mb-16 animate-fadeIn"
					style={{ animationDelay: `${sectionIndex * 50}ms` }}
				>
					<h2
						id={sectionId}
						className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 pb-3 border-b-2 border-blue-500 dark:border-blue-400 scroll-mt-28 flex items-center gap-3"
					>
						<span className="text-blue-500 dark:text-blue-400">#</span>
						{section.name}
					</h2>
					<div className="space-y-4">
						{renderSectionContent(section, section.name)}
					</div>
					
					{section.subsections && section.subsections.map((subsection, subIndex) => {
						const subId = `${sectionId}-sub-${subIndex}`;
						return (
							<div key={subIndex} className="mt-8 pl-6 border-l-2 border-gray-200 dark:border-gray-700">
								<h3
									id={subId}
									className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4 scroll-mt-28"
								>
									{subsection.name}
								</h3>
								<div className="space-y-4">
									{renderSectionContent(subsection, subsection.name)}
								</div>
							</div>
						);
					})}
				</section>
			);
		});
	};

	// Render OPTIONS section as cards
	const renderOptionsSection = (content: string) => {
		const options = content.split('\n').filter(line => line.trim());
		const optionGroups: Array<{ flag: string; description: string }> = [];
		
		let currentOption = { flag: '', description: '' };
		
		options.forEach((line) => {
			// Check if this line starts with a dash (new option)
			if (line.match(/^\s*-/)) {
				if (currentOption.flag) {
					optionGroups.push(currentOption);
				}
				const match = line.match(/^(\s*-[\w-]+(?:,\s*--[\w-]+)?)\s*(.*)$/);
				if (match) {
					currentOption = { flag: match[1].trim(), description: match[2] };
				}
			} else if (currentOption.flag) {
				// Continuation of description
				currentOption.description += ' ' + line.trim();
			}
		});
		
		if (currentOption.flag) {
			optionGroups.push(currentOption);
		}
		
		return (
			<div className="grid gap-3">
				{optionGroups.map((option, idx) => (
					<div 
						key={idx}
						className="group p-4 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200 border border-transparent hover:border-blue-500 dark:hover:border-blue-400"
					>
						<div className="flex flex-col sm:flex-row sm:items-start gap-3">
							<code className="inline-flex items-center px-3 py-1 rounded-md bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-mono text-sm whitespace-nowrap">
								{option.flag}
							</code>
							<p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed flex-1">
								{option.description || 'No description available'}
							</p>
						</div>
					</div>
				))}
			</div>
		);
	};
	
	// Render EXAMPLES section with syntax highlighting
	const renderExamplesSection = (content: string) => {
		const lines = content.split('\n');
		const examples: Array<{ description: string; code: string }> = [];
		let currentExample = { description: '', code: '' };
		let inCodeBlock = false;
		
		lines.forEach((line) => {
			// Detect code lines (usually start with $ or are indented)
			if (line.match(/^\s*\$/) || (line.match(/^\s{4,}/) && line.trim())) {
				inCodeBlock = true;
				currentExample.code += line + '\n';
			} else if (inCodeBlock && line.trim() === '') {
				// Empty line might end code block
				currentExample.code += line + '\n';
			} else {
				// Description line
				if (inCodeBlock && currentExample.code) {
					examples.push({ ...currentExample });
					currentExample = { description: line.trim(), code: '' };
					inCodeBlock = false;
				} else {
					currentExample.description += (currentExample.description ? ' ' : '') + line.trim();
				}
			}
		});
		
		if (currentExample.code || currentExample.description) {
			examples.push(currentExample);
		}
		
		return (
			<div className="space-y-6">
				{examples.map((example, idx) => (
					<div key={idx} className="space-y-2">
						{example.description && (
							<p className="text-gray-700 dark:text-gray-300 text-sm">
								{example.description}
							</p>
						)}
						{example.code && (
							<pre className="p-4 rounded-lg bg-gray-900 dark:bg-black text-gray-100 overflow-x-auto">
								<code className="text-sm font-mono">{example.code.trim()}</code>
							</pre>
						)}
					</div>
				))}
			</div>
		);
	};
	
	// Render SYNOPSIS section with special formatting
	const renderSynopsisSection = (content: string) => {
		return (
			<div className="p-6 rounded-lg bg-gray-900 dark:bg-black border border-gray-700 dark:border-gray-600">
				<pre className="text-gray-100 overflow-x-auto">
					<code className="font-mono text-sm leading-relaxed whitespace-pre-wrap">
						{content.trim()}
					</code>
				</pre>
			</div>
		);
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

			{/* Table of Contents - Modern Sidebar */}
			<aside
				className={cn(
					"fixed left-0 z-40 flex flex-col",
					"w-80 bg-white dark:bg-gray-900",
					"border-r border-gray-200 dark:border-gray-800",
					"shadow-xl"
				)}
				style={{ 
					top: "64px", 
					bottom: 0,
					height: "calc(100vh - 64px)",
					transform: showToc ? "translateX(0)" : "translateX(-100%)",
					transition: "transform 300ms cubic-bezier(0.4, 0, 0.2, 1)"
				}}
			>
						{/* TOC Header */}
						<div className="flex-shrink-0 p-6 border-b border-gray-200 dark:border-gray-800">
							<div className="flex items-center justify-between mb-4">
								<h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100 flex items-center gap-2">
									<ChevronRightIcon className="w-5 h-5" />
									Table of Contents
								</h3>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => setTocCollapsed(!tocCollapsed)}
									className="p-1"
								>
									<motion.div
										animate={{ rotate: tocCollapsed ? -90 : 0 }}
										transition={{ duration: 0.2 }}
									>
										<ChevronDownIcon className="w-5 h-5" />
									</motion.div>
								</Button>
							</div>
							
							{/* TOC Search */}
							<div className="relative">
								<MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
								<Input
									type="text"
									placeholder="Search sections..."
									value={tocSearch}
									onChange={(e) => setTocSearch(e.target.value)}
									className="pl-10 pr-4 py-2 w-full text-sm"
								/>
							</div>
						</div>
						
						{/* TOC Content */}
						<div 
							className={cn(
								"flex-1 overflow-y-auto transition-all duration-300",
								tocCollapsed ? "opacity-0" : "opacity-100"
							)}
							style={{ 
								display: tocCollapsed ? 'none' : 'block'
							}}
						>
							<nav className="p-6 space-y-1">
								{filterTocItems(tocItems, tocSearch).map(item => renderTocItem(item))}
							</nav>
						</div>
				</aside>
			
			{/* Main Content Area */}
			<div 
				className={cn(
					"flex-1 w-full",
					showToc ? "pl-80" : "pl-0"
				)}
				style={{
					transition: "padding-left 300ms cubic-bezier(0.4, 0, 0.2, 1)"
				}}
			>
				{/* Document Header */}
				<header className="sticky top-16 z-30 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 shadow-sm">
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
									{document.section && document.section !== "json" && (
										<span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">
											Section {document.section}
										</span>
									)}
									{document.doc_set && (
										<>
											{document.section && document.section !== "json" && <span>•</span>}
											<span className="capitalize">{document.doc_set}</span>
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
					
					{/* Progress bar */}
					<motion.div 
						className="absolute bottom-0 left-0 right-0 h-1 bg-gray-200 dark:bg-gray-800"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ delay: 0.2 }}
					>
						<motion.div 
							className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
							initial={{ width: "0%" }}
							animate={{ width: `${scrollProgress}%` }}
							transition={{ duration: 0.1 }}
						/>
					</motion.div>
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