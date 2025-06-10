import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "@/stores/appStore";
import { useSearchStore } from "@/stores/searchStore";

export const KeyboardShortcuts: React.FC = () => {
	const navigate = useNavigate();

	const {
		setCommandPaletteOpen,
		toggleDarkMode,
		toggleSidebar,
		preferences,
	} = useAppStore();

	const { clearResults } = useSearchStore();

	useEffect(() => {
		if (!preferences.enableKeyboardShortcuts) return;

		const handleKeyDown = (event: KeyboardEvent) => {
			const { key, metaKey, ctrlKey, shiftKey, altKey } = event;
			const modifier = metaKey || ctrlKey;

			// Ignore if user is typing in an input
			const target = event.target as HTMLElement;
			if (
				target.tagName === "INPUT" ||
				target.tagName === "TEXTAREA" ||
				target.contentEditable === "true"
			) {
				// Allow some shortcuts even when typing
				if (modifier && key === "k") {
					event.preventDefault();
					setCommandPaletteOpen(true);
				}
				return;
			}

			// Global shortcuts
			switch (true) {
				// Command palette - use Cmd/Ctrl+P instead of K to avoid browser conflicts
				case modifier && key === "k":
				case modifier && key === "p":
					event.preventDefault();
					setCommandPaletteOpen(true);
					break;

				// Navigation shortcuts
				case modifier && key === "h":
					event.preventDefault();
					navigate("/");
					break;

				case modifier && key === "f":
					event.preventDefault();
					navigate("/favorites");
					break;

				case modifier && key === ",":
					event.preventDefault();
					navigate("/settings");
					break;

				// Toggle sidebar (mobile)
				case modifier && key === "b":
					event.preventDefault();
					toggleSidebar();
					break;

				// Clear search
				case key === "Escape":
					event.preventDefault();
					clearResults();
					break;

				// Quick search shortcuts
				case key === "/":
					event.preventDefault();
					setCommandPaletteOpen(true);
					break;

				// Help (show shortcuts)
				case key === "?":
					event.preventDefault();
					showKeyboardShortcutsHelp();
					break;
			}
		};

		document.addEventListener("keydown", handleKeyDown);

		return () => {
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [
		navigate,
		setCommandPaletteOpen,
		toggleDarkMode,
		toggleSidebar,
		clearResults,
		preferences.enableKeyboardShortcuts,
	]);

	return null;
};

const showKeyboardShortcutsHelp = () => {
	// You could implement a modal or tooltip showing available shortcuts
	// TODO: Implement keyboard shortcuts help modal
	const shortcuts = {
		"Command Palette": "⌘K or /",
		Home: "⌘H",
		Favorites: "⌘F",
		Settings: "⌘,",
		"Toggle Sidebar": "⌘B",
		"Clear Search": "Esc",
		"Show Help": "?",
	};
	// TODO: Show modal with shortcuts
};
