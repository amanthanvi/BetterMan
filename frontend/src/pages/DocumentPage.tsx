import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeftIcon } from '@radix-ui/react-icons';
import { Button } from '@/components/ui/Button';
import { DocumentViewer } from '@/components/document/DocumentViewer';
import { documentAPI } from '@/services/api';
import { useAppStore } from '@/stores/appStore';
import type { Document } from '@/types';

export const DocumentPage: React.FC = () => {
  const { docId } = useParams<{ docId: string }>();
  const navigate = useNavigate();
  
  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const { addRecentDoc } = useAppStore();
  
  useEffect(() => {
    const loadDocument = async () => {
      if (!docId) {
        setError('Document ID not provided');
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        setError(null);
        
        const doc = await documentAPI.getDocument(docId);
        setDocument(doc);
        addRecentDoc(doc);
        
        // Update page title
        document.title = `${doc.title} - BetterMan`;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load document');
      } finally {
        setLoading(false);
      }
    };
    
    loadDocument();
  }, [docId, addRecentDoc]);
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
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
          <Button onClick={() => navigate('/')}>
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
      <DocumentViewer document={document} />
    </motion.div>
  );
};