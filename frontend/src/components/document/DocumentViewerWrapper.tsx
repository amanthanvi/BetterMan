import React, { Component, ReactNode } from "react";
import type { Document } from "@/types";
// Import the main viewer directly - no lazy loading to avoid initialization issues
import { VirtualizedDocumentViewer } from "./VirtualizedDocumentViewer";

interface DocumentViewerWrapperProps {
	document: Document;
	enhanced?: boolean;
	className?: string;
}

// Error fallback component
const DocumentViewerError = ({ error }: { error: Error }) => (
	<div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
		<div className="text-center max-w-md mx-auto p-6">
			<h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
				Error Loading Document
			</h2>
			<p className="text-gray-600 dark:text-gray-400 mb-4">
				{error.message || "An unexpected error occurred"}
			</p>
			<button 
				onClick={() => window.location.reload()} 
				className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
			>
				Reload Page
			</button>
		</div>
	</div>
);

// Error Boundary for catching component errors
class DocumentViewerErrorBoundary extends Component<
	{ children: ReactNode },
	{ hasError: boolean; error: Error | null }
> {
	constructor(props: { children: ReactNode }) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error: Error) {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, errorInfo: any) {
		console.error("DocumentViewer Error:", error, errorInfo);
	}

	render() {
		if (this.state.hasError && this.state.error) {
			return <DocumentViewerError error={this.state.error} />;
		}

		return this.props.children;
	}
}

/**
 * Wrapper component that renders the virtualized document viewer.
 * Simplified to avoid lazy loading issues in production.
 */
export const DocumentViewerWrapper: React.FC<DocumentViewerWrapperProps> = ({
	document,
	className,
}) => {
	return (
		<DocumentViewerErrorBoundary>
			<VirtualizedDocumentViewer document={document} className={className} />
		</DocumentViewerErrorBoundary>
	);
};