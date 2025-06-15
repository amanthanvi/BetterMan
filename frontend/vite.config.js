import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig(async () => {
  let plugins = [
    react(),
    tailwindcss(),
  ];
  
  // Conditionally add visualizer only if ANALYZE is set and package is available
  if (process.env.ANALYZE) {
    try {
      const { visualizer } = await import("rollup-plugin-visualizer");
      plugins.push(visualizer({
        open: true,
        filename: "dist/stats.html",
        gzipSize: true,
        brotliSize: true,
      }));
    } catch (e) {
      console.warn("rollup-plugin-visualizer not available, skipping bundle analysis");
    }
  }

  return {
    plugins,
  
  server: {
    port: 5173,
    host: true
  },
  
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@/components": path.resolve(__dirname, "./src/components"),
      "@/utils": path.resolve(__dirname, "./src/utils"),
      "@/types": path.resolve(__dirname, "./src/types"),
      "@/stores": path.resolve(__dirname, "./src/stores"),
      "@/services": path.resolve(__dirname, "./src/services"),
      "@/pages": path.resolve(__dirname, "./src/pages")
    }
  },
  
  build: {
    // Output directory
    outDir: "dist",
    
    // Enable source maps for production debugging
    sourcemap: true,
    
    // Optimize chunk size
    chunkSizeWarningLimit: 1000,
    
    // Target modern browsers for smaller bundles
    target: 'es2020',
    
    // Enable CSS code splitting
    cssCodeSplit: true,
    
    // Rollup options for code splitting
    rollupOptions: {
      output: {
        // Manual chunks for better caching
        manualChunks: (id) => {
          // Node modules chunking
          if (id.includes('node_modules')) {
            // React ecosystem - force into main vendor chunk to ensure availability
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'vendor';
            }
            
            // UI component libraries
            if (id.includes('@radix-ui') || id.includes('@headlessui')) {
              return 'ui-vendor';
            }
            
            // Syntax highlighting (large library)
            if (id.includes('react-syntax-highlighter') || id.includes('highlight.js') || id.includes('prismjs')) {
              return 'syntax';
            }
            
            // Animation libraries
            if (id.includes('react-spring')) {
              return 'animation';
            }
            
            // State management and related utilities
            if (id.includes('immer')) {
              return 'vendor';
            }
            
            // Utilities
            if (id.includes('clsx') || id.includes('tailwind-merge') || id.includes('class-variance-authority')) {
              return 'utils';
            }
            
            // Date utilities
            if (id.includes('date-fns') || id.includes('dayjs')) {
              return 'date-utils';
            }
            
            // Icons
            if (id.includes('lucide-react') || id.includes('react-icons')) {
              return 'icons';
            }
            
            // Markdown/Rich text
            if (id.includes('marked') || id.includes('remark') || id.includes('rehype')) {
              return 'markdown';
            }
            
            // Default vendor chunk for other dependencies
            return 'vendor';
          }
          
          // Application code chunking by feature
          if (id.includes('src/pages/')) {
            const pageName = id.split('src/pages/')[1].split('/')[0];
            return `page-${pageName}`;
          }
          
          if (id.includes('src/components/')) {
            const componentPath = id.split('src/components/')[1];
            if (componentPath.startsWith('search/')) return 'comp-search';
            if (componentPath.startsWith('document/')) return 'comp-document';
            if (componentPath.startsWith('terminal/')) return 'comp-terminal';
            if (componentPath.startsWith('ui/')) return 'comp-ui';
            if (componentPath.startsWith('auth/')) return 'comp-auth';
          }
        },
        
        // Asset file naming
        assetFileNames: (assetInfo) => {
          let extType = assetInfo.name.split('.').at(1);
          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(extType)) {
            extType = 'img';
          }
          return `assets/${extType}/[name]-[hash][extname]`;
        },
        
        // Chunk file naming
        chunkFileNames: 'assets/js/[name]-[hash].js',
        
        // Entry file naming
        entryFileNames: 'assets/js/[name]-[hash].js',
      },
    },
    
    // Disable minification temporarily to debug React import issues
    minify: false,
  },
  
  // Optimize dependencies
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom'
    ],
    force: true,
    esbuildOptions: {
      target: 'es2020'
    }
  },
  
  // SSR configuration
  ssr: {
    noExternal: []
  },
  
  // Ensure React is available globally
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    global: 'globalThis'
  },
  };
});