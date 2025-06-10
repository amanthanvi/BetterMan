import React, { useEffect, useState } from "react";
import { DocumentViewer } from "./DocumentViewer";
import { EnhancedDocumentViewer } from "./EnhancedDocumentViewer";
import { useAppStore } from "@/stores/appStore";
import type { Document } from "@/types";

interface DocumentViewerWrapperProps {
  document: Document;
  enhanced?: boolean;
  className?: string;
}

/**
 * Wrapper component that prevents TOC flicker by ensuring the TOC state
 * is loaded from the store before rendering the viewer components.
 */
export const DocumentViewerWrapper: React.FC<DocumentViewerWrapperProps> = ({
  document,
  enhanced = true,
  className
}) => {
  const [isReady, setIsReady] = useState(false);
  const { documentTocOpen } = useAppStore();
  
  useEffect(() => {
    // Small delay to ensure store is fully hydrated
    const timer = setTimeout(() => {
      setIsReady(true);
    }, 0);
    
    return () => clearTimeout(timer);
  }, []);
  
  if (!isReady) {
    // Render a placeholder with the same layout to prevent layout shift
    return (
      <div className="relative flex min-h-screen bg-gray-50 dark:bg-gray-950">
        {/* TOC placeholder */}
        <aside 
          className="fixed left-0 z-40 flex flex-col w-80 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 shadow-xl"
          style={{ 
            top: "64px", 
            bottom: 0,
            height: "calc(100vh - 64px)",
            transform: documentTocOpen ? "translateX(0)" : "translateX(-100%)",
            opacity: 0
          }}
        />
        
        {/* Content placeholder */}
        <div 
          className="flex-1 w-full"
          style={{
            paddingLeft: documentTocOpen ? "20rem" : "0"
          }}
        >
          <div className="animate-pulse">
            <div className="h-32 bg-gray-200 dark:bg-gray-800 mb-4"></div>
            <div className="p-6 space-y-4">
              <div className="h-4 bg-gray-200 dark:bg-gray-800 w-3/4"></div>
              <div className="h-4 bg-gray-200 dark:bg-gray-800 w-1/2"></div>
              <div className="h-4 bg-gray-200 dark:bg-gray-800 w-5/6"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  const ViewerComponent = enhanced ? EnhancedDocumentViewer : DocumentViewer;
  
  return <ViewerComponent document={document} className={className} />;
};