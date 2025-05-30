import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
	MagnifyingGlassIcon,
	StarIcon,
	ReaderIcon,
	HomeIcon,
	GearIcon,
	BarChartIcon,
	ExitIcon,
	EnterIcon,
} from "@radix-ui/react-icons";
import { useNavigate } from "react-router-dom";

interface Command {
	id: string;
	title: string;
	subtitle?: string;
	icon: React.ReactNode;
	action: () => void;
	keywords: string[];
	category: string;
}

interface CommandPaletteProps {
	isOpen: boolean;
	onClose: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
	isOpen,
	onClose,
}) => {
	const [query, setQuery] = useState("");
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [filteredCommands, setFilteredCommands] = useState<Command[]>([]);
	const inputRef = useRef<HTMLInputElement>(null);
	const navigate = useNavigate();

	const commands: Command[] = [
		{
			id: "search",
			title: "Search Documentation",
			subtitle: "Find man pages and documentation",
			icon: <MagnifyingGlassIcon className="w-4 h-4" />,
			action: () => {
				navigate("/");
				onClose();
			},
			keywords: ["search", "find", "docs", "man", "documentation"],
			category: "Navigation",
		},
		{
			id: "home",
			title: "Go to Home",
			subtitle: "Return to the main page",
			icon: <HomeIcon className="w-4 h-4" />,
			action: () => {
				navigate("/");
				onClose();
			},
			keywords: ["home", "main", "start"],
			category: "Navigation",
		},
		{
			id: "analytics",
			title: "View Analytics",
			subtitle: "See usage statistics and insights",
			icon: <BarChartIcon className="w-4 h-4" />,
			action: () => {
				navigate("/analytics");
				onClose();
			},
			keywords: ["analytics", "stats", "metrics", "insights"],
			category: "Navigation",
		},
		{
			id: "favorites",
			title: "View Favorites",
			subtitle: "See your bookmarked documentation",
			icon: <StarIcon className="w-4 h-4" />,
			action: () => {
				navigate("/favorites");
				onClose();
			},
			keywords: ["favorites", "bookmarks", "saved"],
			category: "Navigation",
		},
		{
			id: "settings",
			title: "Settings",
			subtitle: "Configure your preferences",
			icon: <GearIcon className="w-4 h-4" />,
			action: () => {
				navigate("/settings");
				onClose();
			},
			keywords: ["settings", "preferences", "config"],
			category: "Navigation",
		},
		{
			id: "search-ls",
			title: "Search: ls",
			subtitle: "List directory contents",
			icon: <ReaderIcon className="w-4 h-4" />,
			action: () => {
				navigate("/docs/ls");
				onClose();
			},
			keywords: ["ls", "list", "directory", "files"],
			category: "Commands",
		},
		{
			id: "search-grep",
			title: "Search: grep",
			subtitle: "Search text patterns",
			icon: <ReaderIcon className="w-4 h-4" />,
			action: () => {
				navigate("/docs/grep");
				onClose();
			},
			keywords: ["grep", "search", "pattern", "text"],
			category: "Commands",
		},
		{
			id: "search-find",
			title: "Search: find",
			subtitle: "Search for files and directories",
			icon: <ReaderIcon className="w-4 h-4" />,
			action: () => {
				navigate("/docs/find");
				onClose();
			},
			keywords: ["find", "locate", "search", "files"],
			category: "Commands",
		},
		{
			id: "search-git",
			title: "Search: git",
			subtitle: "Version control system",
			icon: <ReaderIcon className="w-4 h-4" />,
			action: () => {
				navigate("/docs/git");
				onClose();
			},
			keywords: ["git", "version", "control", "vcs"],
			category: "Commands",
		},
		{
			id: "search-docker",
			title: "Search: docker",
			subtitle: "Container platform",
			icon: <ReaderIcon className="w-4 h-4" />,
			action: () => {
				navigate("/docs/docker");
				onClose();
			},
			keywords: ["docker", "container", "virtualization"],
			category: "Commands",
		},
		{
			id: "toggle-dark-mode",
			title: "Toggle Dark Mode",
			subtitle: "Switch between light and dark themes",
			icon: <GearIcon className="w-4 h-4" />,
			action: () => {
				// This would toggle dark mode
				document.documentElement.classList.toggle("dark");
				onClose();
			},
			keywords: ["dark", "light", "theme", "mode"],
			category: "Settings",
		},
		{
			id: "close-palette",
			title: "Close Command Palette",
			subtitle: "Exit this dialog",
			icon: <ExitIcon className="w-4 h-4" />,
			action: onClose,
			keywords: ["close", "exit", "cancel"],
			category: "Actions",
		},
	];

	useEffect(() => {
		if (isOpen && inputRef.current) {
			inputRef.current.focus();
		}
	}, [isOpen]);

	useEffect(() => {
		if (!query.trim()) {
			setFilteredCommands(commands);
			setSelectedIndex(0);
			return;
		}

		const filtered = commands.filter((command) => {
			const searchText = query.toLowerCase();
			return (
				command.title.toLowerCase().includes(searchText) ||
				command.subtitle?.toLowerCase().includes(searchText) ||
				command.keywords.some((keyword) =>
					keyword.toLowerCase().includes(searchText)
				)
			);
		});

		setFilteredCommands(filtered);
		setSelectedIndex(0);
	}, [query]);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (!isOpen) return;

			switch (e.key) {
				case "ArrowDown":
					e.preventDefault();
					setSelectedIndex((prev) =>
						Math.min(prev + 1, filteredCommands.length - 1)
					);
					break;
				case "ArrowUp":
					e.preventDefault();
					setSelectedIndex((prev) => Math.max(prev - 1, 0));
					break;
				case "Enter":
					e.preventDefault();
					if (filteredCommands[selectedIndex]) {
						filteredCommands[selectedIndex].action();
					}
					break;
				case "Escape":
					e.preventDefault();
					onClose();
					break;
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, filteredCommands, selectedIndex, onClose]);

	const groupedCommands = filteredCommands.reduce((groups, command) => {
		const category = command.category;
		if (!groups[category]) {
			groups[category] = [];
		}
		groups[category].push(command);
		return groups;
	}, {} as Record<string, Command[]>);

	if (!isOpen) return null;

	return (
		<AnimatePresence>
			<div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
				{/* Backdrop */}
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					className="absolute inset-0 bg-black/50 backdrop-blur-sm"
					onClick={onClose}
				/>

				{/* Command Palette */}
				<motion.div
					initial={{ opacity: 0, scale: 0.95, y: -20 }}
					animate={{ opacity: 1, scale: 1, y: 0 }}
					exit={{ opacity: 0, scale: 0.95, y: -20 }}
					className="relative w-full max-w-2xl mx-4 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
				>
					{/* Search Input */}
					<div className="flex items-center p-4 border-b border-gray-200 dark:border-gray-700">
						<MagnifyingGlassIcon className="w-5 h-5 text-gray-400 mr-3" />
						<input
							ref={inputRef}
							type="text"
							placeholder="Type a command or search..."
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							className="flex-1 bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:outline-none text-lg"
						/>
						<div className="flex items-center space-x-2 text-xs text-gray-500">
							<kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">
								↑↓
							</kbd>
							<span>to navigate</span>
							<kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">
								↵
							</kbd>
							<span>to select</span>
							<kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">
								ESC
							</kbd>
							<span>to close</span>
						</div>
					</div>

					{/* Results */}
					<div className="max-h-96 overflow-y-auto">
						{filteredCommands.length === 0 ? (
							<div className="p-8 text-center text-gray-500 dark:text-gray-400">
								<MagnifyingGlassIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
								<p className="text-lg font-medium mb-1">
									No results found
								</p>
								<p className="text-sm">
									Try searching for something else or browse
									commands above
								</p>
							</div>
						) : (
							<div className="p-2">
								{Object.entries(groupedCommands).map(
									([category, commands]) => (
										<div
											key={category}
											className="mb-4 last:mb-0"
										>
											<div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
												{category}
											</div>
											<div className="space-y-1">
												{commands.map(
													(command, index) => {
														const globalIndex =
															filteredCommands.indexOf(
																command
															);
														const isSelected =
															globalIndex ===
															selectedIndex;

														return (
															<motion.button
																key={command.id}
																initial={{
																	opacity: 0,
																	y: 10,
																}}
																animate={{
																	opacity: 1,
																	y: 0,
																}}
																transition={{
																	delay:
																		index *
																		0.02,
																}}
																onClick={
																	command.action
																}
																className={`w-full flex items-center p-3 rounded-lg text-left transition-colors ${
																	isSelected
																		? "bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100"
																		: "hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100"
																}`}
															>
																<div
																	className={`flex items-center justify-center w-8 h-8 rounded-md mr-3 ${
																		isSelected
																			? "bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-300"
																			: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
																	}`}
																>
																	{
																		command.icon
																	}
																</div>
																<div className="flex-1 min-w-0">
																	<div className="font-medium truncate">
																		{
																			command.title
																		}
																	</div>
																	{command.subtitle && (
																		<div className="text-sm text-gray-500 dark:text-gray-400 truncate">
																			{
																				command.subtitle
																			}
																		</div>
																	)}
																</div>
																{isSelected && (
																	<EnterIcon className="w-4 h-4 text-gray-400 ml-2" />
																)}
															</motion.button>
														);
													}
												)}
											</div>
										</div>
									)
								)}
							</div>
						)}
					</div>
				</motion.div>
			</div>
		</AnimatePresence>
	);
};
