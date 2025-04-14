import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import './App.css';

function App() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDocs = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
        const response = await fetch(`${apiUrl}/api/docs`);
        const data = await response.json();
        setDocs(data);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching documentation:', error);
        setLoading(false);
      }
    };

    fetchDocs();
  }, []);

  return (
    <Router>
      <div className="min-h-screen bg-gray-100">
        <nav className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex">
                <div className="flex-shrink-0 flex items-center">
                  <Link to="/" className="text-2xl font-bold text-indigo-600">
                    BetterMan
                  </Link>
                </div>
                <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                  <Link to="/" className="border-indigo-500 text-gray-900 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
                    Home
                  </Link>
                  <Link to="/docs" className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
                    Documentation
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </nav>

        <div className="py-10">
          <main>
            <div className="max-w-7xl mx-auto sm:px-6 lg:px-8">
              <Routes>
                <Route path="/" element={
                  <div className="px-4 py-8 sm:px-0">
                    <div className="border-4 border-dashed border-gray-200 rounded-lg h-96 flex items-center justify-center">
                      <div className="text-center">
                        <h1 className="text-4xl font-bold text-gray-900">Welcome to BetterMan</h1>
                        <p className="mt-4 text-lg text-gray-600">A modern, readable reinterpretation of Linux man pages</p>
                        <Link to="/docs" className="mt-8 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700">
                          Browse Documentation
                        </Link>
                      </div>
                    </div>
                  </div>
                } />
                <Route path="/docs" element={
                  <div className="px-4 py-6 sm:px-0">
                    <h2 className="text-2xl font-bold mb-6">Available Documentation</h2>
                    {loading ? (
                      <p>Loading documentation...</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {docs.map((doc) => (
                          <div key={doc.id} className="bg-white overflow-hidden shadow rounded-lg">
                            <div className="px-4 py-5 sm:p-6">
                              <h3 className="text-lg font-medium text-gray-900">{doc.title}</h3>
                              <p className="mt-1 text-sm text-gray-600">{doc.summary}</p>
                              <div className="mt-4">
                                <Link 
                                  to={`/docs/${doc.id}`} 
                                  className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
                                >
                                  View Documentation
                                </Link>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                } />
                <Route path="/docs/:id" element={<div>Documentation detail page</div>} />
              </Routes>
            </div>
          </main>
        </div>
      </div>
    </Router>
  );
}

export default App;