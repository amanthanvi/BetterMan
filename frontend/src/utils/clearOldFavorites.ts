// Utility to clear old numeric favorites from localStorage
export const clearOldFavorites = () => {
  try {
    const storageKey = 'betterman-storage';
    const storedData = localStorage.getItem(storageKey);
    
    if (storedData) {
      const parsed = JSON.parse(storedData);
      if (parsed.state && parsed.state.favorites) {
        // Filter out old numeric favorites
        const validFavorites = parsed.state.favorites.filter(
          (id: string) => !(/^\d+$/.test(id)) && id.includes('.')
        );
        
        // Update only if there were invalid favorites
        if (validFavorites.length !== parsed.state.favorites.length) {
          parsed.state.favorites = validFavorites;
          localStorage.setItem(storageKey, JSON.stringify(parsed));
          console.log('Cleaned up old numeric favorites');
        }
      }
    }
  } catch (error) {
    console.error('Error cleaning up old favorites:', error);
  }
};