// One-time cleanup to remove old numeric favorites
export const clearNumericFavorites = () => {
  const storageKey = 'betterman-storage';
  const storedData = localStorage.getItem(storageKey);
  
  if (storedData) {
    try {
      const parsed = JSON.parse(storedData);
      if (parsed.state && parsed.state.favorites) {
        // Filter out numeric-only favorites
        const originalLength = parsed.state.favorites.length;
        parsed.state.favorites = parsed.state.favorites.filter(
          (id: string) => !(/^\d+$/.test(id))
        );
        
        if (parsed.state.favorites.length !== originalLength) {
          localStorage.setItem(storageKey, JSON.stringify(parsed));
          console.log(`Removed ${originalLength - parsed.state.favorites.length} numeric favorites`);
          return true;
        }
      }
    } catch (error) {
      console.error('Error cleaning numeric favorites:', error);
    }
  }
  return false;
};

// Run this once to clean up
if (typeof window !== 'undefined') {
  clearNumericFavorites();
}