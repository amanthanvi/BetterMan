import React from "react";
import toast from "react-hot-toast";
import {
	GearIcon,
	SunIcon,
	MoonIcon,
	DesktopIcon,
	EyeOpenIcon,
	KeyboardIcon,
	TrashIcon,
	PersonIcon,
	ReloadIcon,
} from "@radix-ui/react-icons";
import { Button } from "@/components/ui/Button";
import { useAppStore } from "@/stores/appStore";
import { cn } from "@/utils/cn";
import { clearAllCaches } from "@/utils/clearCache";
export const SettingsPage: React.FC = () => {
	const {
		preferences,
		updatePreferences,
		resetPreferences,
		searchHistory,
		clearSearchHistory,
		favorites,
		recentDocs,
		clearRecentDocs,
	} = useAppStore();
	const handleFontSizeChange = (fontSize: "small" | "medium" | "large") => {
		updatePreferences({ fontSize });

		// Apply font size to root element
		const root = document.documentElement;
		if (fontSize === "small") {
			root.style.fontSize = "14px";
		} else if (fontSize === "large") {
			root.style.fontSize = "18px";
		} else {
			root.style.fontSize = "16px";
		}

		toast.success(`Font size changed to ${fontSize}`);
	};

	const handleFontFamilyChange = (
		fontFamily: "system" | "mono" | "serif"
	) => {
		updatePreferences({ fontFamily });

		// Apply font family to body element
		const body = document.body;
		if (fontFamily === "mono") {
			body.style.fontFamily = "ui-monospace, monospace";
		} else if (fontFamily === "serif") {
			body.style.fontFamily = "ui-serif, serif";
		} else {
			body.style.fontFamily = "system-ui, -apple-system, sans-serif";
		}

		toast.success(`Font family changed to ${fontFamily}`);
	};

	const handleClearSearchHistory = () => {
		clearSearchHistory();
		toast.success("Search history cleared");
	};

	const handleClearRecentDocs = () => {
		clearRecentDocs();
		toast.success("Recent documents cleared");
	};

	const handleResetSettings = () => {
		resetPreferences();
		toast.success("Settings reset to defaults");
	};

	const handleExportData = () => {
		const data = {
			preferences,
			favorites,
			searchHistory,
			recentDocs,
			exportDate: new Date().toISOString(),
		};

		const blob = new Blob([JSON.stringify(data, null, 2)], {
			type: "application/json",
		});

		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `betterman-data-${
			new Date().toISOString().split("T")[0]
		}.json`;
		a.click();

		URL.revokeObjectURL(url);
		toast.success("Data exported successfully");
	};

	return (
		<div}}
			className="min-h-screen bg-gray-50 dark:bg-gray-900 pt-8"
		>
			<div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
				{/* Header */}
				<div className="mb-8">
					<div className="flex items-center space-x-3 mb-4">
						<GearIcon className="w-8 h-8 text-blue-500" />
						<h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
							Settings
						</h1>
					</div>
					<p className="text-gray-600 dark:text-gray-400">
						Customize your BetterMan experience
					</p>
				</div>

				<div className="space-y-8">
					{/* Appearance */}
					<SettingsSection
						title="Appearance"
						description="Customize the look and feel"
						icon={<EyeOpenIcon className="w-5 h-5" />}
					>
						{/* Theme settings hidden - dark mode is always on */}

						{/* Font Size */}
						<SettingItem
							label="Font Size"
							description="Adjust text size for better readability"
						>
							<div className="flex space-x-2">
								<Button
									variant={
										preferences.fontSize === "small"
											? "primary"
											: "outline"
									}
									size="sm"
									onClick={() =>
										handleFontSizeChange("small")
									}
								>
									Small
								</Button>
								<Button
									variant={
										preferences.fontSize === "medium"
											? "primary"
											: "outline"
									}
									size="sm"
									onClick={() =>
										handleFontSizeChange("medium")
									}
								>
									Medium
								</Button>
								<Button
									variant={
										preferences.fontSize === "large"
											? "primary"
											: "outline"
									}
									size="sm"
									onClick={() =>
										handleFontSizeChange("large")
									}
								>
									Large
								</Button>
							</div>
						</SettingItem>

						{/* Font Family */}
						<SettingItem
							label="Font Family"
							description="Choose your preferred font for documentation"
						>
							<div className="flex space-x-2">
								<Button
									variant={
										preferences.fontFamily === "system"
											? "primary"
											: "outline"
									}
									size="sm"
									onClick={() =>
										handleFontFamilyChange("system")
									}
								>
									System
								</Button>
								<Button
									variant={
										preferences.fontFamily === "mono"
											? "primary"
											: "outline"
									}
									size="sm"
									onClick={() =>
										handleFontFamilyChange("mono")
									}
									className="font-mono"
								>
									Monospace
								</Button>
								<Button
									variant={
										preferences.fontFamily === "serif"
											? "primary"
											: "outline"
									}
									size="sm"
									onClick={() =>
										handleFontFamilyChange("serif")
									}
									className="font-serif"
								>
									Serif
								</Button>
							</div>
						</SettingItem>

						{/* Compact Mode */}
						<SettingItem
							label="Compact Mode"
							description="Use less spacing for more content"
						>
							<Button
								variant={
									preferences.compactMode
										? "primary"
										: "outline"
								}
								size="sm"
								onClick={() => {
									updatePreferences({
										compactMode: !preferences.compactMode,
									});
									toast.success(
										`Compact mode ${
											!preferences.compactMode
												? "enabled"
												: "disabled"
										}`
									);
								}}
							>
								{preferences.compactMode
									? "Enabled"
									: "Disabled"}
							</Button>
						</SettingItem>

						{/* Line Numbers */}
						<SettingItem
							label="Show Line Numbers"
							description="Display line numbers in code blocks"
						>
							<Button
								variant={
									preferences.showLineNumbers
										? "primary"
										: "outline"
								}
								size="sm"
								onClick={() => {
									updatePreferences({
										showLineNumbers:
											!preferences.showLineNumbers,
									});
									toast.success(
										`Line numbers ${
											!preferences.showLineNumbers
												? "enabled"
												: "disabled"
										}`
									);
								}}
							>
								{preferences.showLineNumbers
									? "Enabled"
									: "Disabled"}
							</Button>
						</SettingItem>
					</SettingsSection>

					{/* Behavior */}
					<SettingsSection
						title="Behavior"
						description="Control how the application behaves"
						icon={<KeyboardIcon className="w-5 h-5" />}
					>
						{/* Keyboard Shortcuts */}
						<SettingItem
							label="Keyboard Shortcuts"
							description="Enable keyboard shortcuts for faster navigation"
						>
							<Button
								variant={
									preferences.enableKeyboardShortcuts
										? "primary"
										: "outline"
								}
								size="sm"
								onClick={() => {
									updatePreferences({
										enableKeyboardShortcuts:
											!preferences.enableKeyboardShortcuts,
									});
									toast.success(
										`Keyboard shortcuts ${
											!preferences.enableKeyboardShortcuts
												? "enabled"
												: "disabled"
										}`
									);
								}}
							>
								{preferences.enableKeyboardShortcuts
									? "Enabled"
									: "Disabled"}
							</Button>
						</SettingItem>
					</SettingsSection>

					{/* Data & Privacy */}
					<SettingsSection
						title="Data & Privacy"
						description="Manage your data and privacy settings"
						icon={<PersonIcon className="w-5 h-5" />}
					>
						{/* Search History */}
						<SettingItem
							label="Search History"
							description={`${searchHistory.length} searches saved`}
						>
							<Button
								variant="outline"
								size="sm"
								onClick={handleClearSearchHistory}
								disabled={searchHistory.length === 0}
							>
								<TrashIcon className="w-4 h-4 mr-2" />
								Clear History
							</Button>
						</SettingItem>

						{/* Recent Documents */}
						<SettingItem
							label="Recent Documents"
							description={`${recentDocs.length} documents saved`}
						>
							<Button
								variant="outline"
								size="sm"
								onClick={handleClearRecentDocs}
								disabled={recentDocs.length === 0}
							>
								<TrashIcon className="w-4 h-4 mr-2" />
								Clear Recent
							</Button>
						</SettingItem>

						{/* Export Data */}
						<SettingItem
							label="Export Data"
							description="Download all your data as JSON"
						>
							<Button
								variant="outline"
								size="sm"
								onClick={handleExportData}
							>
								Export
							</Button>
						</SettingItem>

						{/* Clear Cache */}
						<SettingItem
							label="Clear Browser Cache"
							description="Clear cached data and fix encoding issues"
						>
							<Button
								variant="outline"
								size="sm"
								onClick={async () => {
									await clearAllCaches();
									toast.success(
										"Browser cache cleared. Please refresh the page."
									);
									setTimeout(
										() => window.location.reload(),
										1000
									);
								}}
							>
								<ReloadIcon className="w-4 h-4 mr-2" />
								Clear Cache
							</Button>
						</SettingItem>
					</SettingsSection>

					{/* Reset */}
					<SettingsSection
						title="Reset"
						description="Reset all settings to defaults"
						icon={<TrashIcon className="w-5 h-5" />}
					>
						<SettingItem
							label="Reset All Settings"
							description="This will reset all preferences to their default values"
						>
							<Button
								variant="destructive"
								size="sm"
								onClick={handleResetSettings}
							>
								Reset Settings
							</Button>
						</SettingItem>
					</SettingsSection>
				</div>
			</div>
		</div>
	);
};

