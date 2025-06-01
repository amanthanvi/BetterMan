/**
 * Safe fetch implementation that works around browser extension interference
 */

export async function safeFetch(url: string, options?: RequestInit): Promise<Response> {
  // Try multiple approaches to work around browser extensions
  
  // Approach 1: Direct fetch with minimal options
  try {
    const response = await fetch(url, {
      ...options,
      // Disable compression to avoid decoding issues
      headers: {
        ...options?.headers,
        'Accept-Encoding': 'identity',
      },
    });
    
    if (response.ok) {
      return response;
    }
  } catch (error) {
    console.warn('Direct fetch failed:', error);
  }
  
  // Approach 2: XMLHttpRequest fallback
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(options?.method || 'GET', url, true);
    
    // Set headers
    if (options?.headers) {
      const headers = options.headers as Record<string, string>;
      Object.keys(headers).forEach(key => {
        xhr.setRequestHeader(key, headers[key]);
      });
    }
    
    xhr.onload = () => {
      // Create a Response-like object
      const response = new Response(xhr.responseText, {
        status: xhr.status,
        statusText: xhr.statusText,
        headers: parseHeaders(xhr.getAllResponseHeaders()),
      });
      
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(response);
      } else {
        reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
      }
    };
    
    xhr.onerror = () => {
      reject(new Error('Network request failed'));
    };
    
    xhr.send(options?.body as string);
  });
}

function parseHeaders(headersString: string): Headers {
  const headers = new Headers();
  const lines = headersString.trim().split('\r\n');
  
  lines.forEach(line => {
    const [key, value] = line.split(': ');
    if (key && value) {
      headers.append(key, value);
    }
  });
  
  return headers;
}