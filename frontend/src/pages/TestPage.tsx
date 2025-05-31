import React from 'react';

export const TestPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">
          BetterMan - Test Page
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          If you can see this, the basic React app is working!
        </p>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Quick Test</h2>
          <p>Frontend: ✓ Running</p>
          <p>React Router: ✓ Working</p>
          <p>Tailwind CSS: ✓ Loaded</p>
        </div>
      </div>
    </div>
  );
};