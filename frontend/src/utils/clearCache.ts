/**
 * Utility to clear various caches and reset application state
 */

export const clearAllCaches = async () => {
	try {
		// Clear localStorage
		localStorage.clear();

		// Clear sessionStorage
		sessionStorage.clear();

		// Clear service worker caches if available
		if ("caches" in window) {
			const cacheNames = await caches.keys();
			await Promise.all(
				cacheNames.map((cacheName) => caches.delete(cacheName))
			);
		}

		// Unregister service workers
		if ("serviceWorker" in navigator) {
			const registrations =
				await navigator.serviceWorker.getRegistrations();
			await Promise.all(
				registrations.map((registration) => registration.unregister())
			);
		}

		console.log("All caches cleared successfully");
		return true;
	} catch (error) {
		console.error("Error clearing caches:", error);
		return false;
	}
};

export const clearAppCache = () => {
	// Clear specific app caches
	const appKeys = ["betterman-storage", "search-storage"];
	appKeys.forEach((key) => {
		localStorage.removeItem(key);
	});
};

export const resetTheme = () => {
	// Remove dark class from document
	document.documentElement.classList.remove("dark");

	// Clear theme from localStorage
	const storage = localStorage.getItem("betterman-storage");
	if (storage) {
		try {
			const data = JSON.parse(storage);
			data.state.darkMode = false;
			data.state.theme = "light";
			data.state.preferences.theme = "light";
			localStorage.setItem("betterman-storage", JSON.stringify(data));
		} catch (e) {
			console.error("Error resetting theme:", e);
		}
	}
};
