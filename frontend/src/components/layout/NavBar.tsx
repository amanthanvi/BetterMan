import React, { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
	CommandLineIcon,
	MagnifyingGlassIcon,
	HamburgerMenuIcon,
	Cross1Icon,
	SunIcon,
	MoonIcon,
	PersonIcon,
	ExitIcon,
	GearIcon,
	BookmarkIcon,
} from "@radix-ui/react-icons";

import { Button } from "@/components/ui/Button";
import { useAppStore } from "@/stores/appStore";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/utils/cn";

interface NavBarProps {
	onSearchClick: () => void;
}

export const NavBar: React.FC<NavBarProps> = ({ onSearchClick }) => {
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const [userMenuOpen, setUserMenuOpen] = useState(false);
	const location = useLocation();
	const { darkMode, toggleDarkMode } = useAppStore();
	const { user, signOut, loading } = useAuth();
	const userMenuRef = useRef<HTMLDivElement>(null);

	const toggleSidebar = () => setSidebarOpen(!sidebarOpen);

	// Close user menu when clicking outside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
				setUserMenuOpen(false);
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, []);

	// Close sidebar on route change
	useEffect(() => {
		setSidebarOpen(false);
	}, [location]);

	const navigation = [
		{ name: "Home", href: "/" },
		{ name: "Documentation", href: "/docs" },
		{ name: "Favorites", href: "/favorites" },
		{ name: "Analytics", href: "/analytics" },
		{ name: "Settings", href: "/settings" },
	];

	const isActive = (href: string) => {
		if (href === "/") {
			return location.pathname === "/";
		}
		return location.pathname.startsWith(href);
	};

	return (
		<nav
			className={cn(
				"sticky top-0 z-40 bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg",
				"border-b border-gray-200 dark:border-gray-700",
				"transition-all duration-200"
			)}
		>
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
				<div className="flex justify-between items-center h-16">
					{/* Left side */}
					<div className="flex items-center space-x-4">
						{/* Mobile menu button */}
						<button
							onClick={toggleSidebar}
							className="p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors lg:hidden"
						>
							<HamburgerMenuIcon className="w-5 h-5" />
						</button>

						{/* Logo */}
						<Link to="/" className="flex items-center space-x-2">
							<div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
								<CommandLineIcon className="w-5 h-5 text-white" />
							</div>
							<span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
								BetterMan
							</span>
						</Link>

						{/* Desktop navigation */}
						<div className="hidden lg:flex items-center space-x-1">
							{navigation.map((item) => (
								<Link
									key={item.name}
									to={item.href}
									className={cn(
										"px-3 py-2 rounded-lg text-sm font-medium transition-colors",
										isActive(item.href)
											? "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300"
											: "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800"
									)}
								>
									{item.name}
								</Link>
							))}
						</div>
					</div>

					{/* Center - Search */}
					<div className="flex-1 max-w-lg mx-4">
						<Button
							variant="ghost"
							onClick={onSearchClick}
							className="w-full justify-start text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
						>
							<MagnifyingGlassIcon className="w-4 h-4 mr-2" />
							Search documentation...
							<span className="ml-auto text-xs">⌘K</span>
						</Button>
					</div>

					{/* Right side */}
					<div className="flex items-center space-x-2">
						{/* Theme toggle */}
						<Button
							variant="ghost"
							size="sm"
							onClick={toggleDarkMode}
							className="p-2"
						>
							{darkMode ? (
								<SunIcon className="w-4 h-4" />
							) : (
								<MoonIcon className="w-4 h-4" />
							)}
						</Button>

						{/* User menu */}
						{loading ? (
							<div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
						) : user ? (
							<div className="relative" ref={userMenuRef}>
								<button
									onClick={() => setUserMenuOpen(!userMenuOpen)}
									className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-medium hover:shadow-lg transition-shadow"
								>
									{user.email?.charAt(0).toUpperCase() || "U"}
								</button>

								{/* User dropdown */}
								{userMenuOpen && (
									<div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1">
										<div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
											<p className="text-sm font-medium text-gray-900 dark:text-gray-100">
												{user.email}
											</p>
										</div>
										<Link
											to="/auth/profile"
											onClick={() => setUserMenuOpen(false)}
											className="flex items-center px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
										>
											<PersonIcon className="w-4 h-4 mr-2" />
											Profile
										</Link>
										<Link
											to="/favorites"
											onClick={() => setUserMenuOpen(false)}
											className="flex items-center px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
										>
											<BookmarkIcon className="w-4 h-4 mr-2" />
											Favorites
										</Link>
										<Link
											to="/settings"
											onClick={() => setUserMenuOpen(false)}
											className="flex items-center px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
										>
											<GearIcon className="w-4 h-4 mr-2" />
											Settings
										</Link>
										<button
											onClick={() => {
												signOut();
												setUserMenuOpen(false);
											}}
											className="flex items-center w-full px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
										>
											<ExitIcon className="w-4 h-4 mr-2" />
											Sign Out
										</button>
									</div>
								)}
							</div>
						) : (
							<div className="flex items-center space-x-2">
								<Link to="/auth/signin">
									<Button variant="ghost" size="sm">
										Sign In
									</Button>
								</Link>
								<Link to="/auth/signup">
									<Button size="sm">
										Get Started
									</Button>
								</Link>
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Mobile sidebar */}
			{sidebarOpen && (
				<div className="fixed inset-0 z-50 lg:hidden">
					{/* Backdrop */}
					<div
						className="fixed inset-0 bg-black/50 backdrop-blur-sm"
						onClick={toggleSidebar}
					/>

					{/* Sidebar */}
					<div className="relative flex w-full max-w-xs flex-col bg-white dark:bg-gray-900 shadow-xl">
						{/* Header */}
						<div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
							<Link to="/" className="flex items-center space-x-2" onClick={toggleSidebar}>
								<div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
									<CommandLineIcon className="w-5 h-5 text-white" />
								</div>
								<span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
									BetterMan
								</span>
							</Link>
							<button
								onClick={toggleSidebar}
								className="p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
							>
								<Cross1Icon className="w-5 h-5" />
							</button>
						</div>

						{/* Navigation */}
						<div className="flex-1 px-4 py-6 space-y-2">
							{navigation.map((item) => (
								<Link
									key={item.name}
									to={item.href}
									onClick={toggleSidebar}
									className={cn(
										"flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors",
										isActive(item.href)
											? "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300"
											: "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800"
									)}
								>
									{item.name}
								</Link>
							))}
						</div>

						{/* User section */}
						<div className="border-t border-gray-200 dark:border-gray-700 p-4">
							{user ? (
								<>
									<div className="flex items-center space-x-3 mb-4">
										<div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-medium">
											{user.email?.charAt(0).toUpperCase() || "U"}
										</div>
										<div className="flex-1 min-w-0">
											<p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
												{user.email}
											</p>
										</div>
									</div>
									<div className="space-y-2">
										<Link
											to="/auth/profile"
											onClick={toggleSidebar}
											className="flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
										>
											<PersonIcon className="w-4 h-4" />
											<span>Profile</span>
										</Link>
										<button
											onClick={() => {
												signOut();
												toggleSidebar();
											}}
											className="flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors w-full text-left"
										>
											<ExitIcon className="w-4 h-4" />
											<span>Sign Out</span>
										</button>
									</div>
								</>
							) : (
								<>
									<Link
										to="/auth/signin"
										onClick={toggleSidebar}
										className="flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
									>
										<PersonIcon className="w-4 h-4" />
										<span>Sign In</span>
									</Link>
									<Link
										to="/auth/signup"
										onClick={toggleSidebar}
										className="mt-2 block"
									>
										<Button variant="primary" className="w-full">
											Get Started
										</Button>
									</Link>
								</>
							)}
						</div>
					</div>
				</div>
			)}
		</nav>
	);
};