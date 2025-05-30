import React from "react";

interface ErrorFallbackProps {
	error: Error;
	resetErrorBoundary: () => void;
}

export const ErrorFallback: React.FC<ErrorFallbackProps> = ({
	error,
	resetErrorBoundary,
}) => {
	return (
		<div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
			<div className="max-w-md w-full bg-white dark:bg-gray-800 shadow-lg rounded-lg p-6">
				<div className="flex items-center mb-4">
					<div className="flex-shrink-0">
						<svg
							className="h-8 w-8 text-red-500"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.728-.833-2.498 0L4.316 16.5c-.77.833.192 2.5 1.732 2.5z"
							/>
						</svg>
					</div>
					<div className="ml-3">
						<h3 className="text-lg font-medium text-gray-900 dark:text-white">
							Something went wrong
						</h3>
					</div>
				</div>

				<div className="mb-4">
					<p className="text-sm text-gray-600 dark:text-gray-300">
						{error.message}
					</p>
				</div>

				<div className="flex space-x-3">
					<button
						onClick={resetErrorBoundary}
						className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
					>
						Try again
					</button>
					<button
						onClick={() => window.location.reload()}
						className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
					>
						Reload page
					</button>
				</div>

				{process.env.NODE_ENV === "development" && (
					<details className="mt-4">
						<summary className="cursor-pointer text-sm text-gray-500 dark:text-gray-400">
							Error details (development only)
						</summary>
						<pre className="mt-2 text-xs bg-gray-100 dark:bg-gray-700 p-2 rounded overflow-auto">
							{error.stack}
						</pre>
					</details>
				)}
			</div>
		</div>
	);
};
