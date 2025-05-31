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
    
    // Rollup options for code splitting
    rollupOptions: {
      output: {
        // Manual chunks for better caching
        manualChunks: {
          // React and related libraries
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          
          // UI libraries
          'ui-vendor': [
            '@radix-ui/react-icons',
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-popover',
            '@radix-ui/react-toast'
          ],
          
          // Syntax highlighting (large library)
          'syntax': ['react-syntax-highlighter'],
          
          // Animation libraries
          'animation': ['framer-motion'],
          
          // State management
          'state': ['zustand'],
          
          // Utilities
          'utils': ['clsx', 'tailwind-merge']
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
    
    // Minification options
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
  },
  
  // Optimize dependencies
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'zustand',
      'framer-motion'
    ],
  },
  };
});