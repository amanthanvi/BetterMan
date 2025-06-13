import React from "react";
import { UltimateDocumentViewer } from "./UltimateDocumentViewer";
import { DocumentViewer } from "./DocumentViewer";
import type { Document } from "@/types";

interface DocumentViewerWrapperProps {
	document: Document;
	enhanced?: boolean;
	className?: string;
}

/**
 * Wrapper component that renders the appropriate document viewer.
 * Now uses the UltimateDocumentViewer with perfect TOC positioning and enhanced UI/UX.
 */
export const DocumentViewerWrapper: React.FC<DocumentViewerWrapperProps> = ({
	document,
	enhanced = true,
	className,
}) => {
	// Use the UltimateDocumentViewer for the best experience with fixed TOC
	const ViewerComponent = enhanced ? UltimateDocumentViewer : DocumentViewer;

	return <ViewerComponent document={document} className={className} />;
};
