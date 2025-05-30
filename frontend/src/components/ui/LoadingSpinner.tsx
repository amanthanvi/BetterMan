import React from "react";

interface LoadingSpinnerProps {
	size?: "sm" | "md" | "lg";
	message?: string;
	className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
	size = "md",
	message = "Loading...",
	className = "",
}) => {
	const sizeClasses = {
		sm: "h-6 w-6",
		md: "h-12 w-12",
		lg: "h-16 w-16",
	};

	return (
		<div
			className={`flex flex-col items-center justify-center py-8 ${className}`}
		>
			<div
				className={`animate-spin rounded-full border-t-2 border-b-2 border-indigo-500 ${sizeClasses[size]}`}
			></div>
			{message && (
				<p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
					{message}
				</p>
			)}
		</div>
	);
};
