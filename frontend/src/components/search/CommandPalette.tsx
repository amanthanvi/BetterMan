import React, { useEffect, useState } from "react";
import { Command } from "cmdk";
import * as Dialog from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "framer-motion";
import {
	MagnifyingGlassIcon,
	FileTextIcon,
	ClockIcon,
	StarIcon,
	GearIcon,
	Cross2Icon,
} from "@radix-ui/react-icons";
import { useAppStore } from "@/stores/appStore";
import { useSearchStore } from "@/stores/searchStore";
import { useNavigate } from "react-router-dom";
import { cn } from "@/utils/cn";

interface CommandPaletteProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
	open,
	onOpenChange,
}) => {
	const navigate = useNavigate();
	const [inputValue, setInputValue] = useState("");

	const {
		recentDocs,
		favorites,
		searchHistory,
		toggleDarkMode,
		setSidebarOpen,
		isFavorite,
	} = useAppStore();

	const { performSearch, fetchSuggestions, suggestions, clearSuggestions } =
		useSearchStore();
	const { clearSearchHistory, clearRecentDocs } = useAppStore();

	// Recent searches from history
	const recentSearches = searchHistory.slice(0, 5);

	// Popular commands (these could come from analytics)
	const popularCommands = [
		{
			id: "ls",
			title: "ls",
			summary: "List directory contents",
			section: 1,
		},
		{
			id: "grep",
			title: "grep",
			summary: "Search text patterns",
			section: 1,
		},
		{ id: "find", title: "find", summary: "Search for files", section: 1 },
		{
			id: "cat",
			title: "cat",
			summary: "Display file contents",
			section: 1,
		},
		{ id: "vim", title: "vim", summary: "Text editor", section: 1 },
	];

	const handleSearch = async (query: string) => {
		if (query.trim()) {
			onOpenChange(false);
			await performSearch(query);
			navigate("/");
		}
	};

	const handleDocumentSelect = (docId: string) => {
		// Navigate using the docId directly (format: "name.section")
		navigate(`/docs/${docId}`);
		onOpenChange(false);
	};

	const handleCommand = (command: string) => {
		switch (command) {
			case "toggle-theme":
				toggleDarkMode();
				break;
			case "toggle-sidebar":
				setSidebarOpen(true);
				break;
			case "search":
				// Focus will already be on search
				break;
			default:
				// Handle document navigation
				if (command.startsWith("doc:")) {
					const docId = command.replace("doc:", "");
					handleDocumentSelect(docId);
				} else if (command.startsWith("search:")) {
					const query = command.replace("search:", "");
					handleSearch(query);
				}
		}
		onOpenChange(false);
	};

	// Fetch suggestions when input changes
	useEffect(() => {
		if (inputValue && !inputValue.startsWith(">")) {
			fetchSuggestions(inputValue);
		} else {
			clearSuggestions();
		}
	}, [inputValue, fetchSuggestions, clearSuggestions]);

	// Keyboard shortcuts
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "k") {
				e.preventDefault();
				onOpenChange(!open);
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [open, onOpenChange]);

	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			<Dialog.Portal>
				<Dialog.Overlay asChild>
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
					/>
				</Dialog.Overlay>

				<Dialog.Content asChild>
					<motion.div
						initial={{ opacity: 0, scale: 0.96, y: -20 }}
						animate={{ opacity: 1, scale: 1, y: 0 }}
						exit={{ opacity: 0, scale: 0.96, y: -20 }}
						className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-2xl mx-4 z-50"
					>
						<Dialog.Title className="sr-only">
							Command Palette
						</Dialog.Title>
						<Dialog.Description className="sr-only">
							Search documentation, run commands, or navigate to
							different pages
						</Dialog.Description>
						<Command
							className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
							shouldFilter={true}
							loop={true}
							filter={(value, search) => {
								if (
									value
										.toLowerCase()
										.includes(search.toLowerCase())
								)
									return 1;
								return 0;
							}}
						>
							<div className="flex items-center px-4 border-b border-gray-200 dark:border-gray-700">
								<MagnifyingGlassIcon className="w-5 h-5 text-gray-400 dark:text-gray-500" />
								<Command.Input
									value={inputValue}
									onValueChange={setInputValue}
									placeholder="Search documentation, commands, or type '>' for actions..."
									className="flex-1 bg-transparent border-0 outline-none px-3 py-4 text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:outline-none"
									autoFocus
								/>
								<button
									onClick={() => onOpenChange(false)}
									className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
								>
									<Cross2Icon className="w-4 h-4" />
								</button>
							</div>

							<Command.List className="max-h-96 overflow-y-auto p-2">
								<Command.Empty className="py-8 text-center text-gray-500 dark:text-gray-400">
									No results found.
								</Command.Empty>

								{/* Actions */}
								{inputValue.startsWith(">") && (
									<Command.Group heading="Actions">
										<CommandItem
											value=">toggle-theme"
											onSelect={() =>
												handleCommand("toggle-theme")
											}
											icon={
												<GearIcon className="w-4 h-4" />
											}
										>
											Toggle Dark Mode
										</CommandItem>
										<CommandItem
											value=">toggle-sidebar"
											onSelect={() =>
												handleCommand("toggle-sidebar")
											}
											icon={
												<FileTextIcon className="w-4 h-4" />
											}
										>
											Show Sidebar
										</CommandItem>

										<CommandItem
											value=">clear-recent-documents"
											onSelect={() => {
												clearRecentDocs();
												onOpenChange(false);
											}}
											icon={
												<Cross2Icon className="w-4 h-4" />
											}
										>
											Clear Recent Documents
										</CommandItem>
									</Command.Group>
								)}

								{/* Search suggestions */}
								{!inputValue.startsWith(">") && inputValue && (
									<Command.Group heading="Search">
										<CommandItem
											value={`search:${inputValue}`}
											onSelect={() =>
												handleSearch(inputValue)
											}
											icon={
												<MagnifyingGlassIcon className="w-4 h-4" />
											}
										>
											Search for "{inputValue}"
										</CommandItem>
										{suggestions.map(
											(suggestion, index) => (
												<CommandItem
													key={index}
													value={`suggestion:${suggestion}`}
													onSelect={() =>
														handleSearch(suggestion)
													}
													icon={
														<MagnifyingGlassIcon className="w-4 h-4" />
													}
												>
													{suggestion}
												</CommandItem>
											)
										)}
									</Command.Group>
								)}

								{/* Recent searches */}
								{!inputValue && recentSearches.length > 0 && (
									<Command.Group heading="Recent Searches">
										{recentSearches.map((query, index) => (
											<CommandItem
												key={index}
												value={`recent-search:${query}`}
												onSelect={() =>
													handleSearch(query)
												}
												icon={
													<ClockIcon className="w-4 h-4" />
												}
											>
												{query}
											</CommandItem>
										))}
									</Command.Group>
								)}

								{/* Recent documents */}
								{!inputValue && recentDocs.length > 0 && (
									<Command.Group heading="Recent Documents">
										{recentDocs.slice(0, 5).map((doc) => {
											const docName = doc.name || doc.id;
											const docId = `${docName}.${doc.section}`;
											return (
												<CommandItem
													key={doc.id}
													value={`doc:${docId}`}
													onSelect={() =>
														handleDocumentSelect(
															docId
														)
													}
													icon={
														<FileTextIcon className="w-4 h-4" />
													}
												>
													<div className="flex items-center justify-between w-full">
														<div>
															<div className="font-medium">
																{doc.title}
															</div>
															<div className="text-sm text-gray-500 dark:text-gray-400 truncate">
																{doc.summary}
															</div>
														</div>
														{isFavorite(doc.id) && (
															<StarIcon className="w-4 h-4 text-yellow-500" />
														)}
													</div>
												</CommandItem>
											);
										})}
									</Command.Group>
								)}

								{/* Popular commands */}
								{!inputValue && (
									<Command.Group heading="Popular Commands">
										{popularCommands.map((cmd) => {
											const cmdId = `${cmd.id}.${cmd.section}`;
											return (
												<CommandItem
													key={cmd.id}
													value={`doc:${cmdId}`}
													onSelect={() =>
														handleDocumentSelect(
															cmdId
														)
													}
													icon={
														<FileTextIcon className="w-4 h-4" />
													}
												>
													<div>
														<div className="font-medium font-mono">
															{cmd.title}
														</div>
														<div className="text-sm text-gray-500 dark:text-gray-400">
															{cmd.summary}
														</div>
													</div>
												</CommandItem>
											);
										})}
									</Command.Group>
								)}
							</Command.List>

							<div className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
								<div className="flex items-center justify-between">
									<div>
										Press ↑↓ to navigate, ↵ to select, esc
										to close
									</div>
									<div className="flex items-center space-x-2">
										<kbd className="px-1.5 py-0.5 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded">
											⌘K
										</kbd>
										<span>to open</span>
									</div>
								</div>
							</div>
						</Command>
					</motion.div>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
};

interface CommandItemProps {
	children: React.ReactNode;
	icon?: React.ReactNode;
	value: string;
	onSelect: () => void;
	className?: string;
}

const CommandItem: React.FC<CommandItemProps> = ({
	children,
	icon,
	value,
	onSelect,
	className,
}) => {
	return (
		<Command.Item
			value={value}
			onSelect={onSelect}
			className={cn(
				"flex items-center space-x-3 px-3 py-2 rounded-lg cursor-pointer",
				"text-gray-700 dark:text-gray-300",
				"hover:bg-gray-100 dark:hover:bg-gray-800",
				"aria-selected:bg-blue-50 aria-selected:text-blue-700",
				"dark:aria-selected:bg-blue-900/20 dark:aria-selected:text-blue-300",
				className
			)}
		>
			{icon}
			<div className="flex-1 min-w-0">{children}</div>
		</Command.Item>
	);
};
