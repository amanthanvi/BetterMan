import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeftIcon } from "@radix-ui/react-icons";
import { Button } from "@/components/ui/Button";
import { EnhancedDocumentViewer } from "@/components/document/EnhancedDocumentViewer";
import { documentAPI } from "@/services/api";
import { useAppStore } from "@/stores/appStore";
import type { Document } from "@/types";

export const DocumentPage: React.FC = () => {
	const {
		docId,
		name: routeName,
		section: routeSection,
	} = useParams<{ docId?: string; name?: string; section?: string }>();
	const navigate = useNavigate();

	const [document, setDocument] = useState<Document | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const { addRecentDoc } = useAppStore();

	useEffect(() => {
		const loadDocument = async () => {
			let name: string | undefined;
			let section: string | undefined;

			// Handle both route formats
			if (routeName && routeSection) {
				// Format: /docs/:name/:section
				name = routeName;
				section = routeSection;
			} else if (docId) {
				// Format: /docs/:docId (e.g., "ls.1")
				// Parse the docId to extract name and section
				if (docId.includes(".") && /\.\d+$/.test(docId)) {
					const parts = docId.split(".");
					section = parts.pop() || "1";
					name = parts.join(".");
				} else {
					name = docId;
					section = "1"; // Default to section 1
				}
			} else {
				setError("Document ID not provided");
				setLoading(false);
				return;
			}

			try {
				setLoading(true);
				setError(null);

				const doc = await documentAPI.getDocument(name, section);
				setDocument(doc);
				addRecentDoc(doc);

				// Update page title
				window.document.title = `${doc.title} - BetterMan`;
			} catch (err) {
				setError(
					err instanceof Error
						? err.message
						: "Failed to load document"
				);
			} finally {
				setLoading(false);
			}
		};

		loadDocument();
	}, [docId, routeName, routeSection, addRecentDoc]);

	if (loading) {
		return (
			<div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
				<motion.div
					animate={{ rotate: 360 }}
					transition={{
						duration: 1,
						repeat: Infinity,
						ease: "linear",
					}}
					className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full"
				/>
			</div>
		);
	}

	if (error || !document) {
		return (
			<div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					className="text-center max-w-md mx-auto p-6"
				>
					<h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
						Document Not Found
					</h1>
					<p className="text-gray-600 dark:text-gray-400 mb-6">
						{error || `The document "${docId}" could not be found.`}
					</p>
					<Button onClick={() => navigate("/")}>
						<ArrowLeftIcon className="w-4 h-4 mr-2" />
						Back to Home
					</Button>
				</motion.div>
			</div>
		);
	}

	return (
		<motion.div
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			className="min-h-screen bg-gray-50 dark:bg-gray-900"
		>
			<EnhancedDocumentViewer document={document} />
		</motion.div>
	);
};
