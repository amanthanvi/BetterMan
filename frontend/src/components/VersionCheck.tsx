import React from 'react';

export const VersionCheck = () => {
  // Log React version on mount
  React.useEffect(() => {
    console.log('React version:', React.version);
    console.log('React DOM version:', (window as any).ReactDOM?.version);
  }, []);
  
  return null;
};