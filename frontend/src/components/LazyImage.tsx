import { useEffect, useRef, useState, memo } from 'react';

/**
 * Componente de imagem otimizado para o PDV:
 * - Usa Intersection Observer para carregar imagens APENAS quando entram na tela
 * - Cache binário delegado ao navegador/PWA, sem Set global ilimitado
 * - Mostra placeholder de baixa qualidade (skeleton) enquanto carrega
 * - Evita múltiplas requisições para a mesma imagem
 */

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
}

const LazyImageContent = memo(({ src, alt, className }: LazyImageProps) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [inView, setInView] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setInView(true); return; }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '100px' } // Começa a carregar 100px antes de entrar na tela
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [src]);

  const handleLoad = () => {
    setLoaded(true);
  };

  const handleError = () => {
    setError(true);
    setLoaded(true);
  };

  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900 text-zinc-600 rounded-lg">
        <svg className="w-8 h-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
        </svg>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full relative">
      {/* Skeleton enquanto não carregou */}
      {!loaded && (
        <div className="absolute inset-0 bg-zinc-800 animate-pulse rounded-lg" />
      )}
      {inView && (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          className={`${className} transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={handleLoad}
          onError={handleError}
          decoding="async"
          loading="lazy"
          fetchPriority="low"
        />
      )}
    </div>
  );
});

// A new immutable URL must reset error/loading/visibility, even for the same product.
export const LazyImage = memo((props: LazyImageProps) => <LazyImageContent key={props.src} {...props} />);
LazyImageContent.displayName = 'LazyImageContent';
LazyImage.displayName = 'LazyImage';
