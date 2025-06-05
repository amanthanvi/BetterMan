// Debug utility to check favorites in localStorage
export const debugFavorites = () => {
  const storageKey = 'betterman-storage';
  const storedData = localStorage.getItem(storageKey);
  
  if (storedData) {
    try {
      const parsed = JSON.parse(storedData);
      console.log('Current favorites:', parsed.state?.favorites);
      console.log('Full storage data:', parsed);
    } catch (error) {
      console.error('Error parsing storage:', error);
    }
  } else {
    console.log('No storage data found');
  }
};

// Call this in browser console: debugFavorites()