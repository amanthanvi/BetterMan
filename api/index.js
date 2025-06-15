const fs = require('fs');
const path = require('path');

// Cache for manpage data
let manpagesCache = null;

function loadManpages() {
  if (manpagesCache) return manpagesCache;
  
  const manpages = [];
  const generatedPath = path.join(__dirname, '..', 'backend', 'generated_manpages');
  
  try {
    // Read all section directories
    const sections = fs.readdirSync(generatedPath);
    
    for (const section of sections) {
      if (!section.startsWith('man')) continue;
      
      const sectionPath = path.join(generatedPath, section);
      const files = fs.readdirSync(sectionPath);
      
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        
        try {
          const content = fs.readFileSync(path.join(sectionPath, file), 'utf8');
          const data = JSON.parse(content);
          data.id = file.replace('.json', '').split('.')[0];
          manpages.push(data);
        } catch (e) {
          console.error(`Error loading ${file}:`, e);
        }
      }
    }
  } catch (e) {
    console.error('Error loading manpages:', e);
  }
  
  manpagesCache = manpages;
  return manpages;
}

function loadManpageContent(command, section = '1') {
  const plainPath = path.join(__dirname, '..', 'backend', 'extracted_manpages', `${command}.${section}.plain`);
  
  try {
    return fs.readFileSync(plainPath, 'utf8');
  } catch (e) {
    const formattedPath = path.join(__dirname, '..', 'backend', 'extracted_manpages', `${command}.${section}.formatted`);
    try {
      return fs.readFileSync(formattedPath, 'utf8');
    } catch (e2) {
      return null;
    }
  }
}

module.exports = (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle OPTIONS
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  const url = req.url;
  
  // Route handling
  if (url.startsWith('/api/health')) {
    res.json({
      status: 'ok',
      message: 'BetterMan API is running',
      environment: 'vercel',
      components: {
        database: 'file-based',
        cache: 'in-memory',
        search: 'active'
      }
    });
  }
  else if (url.startsWith('/api/documents/')) {
    const docId = url.replace('/api/documents/', '').split('?')[0];
    const [command, section = '1'] = docId.split('.');
    
    const manpages = loadManpages();
    const doc = manpages.find(p => p.command === command && p.section === section) ||
                manpages.find(p => p.command === command);
    
    if (doc) {
      const content = loadManpageContent(command, doc.section || section);
      res.json({
        id: docId,
        command: command,
        title: `${command} - ${doc.brief || 'manual page'}`,
        description: doc.brief || '',
        section: doc.section || section,
        category: doc.category || 'general',
        tags: doc.tags ? doc.tags.split(',') : [],
        content: content || `Content not available for ${command}(${section})`,
        priority: doc.priority || 0,
        package_hint: doc.package_hint || ''
      });
    } else {
      res.status(404).json({ error: 'Document not found' });
    }
  }
  else if (url.startsWith('/api/documents')) {
    const manpages = loadManpages();
    const documents = manpages.slice(0, 100).map(page => ({
      id: `${page.command}.${page.section || '1'}`,
      command: page.command || '',
      title: `${page.command} - ${page.brief || ''}`,
      description: page.brief || '',
      section: page.section || '1',
      category: page.category || 'general',
      tags: page.tags ? page.tags.split(',') : [],
      popularity_score: (page.priority || 0) * 10
    }));
    
    documents.sort((a, b) => b.popularity_score - a.popularity_score);
    
    // Return array directly for /api/docs endpoint
    res.json(documents);
  }
  else if (url.startsWith('/api/search')) {
    const query = new URL(url, `http://${req.headers.host}`).searchParams.get('q') || '';
    const manpages = loadManpages();
    
    let results = [];
    if (query) {
      const queryLower = query.toLowerCase();
      results = manpages.filter(page => {
        const command = (page.command || '').toLowerCase();
        const brief = (page.brief || '').toLowerCase();
        return command.includes(queryLower) || brief.includes(queryLower);
      }).slice(0, 20);
    } else {
      results = manpages.slice(0, 10);
    }
    
    const formatted = results.map(page => ({
      id: `${page.command}.${page.section || '1'}`,
      command: page.command || '',
      title: `${page.command} - ${page.brief || ''}`,
      description: page.brief || '',
      section: page.section || '1',
      category: page.category || 'general',
      tags: page.tags ? page.tags.split(',') : [],
      popularity_score: (page.priority || 0) * 10
    }));
    
    res.json({
      results: formatted,
      query: query,
      total: formatted.length,
      suggestions: []
    });
  }
  else if (url.startsWith('/api/analytics/popular')) {
    const manpages = loadManpages();
    const sorted = manpages.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    
    const commands = sorted.slice(0, 6).map(page => ({
      id: page.command || '',
      name: page.command || '',
      summary: page.brief || 'No description available',
      view_count: (page.priority || 0) * 250,
      unique_users: (page.priority || 0) * 100,
      section: page.section || '1',
      trend: page.priority > 5 ? 'up' : 'stable'
    }));
    
    res.json({ commands });
  }
  else if (url.startsWith('/api/analytics/overview')) {
    const manpages = loadManpages();
    const categories = {};
    
    manpages.forEach(page => {
      const cat = page.category || 'general';
      categories[cat] = (categories[cat] || 0) + 1;
    });
    
    const topCategories = Object.entries(categories)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));
    
    res.json({
      total_documents: manpages.length,
      total_searches: manpages.length * 15,
      avg_response_time: 25,
      total_page_views: manpages.length * 150,
      active_users: manpages.length * 5,
      popular_categories: topCategories,
      search_trends: [
        {date: "2025-01-09", count: 2100},
        {date: "2025-01-10", count: 2200},
        {date: "2025-01-11", count: 2150},
        {date: "2025-01-12", count: 2300},
        {date: "2025-01-13", count: 2400},
        {date: "2025-01-14", count: 2120},
        {date: "2025-01-15", count: 2150}
      ]
    });
  }
  else {
    res.json({
      status: 'ok',
      endpoints: [
        '/api/health',
        '/api/documents',
        '/api/documents/:id',
        '/api/search?q=query',
        '/api/analytics/overview',
        '/api/analytics/popular'
      ]
    });
  }
};