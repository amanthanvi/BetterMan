import React from "react";
import { motion } from "framer-motion";
import { Link, useLocation } from "react-router-dom";
import {
	MagnifyingGlassIcon,
	HomeIcon,
	BookmarkIcon,
	GearIcon,
	HamburgerMenuIcon,
	CodeIcon,
} from "@radix-ui/react-icons";
import { Button } from "@/components/ui/Button";
import { useAppStore } from "@/stores/appStore";

import { useSearchStore } from "@/stores/searchStore";
import { cn } from "@/utils/cn";

interface NavBarProps {
	className?: string;
	onSearchClick?: () => void;
}

export const NavBar: React.FC<NavBarProps> = ({ className, onSearchClick }) => {
	const location = useLocation();
	const {
		sidebarOpen,
		toggleSidebar,
		setCommandPaletteOpen,
	} = useAppStore();

	const { clearResults } = useSearchStore();

	const navigation = [
		{ name: "Favorites", href: "/favorites", icon: BookmarkIcon },
		{ name: "Settings", href: "/settings", icon: GearIcon },
	];

	const isActive = (href: string) => {
		if (href === "/") {
			return location.pathname === "/";
		}
		return location.pathname.startsWith(href);
	};


	return (
		<motion.nav
			initial={{ y: -100 }}
			animate={{ y: 0 }}
			className={cn(
				"sticky top-0 z-40 bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg",
				"border-b border-gray-200 dark:border-gray-700",
				className
			)}
		>
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
				<div className="flex items-center justify-between h-16">
					{/* Left section */}
					<div className="flex items-center space-x-4">
						{/* Mobile menu button */}
						<Button
							variant="ghost"
							size="icon"
							onClick={toggleSidebar}
							className="md:hidden"
						>
							<HamburgerMenuIcon className="w-5 h-5" />
						</Button>

						{/* Logo */}
						<Link
							to="/"
							onClick={clearResults}
							className="flex items-center space-x-3"
						>
							<div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
								<CodeIcon className="w-5 h-5 text-white" />
							</div>
							<div className="hidden sm:block">
								<h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
									BetterMan
								</h1>
								<p className="text-xs text-gray-500 dark:text-gray-400 -mt-1">
									Documentation Platform
								</p>
							</div>
						</Link>
					</div>

					{/* Center section - Search trigger */}
					<div className="flex-1 max-w-2xl mx-8">
						<Button
							variant="outline"
							onClick={() => onSearchClick ? onSearchClick() : setCommandPaletteOpen(true)}
							className="w-full justify-start text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
						>
							<MagnifyingGlassIcon className="w-4 h-4 mr-3" />
							<span className="flex-1 text-left">
								Search documentation...
							</span>
							<kbd className="hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-1.5 font-mono text-xs text-gray-500 dark:text-gray-400">
								⌘K
							</kbd>
						</Button>
					</div>

					{/* Right section */}
					<div className="flex items-center space-x-2">
						{/* Navigation links - hidden on mobile */}
						<div className="hidden md:flex items-center space-x-1">
							{navigation.map((item) => {
								const Icon = item.icon;
								return (
									<Link
										key={item.name}
										to={item.href}
										onClick={
											item.href === "/"
												? clearResults
												: undefined
										}
										className={cn(
											"flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
											isActive(item.href)
												? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
												: "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
										)}
									>
										<Icon className="w-4 h-4" />
										<span>{item.name}</span>
									</Link>
								);
							})}
						</div>

						{/* Theme toggle hidden - dark mode is always on */}
					</div>
				</div>
			</div>

			{/* Mobile navigation */}
			{sidebarOpen && (
				<motion.div
					initial={{ height: 0, opacity: 0 }}
					animate={{ height: "auto", opacity: 1 }}
					exit={{ height: 0, opacity: 0 }}
					className="md:hidden border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
				>
					<div className="px-4 py-3 space-y-1">
						{navigation.map((item) => {
							const Icon = item.icon;
							return (
								<Link
									key={item.name}
									to={item.href}
									onClick={() => {
										toggleSidebar();
										if (item.href === "/") clearResults();
									}}
									className={cn(
										"flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
										isActive(item.href)
											? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
											: "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
									)}
								>
									<Icon className="w-4 h-4" />
									<span>{item.name}</span>
								</Link>
							);
						})}
					</div>
				</motion.div>
			)}
		</motion.nav>
	);
};
