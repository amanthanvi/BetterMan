import React, { useState, useEffect, useRef } from 'react';
import { cn } from '@/utils/cn';

interface ProgressiveImageProps {
  src: string;
  placeholder?: string;
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  onLoad?: () => void;
  onError?: () => void;
}

export const ProgressiveImage: React.FC<ProgressiveImageProps> = ({
  src,
  placeholder,
  alt,
  className,
  loading = 'lazy',
  onLoad,
  onError,
}) => {
  const [imageSrc, setImageSrc] = useState(placeholder || '');
  const [imageLoading, setImageLoading] = useState(true);
  const [error, setError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    // Early return if no src
    if (!src) return;

    // Use Intersection Observer for lazy loading
    if (loading === 'lazy' && 'IntersectionObserver' in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              loadImage();
              observer.unobserve(entry.target);
            }
          });
        },
        {
          rootMargin: '50px 0px',
          threshold: 0.01,
        }
      );

      if (imgRef.current) {
        observer.observe(imgRef.current);
      }

      return () => {
        if (imgRef.current) {
          observer.unobserve(imgRef.current);
        }
      };
    } else {
      // Eager loading or no IntersectionObserver support
      loadImage();
    }
  }, [src, loading]);

  const loadImage = () => {
    const img = new Image();
    
    img.onload = () => {
      setImageSrc(src);
      setImageLoading(false);
      onLoad?.();
    };

    img.onerror = () => {
      setError(true);
      setImageLoading(false);
      onError?.();
    };

    img.src = src;
  };

  if (error) {
    return (
      <div className={cn(
          'flex items-center justify-center bg-gray-200 dark:bg-gray-700',
          className
        )}
      >
        <span className="text-gray-500 dark:text-gray-400 text-sm">
          Failed to load image
        </span>
      </div>
    );
  }

  return (
    <div className={cn('relative overflow-hidden', className)}
      {imageLoading && placeholder && (
        <img src={placeholder}
          alt={alt}
          className={cn(
            'absolute inset-0 w-full h-full object-cover filter blur-sm',
            'animate-pulse'
          )} />
      )}
      <img ref={imgRef}
        src={imageSrc || placeholder}
        alt={alt}
        className={cn(
          'w-full h-full object-cover transition-opacity duration-300',
          imageLoading ? 'opacity-0' : 'opacity-100'
        )} />
    </div>
  );
};

// Skeleton loader for images
export const ImageSkeleton: React.FC<{ className?: string } = ({ className }) => {
  return (
    <div className={cn(
        'animate-pulse bg-gray-200 dark:bg-gray-700 rounded',
        className
      )} />
  );
};