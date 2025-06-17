'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'

interface OptimizedImageProps {
  src: string
  alt: string
  width?: number
  height?: number
  className?: string
  priority?: boolean
  placeholder?: 'blur' | 'empty'
  blurDataURL?: string
}

export function OptimizedImage({
  src,
  alt,
  width,
  height,
  className,
  priority = false,
  placeholder = 'blur',
  blurDataURL,
}: OptimizedImageProps) {
  const [isIntersecting, setIsIntersecting] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (priority || !ref.current) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsIntersecting(true)
          observer.disconnect()
        }
      },
      {
        // Start loading when image is 50px away from viewport
        rootMargin: '50px',
      }
    )

    observer.observe(ref.current)

    return () => {
      observer.disconnect()
    }
  }, [priority])

  const shouldLoad = priority || isIntersecting

  return (
    <div ref={ref} className={cn('relative', className)}>
      {shouldLoad ? (
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          className={className}
          priority={priority}
          placeholder={placeholder}
          blurDataURL={blurDataURL || undefined}
          loading={priority ? 'eager' : 'lazy'}
          quality={85}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        />
      ) : (
        <div
          className={cn(
            'animate-pulse bg-muted',
            className
          )}
          style={{
            width: width || '100%',
            height: height || 'auto',
            aspectRatio: width && height ? `${width} / ${height}` : undefined,
          }}
        />
      )}
    </div>
  )
}