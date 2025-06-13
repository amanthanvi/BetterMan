import React from "react";
import { ModernDocumentViewer } from "./ModernDocumentViewer";
import { DocumentViewer } from "./DocumentViewer";
import type { Document } from "@/types";

interface DocumentViewerWrapperProps {
  document: Document;
  enhanced?: boolean;
  className?: string;
}

/**
 * Wrapper component that renders the appropriate document viewer.
 * Now uses the ModernDocumentViewer with improved UI/UX and no flicker issues.
 */
export const DocumentViewerWrapper: React.FC<DocumentViewerWrapperProps> = ({
  document,
  enhanced = true,
  className
}) => {
  // Always use the modern viewer for the best experience
  const ViewerComponent = enhanced ? ModernDocumentViewer : DocumentViewer;
  
  return <ViewerComponent document={document} className={className} />;
};