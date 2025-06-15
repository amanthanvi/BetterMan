import React, { useState, useEffect } from "react";
import {
	Cross2Icon,
	MagnifyingGlassIcon,
	CodeIcon,
	LightningBoltIcon,
	KeyboardIcon,
} from "@radix-ui/react-icons";
import { useNavigate } from "react-router-dom";
import { InstantSearchInterface } from "./InstantSearchInterface";
import { EnhancedCommandPalette } from "../EnhancedCommandPalette";
import { useAppStore } from "@/stores/appStore";
import { cn } from "@/utils/cn";

interface MagicalSearchModalProps {
	isOpen: boolean;
	onClose: () => void;
}

export const MagicalSearchModal: React.FC<MagicalSearchModalProps> = ({
	isOpen,
	onClose,
}) => {
	const [mode, setMode] = useState<"instant" | "commands">("instant");
	const navigate = useNavigate();
	const { addToast } = useAppStore();

	// Reset on open
	useEffect(() => {
		if (isOpen) {
			setMode("instant");
		}
	}, [isOpen]);

	// Handle escape key
	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape" && isOpen) {
				onClose();
			}
		};

		document.addEventListener("keydown", handleEscape);
		return () => document.removeEventListener("keydown", handleEscape);
	}, [isOpen, onClose]);

	// Show tips on first open
	useEffect(() => {
		if (isOpen) {
			const hasSeenTips = localStorage.getItem("magicalSearchTips");
			if (!hasSeenTips) {
				setTimeout(() => {
					addToast(
						"💡 Tip: Use ! for shortcuts, ask questions in plain English, or press Tab to switch modes",
						"info"
					);
					localStorage.setItem("magicalSearchTips", "true");
				}, 500);
			}
		}
	}, [isOpen, addToast]);

	return (
		<>
			{isOpen && (
				<>
					{/* Backdrop */}
					<div
						onClick={onClose}
						className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
					/>

					{/* Modal */}
					<div}
						className="fixed inset-x-0 top-[8%] mx-auto max-w-4xl z-50 px-4"
					>
						<div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
							{/* Gradient Border Effect */}
							<div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 opacity-20 blur-xl" />

							<div className="relative bg-white dark:bg-gray-800 rounded-2xl">
								{/* Header */}
								<div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
									<div className="flex items-center space-x-4">
										<div className="flex items-center space-x-2">
											<div className="p-2 bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg">
												<MagnifyingGlassIcon className="w-5 h-5 text-white" />
											</div>
											<div>
												<h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
													Magical Search
												</h2>
												<p className="text-xs text-gray-500 dark:text-gray-400">
													Search smarter, not harder
												</p>
											</div>
										</div>

										{/* Mode Switcher */}
										<div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
											<button
												onClick={() =>
													setMode("instant")
												}
												className={cn(
													"flex items-center space-x-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
													mode === "instant"
														? "bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm"
														: "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
												)}
											>
												<LightningBoltIcon className="w-4 h-4" />
												<span>Instant</span>
											</button>
											<button
												onClick={() =>
													setMode("commands")
												}
												className={cn(
													"flex items-center space-x-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
													mode === "commands"
														? "bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm"
														: "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
												)}
											>
												<CodeIcon className="w-4 h-4" />
												<span>Commands</span>
											</button>
										</div>
									</div>

									<button
										onClick={onClose}
										className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
									>
										<Cross2Icon className="w-5 h-5" />
									</button>
								</div>

								{/* Content */}
								<div className="p-6">
									{mode === "instant" ? (
										<>
											<InstantSearchInterface
												onClose={onClose}
												autoFocus
												placeholder="Search docs, use ! for shortcuts, or ask me anything..."
											/>

											{/* Quick Tips */}
											<div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
												<QuickTip
													icon="!"
													title="Shortcuts"
													description="Type !ls to go directly to ls docs"
													example="!git"
												/>
												<QuickTip
													icon="?"
													title="Natural Language"
													description="Ask questions in plain English"
													example="how to list files"
												/>
												<QuickTip
													icon="~"
													title="Fuzzy Search"
													description="We'll fix your typos automatically"
													example="grpe → grep"
												/>
											</div>
										</>
									) : (
										<EnhancedCommandPalette
											isOpen={true}
											onClose={onClose}
										/>
									)}
								</div>

								{/* Footer */}
								<div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
									<div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
										<div className="flex items-center space-x-4">
											<span className="flex items-center space-x-1">
												<KeyboardIcon className="w-3 h-3" />
												<span>Tab to switch modes</span>
											</span>
											<span>ESC to close</span>
										</div>
										<div className="flex items-center space-x-2"></div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</>
			)}
		</>
	);
};

// Quick tip component
const QuickTip: React.FC<{
	icon: string;
	title: string;
	description: string;
	example: string;
}> = ({ icon, title, description, example }) => (
	<div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
		<div className="flex items-start space-x-3">
			<div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg flex items-center justify-center text-white font-bold">
				{icon}
			</div>
			<div className="flex-1 min-w-0">
				<h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
					{title}
				</h4>
				<p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
					{description}
				</p>
				<code className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded mt-1 inline-block">
					{example}
				</code>
			</div>
		</div>
	</div>
);
