import React, { Suspense, lazy, Component, ReactNode } from "react";
import type { Document } from "@/types";

// Lazy load the viewers for better initial load performance
const VirtualizedDocumentViewer = lazy(() =>
	import("./VirtualizedDocumentViewer").then((mod) => ({
		default: mod.VirtualizedDocumentViewer,
	}))
);

const OptimizedDocumentViewer = lazy(() =>
	import("./OptimizedDocumentViewer").then((mod) => ({
		default: mod.OptimizedDocumentViewer,
	}))
);

const UltimateDocumentViewer = lazy(() =>
	import("./UltimateDocumentViewer").then((mod) => ({
		default: mod.UltimateDocumentViewer,
	}))
);

interface DocumentViewerWrapperProps {
	document: Document;
	enhanced?: boolean;
	className?: string;
}

// Loading component
const DocumentViewerSkeleton = () => (
	<div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
		<div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
	</div>
);

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
 * Wrapper component that renders the appropriate document viewer.
 * Uses VirtualizedDocumentViewer for best performance with large documents.
 */
export const DocumentViewerWrapper: React.FC<DocumentViewerWrapperProps> = ({
	document,
	className,
}) => {
	// Determine which viewer to use based on document size
	const estimatedSize = (document.raw_content?.length || 0) + 
		(document.sections?.reduce((acc, s) => acc + (s.content?.length || 0), 0) || 0);
	
	// Use virtualized viewer for large documents (> 100KB)
	const useVirtualized = estimatedSize > 100000;
	
	// Use optimized viewer for medium documents (> 50KB)
	const useOptimized = estimatedSize > 50000;

	return (
		<DocumentViewerErrorBoundary>
			<Suspense fallback={<DocumentViewerSkeleton />}>
				{useVirtualized ? (
					<VirtualizedDocumentViewer document={document} className={className} />
				) : useOptimized ? (
					<OptimizedDocumentViewer document={document} className={className} />
				) : (
					<UltimateDocumentViewer document={document} className={className} />
				)}
			</Suspense>
		</DocumentViewerErrorBoundary>
	);
};
