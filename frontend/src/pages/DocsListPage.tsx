import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { FileTextIcon, MagnifyingGlassIcon as SearchIcon } from "@radix-ui/react-icons";
import { documentAPI } from "@/services/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { Document } from "@/types";

export const DocsListPage: React.FC = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSection, setSelectedSection] = useState<string | null>(null);

  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        setLoading(true);
        const response = await documentAPI.getAll({ limit: 100 });
        setDocuments(response);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load documents");
      } finally {
        setLoading(false);
      }
    };

    fetchDocuments();
  }, []);

  // Filter documents based on search term and section
  const filteredDocs = documents.filter((doc) => {
    const matchesSearch = !searchTerm || 
      doc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSection = selectedSection === null || String(doc.section) === selectedSection;
    return matchesSearch && matchesSection;
  });

  // Group documents by section
  const groupedDocs = filteredDocs.reduce((acc, doc) => {
    const section = String(doc.section || "0");
    if (!acc[section]) {
      acc[section] = [];
    }
    acc[section].push(doc);
    return acc;
  }, {} as Record<string, Document[]>);

  const sectionNames: Record<string, string> = {
    "1": "User Commands",
    "2": "System Calls",
    "3": "Library Functions",
    "4": "Special Files",
    "5": "File Formats",
    "6": "Games",
    "7": "Miscellaneous",
    "8": "System Administration",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="text-red-600 dark:text-red-400 mb-4">{error}</div>
        <Button onClick={() => window.location.reload()}>Reload</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            All Documentation
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Browse {documents.length} available manual pages
          </p>
        </motion.div>

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8 space-y-4"
        >
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Filter documentation..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <select
              value={selectedSection || ""}
              onChange={(e) => setSelectedSection(e.target.value || null)}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            >
              <option value="">All Sections</option>
              {Object.entries(sectionNames).map(([section, name]) => (
                <option key={section} value={section}>
                  {name} ({documents.filter(d => String(d.section) === section).length})
                </option>
              ))}
            </select>
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Showing {filteredDocs.length} of {documents.length} documents
          </div>
        </motion.div>

        {/* Document List */}
        <div className="space-y-8">
          {Object.entries(groupedDocs)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([section, docs], sectionIndex) => (
              <motion.div
                key={section}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + sectionIndex * 0.1 }}
              >
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <FileTextIcon className="w-5 h-5" />
                  {sectionNames[section] || `Section ${section}`}
                  <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                    ({docs.length})
                  </span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {docs
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((doc, index) => (
                      <motion.div
                        key={doc.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.3 + index * 0.02 }}
                      >
                        <Link
                          to={`/docs/${doc.name}.${doc.section}`}
                          className="block p-4 bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-md transition-all duration-200 hover:scale-[1.02]"
                        >
                          <h3 className="font-mono font-semibold text-gray-900 dark:text-gray-100 mb-1">
                            {doc.name}
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                            {doc.summary || doc.title || "No description available"}
                          </p>
                        </Link>
                      </motion.div>
                    ))}
                </div>
              </motion.div>
            ))}
        </div>

        {filteredDocs.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <FileTextIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">
              No documentation found matching your filters.
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
};