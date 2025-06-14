/**
 * Browser utility functions
 */

/**
 * Check if we're in a browser environment
 */
export const isBrowser = () => {
  return typeof window !== "undefined" && 
         typeof window.document !== "undefined" &&
         typeof window.document.createElement === "function";
};

/**
 * Check if document is ready
 */
export const isDocumentReady = () => {
  return isBrowser() && 
         window.document.readyState === "complete" &&
         window.document.documentElement !== null;
};

/**
 * Run a function when the document is ready
 */
export const onDocumentReady = (callback: () => void) => {
  if (!isBrowser()) return;
  
  if (isDocumentReady()) {
    callback();
  } else {
    const listener = () => {
      if (isDocumentReady()) {
        callback();
        window.removeEventListener("DOMContentLoaded", listener);
        window.removeEventListener("load", listener);
      }
    };
    
    window.addEventListener("DOMContentLoaded", listener);
    window.addEventListener("load", listener);
  }
};