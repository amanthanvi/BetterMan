const fs = require('fs');
const path = require('path');

// Cache for manpage data
let manpagesCache = null;

function loadManpages() {
  if (manpagesCache) return manpagesCache;
  
  const manpages = [];
  
  // Always include mock data for now
  manpages.push(
    {
      id: 'ls',
      command: 'ls',
      name: 'ls',
      title: 'ls - list directory contents',
      brief: 'list directory contents',
      section: '1',
      category: 'file-management',
      tags: 'files,directories,listing',
      priority: 10
    },
    {
      id: 'cd',
      command: 'cd',
      name: 'cd',
      title: 'cd - change directory',
      brief: 'change directory',
      section: '1',
      category: 'navigation',
      tags: 'directories,navigation',
      priority: 10
    },
    {
      id: 'grep',
      command: 'grep',
      name: 'grep',
      title: 'grep - print lines matching a pattern',
      brief: 'print lines matching a pattern',
      section: '1',
      category: 'text-processing',
      tags: 'search,text,pattern',
      priority: 9
    },
    {
      id: 'find',
      command: 'find',
      name: 'find',
      title: 'find - search for files in a directory hierarchy',
      brief: 'search for files in a directory hierarchy',
      section: '1',
      category: 'file-management',
      tags: 'search,files,directories',
      priority: 8
    },
    {
      id: 'cat',
      command: 'cat',
      name: 'cat',
      title: 'cat - concatenate files and print on the standard output',
      brief: 'concatenate files and print on the standard output',
      section: '1',
      category: 'file-management',
      tags: 'files,output,concatenate',
      priority: 7
    },
    {
      id: 'echo',
      command: 'echo',
      name: 'echo',
      title: 'echo - display a line of text',
      brief: 'display a line of text',
      section: '1',
      category: 'text-processing',
      tags: 'text,output,display',
      priority: 6
    },
    {
      id: 'mkdir',
      command: 'mkdir',
      name: 'mkdir',
      title: 'mkdir - make directories',
      brief: 'make directories',
      section: '1',
      category: 'file-management',
      tags: 'directories,create',
      priority: 7
    },
    {
      id: 'rm',
      command: 'rm',
      name: 'rm',
      title: 'rm - remove files or directories',
      brief: 'remove files or directories',
      section: '1',
      category: 'file-management',
      tags: 'files,directories,delete,remove',
      priority: 8
    },
    {
      id: 'cp',
      command: 'cp',
      name: 'cp',
      title: 'cp - copy files and directories',
      brief: 'copy files and directories',
      section: '1',
      category: 'file-management',
      tags: 'files,directories,copy',
      priority: 7
    },
    {
      id: 'mv',
      command: 'mv',
      name: 'mv',
      title: 'mv - move (rename) files',
      brief: 'move (rename) files',
      section: '1',
      category: 'file-management',
      tags: 'files,directories,move,rename',
      priority: 7
    }
  );
  
  manpagesCache = manpages;
  return manpages;
}

function loadManpageContent(command, section = '1') {
  // Return mock content for now
  const mockContent = {
    ls: `NAME
       ls - list directory contents

SYNOPSIS
       ls [OPTION]... [FILE]...

DESCRIPTION
       List information about the FILEs (the current directory by default).
       Sort entries alphabetically if none of -cftuvSUX nor --sort is specified.

       -a, --all
              do not ignore entries starting with .

       -l     use a long listing format

       -h, --human-readable
              with -l, print sizes in human readable format (e.g., 1K 234M 2G)`,
    
    cd: `NAME
       cd - change directory

SYNOPSIS
       cd [directory]

DESCRIPTION
       Change the current directory to directory. If no argument is given,
       the value of the HOME shell variable is the default.`,
    
    grep: `NAME
       grep - print lines matching a pattern

SYNOPSIS
       grep [OPTIONS] PATTERN [FILE...]

DESCRIPTION
       grep searches for PATTERN in each FILE. A FILE of "-" stands for
       standard input. If no FILE is given, recursive searches examine the
       working directory, and nonrecursive searches read standard input.`,
    
    find: `NAME
       find - search for files in a directory hierarchy

SYNOPSIS
       find [-H] [-L] [-P] [-D debugopts] [-Olevel] [starting-point...] [expression]

DESCRIPTION
       This manual page documents the GNU version of find. GNU find searches
       the directory tree rooted at each given starting-point by evaluating
       the given expression from left to right.`
  };
  
  return mockContent[command] || `${command}(${section}) - Command documentation`;
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
  console.log('API Request:', url);
  
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
  else if (url.match(/^\/api\/documents\/[^\/]+$/)) {
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
        name: command,
        title: `${command} - ${doc.brief || 'manual page'}`,
        description: doc.brief || '',
        section: doc.section || section,
        category: doc.category || 'general',
        tags: doc.tags ? doc.tags.split(',') : [],
        content: content,
        raw_content: content,
        priority: doc.priority || 0,
        package_hint: doc.package_hint || ''
      });
    } else {
      res.status(404).json({ error: 'Document not found' });
    }
  }
  else if (url.startsWith('/api/documents') || url.startsWith('/api/docs')) {
    const manpages = loadManpages();
    const documents = manpages.map(page => ({
      id: `${page.command}.${page.section || '1'}`,
      command: page.command || '',
      name: page.command || '',
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
      name: page.command || '',
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
        '/api/docs',
        '/api/documents/:id',
        '/api/search?q=query',
        '/api/analytics/overview',
        '/api/analytics/popular'
      ]
    });
  }
};