interface SettingsSectionProps {
	title: string;
	description: string;
	icon: React.ReactNode;
	children: React.ReactNode;
}

const SettingsSection: React.FC<SettingsSectionProps> = ({
	title,
	description,
	icon,
	children,
}) => {
	return (
		<div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
			<div className="flex items-center space-x-3 mb-4">
				<div className="text-blue-500">{icon}</div>
				<div>
					<h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
						{title}
					</h2>
					<p className="text-sm text-gray-600 dark:text-gray-400">
						{description}
					</p>
				</div>
			</div>
			<div className="space-y-6">{children}</div>
		</div>
	);
};

interface SettingItemProps {
	label: string;
	description: string;
	children: React.ReactNode;
}

const SettingItem: React.FC<SettingItemProps> = ({
	label,
	description,
	children,
}) => {
	return (
		<div className="flex items-center justify-between">
			<div className="flex-1 min-w-0">
				<h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
					{label}
				</h3>
				<p className="text-sm text-gray-600 dark:text-gray-400">
					{description}
				</p>
			</div>
			<div className="ml-4">{children}</div>
		</div>
	);
};

interface ThemeButtonProps {
	theme: "light" | "dark" | "system";
	current: string;
	onClick: () => void;
	icon: React.ReactNode;
	label: string;
}

const ThemeButton: React.FC<ThemeButtonProps> = ({
	theme,
	current,
	onClick,
	icon,
	label,
}) => {
	return (
		<Button
			variant={current === theme ? "primary" : "outline"}
			size="sm"
			onClick={onClick}
			className="flex items-center space-x-2"
		>
			{icon}
			<span>{label}</span>
		</Button>
	);
};
