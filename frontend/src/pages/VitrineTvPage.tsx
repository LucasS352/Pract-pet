import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface VitrineSlide {
  slideType?: 'single';
  productId: string;
  productName: string;
  imageUrl: string | null;
  priceSell: number;
  promoPrice: number | null;
  badge: string | null;
  duration?: number;
  order: number;
}

interface GridProduct {
  productId: string;
  productName: string;
  imageUrl: string | null;
  priceSell: number;
  promoPrice: number | null;
}

interface VitrineGridSlide {
  slideType: 'grid';
  gridId: string;
  order: number;
  gridTitle: string;
  gridSubtitle?: string;
  gridEmoji?: string;
  gridBadge?: string | null;
  duration?: number;
  gridProducts: GridProduct[];
}

type AnySlide = VitrineSlide | VitrineGridSlide;

interface VitrineData {
  active: boolean;
  version: number;
  theme: string;
  customBgUrl: string | null;
  showLogo: boolean;
  logoUrl: string | null;
  instagramHandle?: string | null;
  slideDuration: number;
  gridSlideDuration: number;
  slides: AnySlide[];
}



function resolveImageUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('http')) {
    try { return new URL(url).pathname; } catch { return url; }
  }
  return url.startsWith('/') ? url : '/' + url;
}

// ─── Temas ────────────────────────────────────────────────────────────────────
const THEMES: Record<string, {
  bg: string;
  accent: string;
  accentSecondary: string;
  text: string;
  isLight?: boolean;
}> = {
  dark_premium:     { bg: 'radial-gradient(ellipse at 20% 50%,#1a1200 0%,#0d0d0d 60%,#000 100%)',         accent: '#f5c518', accentSecondary: '#ff9800', text: '#fff' },
  neon_night:       { bg: 'linear-gradient(135deg,#0a0015 0%,#05001a 50%,#000a1a 100%)',                  accent: '#00f5ff', accentSecondary: '#ff00ff', text: '#fff' },
  gradient_sunset:  { bg: 'linear-gradient(135deg,#1a0533 0%,#6b1a3d 40%,#c0392b 70%,#e67e22 100%)',     accent: '#ffdd57', accentSecondary: '#ff6b35', text: '#fff' },
  gradient_ocean:   { bg: 'linear-gradient(135deg,#000d1a 0%,#003366 40%,#006994 70%,#00b4d8 100%)',     accent: '#7df9ff', accentSecondary: '#00d4ff', text: '#fff' },
  light_clean:      { bg: 'linear-gradient(135deg,#f0f4ff 0%,#e8f0fe 50%,#dce8ff 100%)',                  accent: '#2563eb', accentSecondary: '#7c3aed', text: '#1a1a2e', isLight: true },
  dark_glass:       { bg: 'linear-gradient(135deg,#0d0d0d 0%,#1a1a2e 50%,#16213e 100%)',                  accent: '#a78bfa', accentSecondary: '#818cf8', text: '#fff' },
  forest_green:     { bg: 'linear-gradient(135deg,#0a1a0a 0%,#1a3a1a 40%,#0d2b0d 100%)',                  accent: '#4ade80', accentSecondary: '#86efac', text: '#fff' },
  fire_red:         { bg: 'linear-gradient(135deg,#1a0000 0%,#4a0000 40%,#8b0000 70%,#c0392b 100%)',     accent: '#ff6b35', accentSecondary: '#ff9500', text: '#fff' },
  purple_luxury:    { bg: 'linear-gradient(135deg,#0d0010 0%,#1a0030 40%,#2d0050 70%,#4a0080 100%)',     accent: '#d4af37', accentSecondary: '#f4c842', text: '#fff' },
  carbon_fiber:     { bg: 'repeating-linear-gradient(45deg,#0a0a0a 0px,#0a0a0a 2px,#111 2px,#111 4px)', accent: '#e2e8f0', accentSecondary: '#94a3b8', text: '#fff' },
};

// ─── Partículas ───────────────────────────────────────────────────────────────
const PARTICLES = Array.from({ length: 20 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  size: Math.random() * 4 + 2,
  duration: Math.random() * 12 + 8,
  delay: Math.random() * 10,
  opacity: Math.random() * 0.35 + 0.1,
}));

function formatPrice(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const POLL_INTERVAL = 30_000;

// ─── Helper Title Case inteligente para produtos ──────────────────────────────
function formatProductName(str: string): string {
  if (!str) return '';
  const lowerWords = ['de', 'do', 'da', 'dos', 'das', 'e', 'em', 'com', 'sem', 'para', 'por', 'a', 'o', 'as', 'os', 'no', 'na', 'nos', 'nas', '|'];
  return str
    .toLowerCase()
    .split(' ')
    .map((word, i) => {
      if (!word) return '';
      // Preserva unidades de medida (110g, 350ml, 1l, 40g, 75g, 100,8g, 300ml)
      if (/^\d+([,\.]\d+)?[a-zA-Z]+$/i.test(word)) {
        return word.toUpperCase();
      }
      if (i > 0 && lowerWords.includes(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

// ─── GridProductCard — Card Unificado Tabloide Moderno ────────────────────────
function GridProductCard({ product, theme, delay }: { product: GridProduct; theme: any; delay: number }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const src = product.imageUrl ? resolveImageUrl(product.imageUrl) : null;
  const displayPrice = product.promoPrice ?? product.priceSell;
  const hasPromo = product.promoPrice != null;
  const formattedPrice = formatPrice(displayPrice);
  const [integers, cents] = formattedPrice.split(',');

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      background: 'rgba(12, 10, 16, 0.72)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderRadius: 22,
      border: `1.5px solid ${theme.accent}33`,
      boxShadow: [
        `0 10px 30px rgba(0,0,0,0.5)`,
        `0 0 25px ${theme.accent}18`,
        `inset 0 1px 0 rgba(255,255,255,0.08)`,
      ].join(', '),
      animation: 'fadeUp .5s ease both',
      animationDelay: `${delay}s`,
      opacity: 0,
      overflow: 'hidden',
      height: '100%',
    }}>
      {/* 1. Topo Unificado: Área da Imagem com Fundo Branco de ponta a ponta */}
      <div style={{
        width: '100%',
        flex: '1 1 0',
        minHeight: 0,
        background: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(10px, 1.4vw, 18px)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {src ? (
          <img
            src={src}
            alt={product.productName}
            onLoad={() => setImgLoaded(true)}
            style={{
              maxHeight: '100%',
              maxWidth: '100%',
              objectFit: 'contain',
              opacity: imgLoaded ? 1 : 0,
              transition: 'opacity .3s ease',
              filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.15))',
            }}
          />
        ) : (
          <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth="1.8">
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>
          </svg>
        )}

        {/* Badge de Oferta sobre a imagem se houver promoção */}
        {hasPromo && (
          <div style={{
            position: 'absolute',
            top: 10,
            right: 10,
            background: '#e53e3e',
            color: '#ffffff',
            fontFamily: "'Inter', sans-serif",
            fontSize: 'clamp(9px, 0.9vw, 12px)',
            fontWeight: 900,
            letterSpacing: '0.08em',
            padding: '3px 10px',
            borderRadius: 999,
            boxShadow: '0 2px 10px rgba(229,62,62,0.5)',
            textTransform: 'uppercase',
          }}>
            OFERTA
          </div>
        )}
      </div>

      {/* 2. Linha Divisória de Luz sutil */}
      <div style={{
        width: '100%',
        height: 2,
        background: `linear-gradient(to right, transparent, ${theme.accent}99, transparent)`,
        boxShadow: `0 0 8px ${theme.accent}66`,
        flexShrink: 0,
      }} />

      {/* 3. Base do Card: Nome e Preço Protagonista */}
      <div style={{
        width: '100%',
        padding: 'clamp(8px, 1.1vw, 14px) clamp(10px, 1.3vw, 16px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(0,0,0,0.55)',
        flexShrink: 0,
      }}>
        {/* Nome do Produto em Title Case e peso balanceado */}
        <div style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 'clamp(12px, 1.3vw, 17px)',
          fontWeight: 600,
          textAlign: 'center',
          color: 'rgba(255,255,255,0.92)',
          lineHeight: 1.2,
          marginBottom: 'clamp(5px, 0.7vw, 9px)',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          minHeight: '2.4em',
        }}>
          {formatProductName(product.productName)}
        </div>

        {/* Preço Protagonista com Hierarquia Tabloide */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: '100%',
        }}>
          {hasPromo && (
            <div style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 'clamp(9px, 1vw, 12px)',
              fontWeight: 600,
              opacity: 0.55,
              textDecoration: 'line-through',
              color: '#ffffff',
              marginBottom: 1,
            }}>
              DE R$ {formatPrice(product.priceSell)}
            </div>
          )}

          {/* Pod de Preço Iluminado */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            background: 'rgba(255,255,255,0.06)',
            border: `1px solid ${theme.accent}44`,
            borderRadius: 999,
            padding: '2px clamp(12px, 1.5vw, 20px)',
            boxShadow: `0 0 16px ${theme.accent}22`,
          }}>
            {/* R$ */}
            <span style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 'clamp(11px, 1.3vw, 16px)',
              fontWeight: 900,
              color: theme.accent,
              marginRight: 3,
              marginTop: 'clamp(3px, 0.4vw, 6px)',
              lineHeight: 1,
            }}>
              R$
            </span>

            {/* Inteiro Gigante */}
            <span style={{
              fontFamily: "'Bebas Neue', 'Outfit', sans-serif",
              fontSize: 'clamp(28px, 4vw, 50px)',
              color: theme.accent,
              lineHeight: 0.88,
              letterSpacing: '0.01em',
              textShadow: `0 0 20px ${theme.accent}99`,
            }}>
              {integers}
            </span>

            {/* Centavos Sobrescritos */}
            <span style={{
              fontFamily: "'Bebas Neue', 'Outfit', sans-serif",
              fontSize: 'clamp(15px, 2.1vw, 26px)',
              color: theme.accent,
              lineHeight: 0.88,
              marginTop: 'clamp(2px, 0.3vw, 5px)',
              marginLeft: 1,
            }}>
              ,{cents || '00'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── GridSlide — slide de múltiplos produtos por categoria ────────────────────
function GridSlide({ slide, theme }: { slide: VitrineGridSlide; theme: any }) {
  const count = slide.gridProducts.length;
  const cols = count <= 2 ? 2 : count <= 3 ? 3 : count <= 4 ? 2 : 3;
  const subtitle = slide.gridSubtitle || '• SELEÇÃO ESPECIAL •';

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header categoria — Tipografia Premium (Sem emojis) */}
      <div style={{
        textAlign: 'center',
        marginBottom: 'clamp(14px, 2vw, 30px)',
        animation: 'fadeUp .5s ease both',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}>
        {/* Micro-Tag Superior */}
        <div style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 'clamp(10px, 1.1vw, 15px)',
          fontWeight: 800,
          letterSpacing: '0.3em',
          color: theme.accent,
          textTransform: 'uppercase',
          marginBottom: 4,
          opacity: 0.95,
          textShadow: `0 0 16px ${theme.accent}66`,
        }}>
          {subtitle}
        </div>

        {/* Título Principal Imponente */}
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 'clamp(32px, 5.2vw, 68px)',
          letterSpacing: '0.08em',
          color: theme.text,
          textShadow: `0 4px 24px rgba(0,0,0,0.8), 0 0 40px ${theme.accent}44`,
          lineHeight: 0.95,
          textTransform: 'uppercase',
        }}>
          {slide.gridTitle}
        </div>

        {/* Badge Promocional Refinado */}
        {slide.gridBadge && (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: `1.5px solid ${theme.accent}`,
            color: '#ffffff',
            fontSize: 'clamp(9px, 1vw, 13px)',
            fontFamily: "'Inter', sans-serif",
            fontWeight: 800,
            letterSpacing: '0.25em',
            padding: '4px 18px',
            borderRadius: 999,
            marginTop: 8,
            textTransform: 'uppercase',
            boxShadow: `0 0 20px ${theme.accent}33`,
          }}>
            <span style={{ color: theme.accent }}>⚡</span> {slide.gridBadge}
          </div>
        )}

        {/* Linha de Luz Divisória */}
        <div style={{
          width: '40%', height: 2, margin: 'clamp(10px, 1.2vw, 16px) auto 0',
          background: `linear-gradient(to right, transparent, ${theme.accent}88, transparent)`,
          boxShadow: `0 0 10px ${theme.accent}44`,
        }} />
      </div>

      {/* Grade de produtos */}
      <div style={{
        flex: 1, display: 'grid',
        gridTemplateColumns: `repeat(${cols},1fr)`,
        gap: 'clamp(8px,1.2vw,18px)',
        alignContent: 'stretch',
        minHeight: 0,
      }}>
        {slide.gridProducts.map((product, idx) => (
          <GridProductCard key={product.productId} product={product} theme={theme} delay={idx * 0.07} />
        ))}
      </div>
    </div>
  );
}


// ─── Componente: Logo ─────────────────────────────────────────────────────────
function LogoImage({ src }: { src: string }) {
  const displaySrc = resolveImageUrl(src);
  if (!displaySrc) return null;
  return (
    <div style={{ position: 'absolute', top: 24, left: 24, zIndex: 20, height: 72 }}>
      <img
        src={displaySrc}
        alt="Logo"
        style={{
          height: 72,
          maxWidth: 200,
          objectFit: 'contain',
          filter: 'drop-shadow(0 2px 16px rgba(0,0,0,0.7))',
        }}
      />
    </div>
  );
}

// ─── Produto em glass card premium ───────────────────────────────────────────
// Exibe imagem dentro de um card glass com fundo escuro semitransparente.
// Resolve definitivamente imagens com fundo branco/creme conectado ao produto
// (ex: Bis Branco): qualquer área transparente mostra o escuro do card, não o
// gradiente colorido do tema. Resultado sempre limpo e profissional.
function ProductImage({ src, alt, accent, isLight }: { src: string; alt: string; accent: string; isLight?: boolean }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  // Glass card com imagem original — sem processamento canvas.
  // O card escuro semitransparente cria o contexto visual premium
  // sem precisar remover o fundo (que causava artefatos no Bis Branco).
  const displaySrc = resolveImageUrl(src);

  const cardBg = isLight
    ? 'rgba(220,230,255,0.35)'
    : 'rgba(0,0,0,0.42)';
  const cardBorder = isLight
    ? `1.5px solid ${accent}55`
    : `1.5px solid ${accent}44`;

  return (
    <div style={{
      animation: 'productFloat 5s ease-in-out infinite',
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      {/* Glow externo pulsante */}
      <div style={{
        position: 'absolute',
        inset: -36,
        borderRadius: 32,
        background: `radial-gradient(ellipse at center, ${accent}40 0%, transparent 65%)`,
        animation: 'glowPulse 4s ease-in-out infinite',
        pointerEvents: 'none',
        filter: 'blur(8px)',
      }} />

      {/* Glass card */}
      <div style={{
        position: 'relative',
        background: cardBg,
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        borderRadius: 24,
        border: cardBorder,
        boxShadow: [
          `0 0 0 1px rgba(255,255,255,0.07)`,
          `0 0 50px ${accent}44`,
          `0 32px 80px rgba(0,0,0,0.55)`,
          `inset 0 1px 0 rgba(255,255,255,0.14)`,
        ].join(', '),
        padding: '18px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        maxWidth: '66vw',
        maxHeight: '40vh',
        minWidth: 200,
        minHeight: 120,
        overflow: 'hidden',
      }}>
        {/* Shimmer de loading */}
        {!imgLoaded && (
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 24,
            background: `linear-gradient(90deg, transparent 25%, ${accent}15 50%, transparent 75%)`,
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite',
          }} />
        )}

        {displaySrc && (
          <img
            src={displaySrc}
            alt={alt}
            onLoad={() => setImgLoaded(true)}
            style={{
              maxHeight: 'calc(40vh - 36px)',
              maxWidth: 'calc(66vw - 48px)',
              objectFit: 'contain',
              borderRadius: 14,
              opacity: imgLoaded ? 1 : 0,
              transition: 'opacity 0.4s ease',
              filter: `drop-shadow(0 8px 28px ${accent}66)`,
              position: 'relative',
              zIndex: 1,
            }}
          />
        )}
      </div>

      {/* Reflexo sutil abaixo do card */}
      <div style={{
        position: 'absolute',
        bottom: -18,
        left: '10%',
        right: '10%',
        height: 18,
        background: `radial-gradient(ellipse at center, ${accent}30 0%, transparent 70%)`,
        filter: 'blur(6px)',
        pointerEvents: 'none',
      }} />
    </div>
  );
}

// ─── Componente de Preço Estilo Tabloide / Supermercado Premium ──────────────
function TabloidPriceDisplay({
  price,
  accent,
  delay = '.4s',
}: {
  price: number;
  accent: string;
  delay?: string;
}) {
  const formatted = formatPrice(price);
  const [integers, cents] = formatted.split(',');

  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        animation: 'dropPrice .7s cubic-bezier(.34,1.56,.64,1) both',
        animationDelay: delay,
        opacity: 0,
      }}
    >
      {/* Glow de fundo do preço */}
      <div
        style={{
          position: 'absolute',
          inset: '-20px -40px',
          background: `radial-gradient(ellipse at center, ${accent}44 0%, transparent 70%)`,
          filter: 'blur(18px)',
          pointerEvents: 'none',
        }}
      />

      {/* Símbolo R$ */}
      <div
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 'clamp(22px, 3.4vw, 48px)',
          fontWeight: 900,
          color: accent,
          marginRight: 'clamp(4px, 0.6vw, 10px)',
          marginTop: 'clamp(8px, 1.4vw, 22px)',
          letterSpacing: '0.05em',
          textShadow: `0 0 24px ${accent}aa`,
          lineHeight: 1,
        }}
      >
        R$
      </div>

      {/* Inteiros Gigantescos */}
      <div
        style={{
          fontFamily: "'Bebas Neue', 'Outfit', sans-serif",
          fontSize: 'clamp(96px, 15vw, 210px)',
          lineHeight: 0.85,
          color: accent,
          letterSpacing: '-0.02em',
          textShadow: `0 0 40px ${accent}cc, 0 0 90px ${accent}66, 0 8px 30px rgba(0,0,0,0.95)`,
        }}
      >
        {integers}
      </div>

      {/* Centavos Sobrescritos */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          marginLeft: 'clamp(2px, 0.4vw, 6px)',
          marginTop: 'clamp(6px, 1.1vw, 18px)',
        }}
      >
        <div
          style={{
            fontFamily: "'Bebas Neue', 'Outfit', sans-serif",
            fontSize: 'clamp(48px, 7.5vw, 105px)',
            lineHeight: 0.85,
            color: accent,
            letterSpacing: '0.02em',
            textShadow: `0 0 35px ${accent}bb, 0 0 70px ${accent}55`,
          }}
        >
          ,{cents || '00'}
        </div>
      </div>
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────
export default function VitrineTvPage() {
  const { tvPublicId } = useParams<{ tvPublicId: string }>();

  const [data, setData] = useState<VitrineData | null>(null);
  const [inactive, setInactive] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [slidePhase, setSlidePhase] = useState<'entering' | 'visible' | 'leaving'>('entering');
  const [error, setError] = useState(false);

  const versionRef = useRef<number>(-1);
  const etagRef = useRef<string>('');
  const slidesRef = useRef<VitrineSlide[]>([]);
  const phaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch ────────────────────────────────────────────────────────────────────
  const fetchPlaylist = useCallback(async (isFirstLoad = false) => {
    if (!tvPublicId) return;
    try {
      const headers: Record<string, string> = {};
      if (!isFirstLoad && etagRef.current) headers['If-None-Match'] = etagRef.current;
      const res = await fetch(`${API_BASE}/vitrine/public/${tvPublicId}`, { headers });
      if (res.status === 304) return;
      const json = await res.json();
      if (!json.active) { setInactive(true); setData(null); return; }
      const newEtag = res.headers.get('etag') || `"v${json.version}"`;
      etagRef.current = newEtag;
      if (json.version !== versionRef.current) {
        versionRef.current = json.version;
        const sorted = [...(json.slides || [])].sort((a, b) => a.order - b.order);
        slidesRef.current = sorted;
        setData(json);
        setInactive(false);
        setError(false);
        if (isFirstLoad) { setCurrentIndex(0); setSlidePhase('entering'); }
      }
    } catch {
      if (isFirstLoad) setError(true);
    }
  }, [tvPublicId]);

  useEffect(() => {
    fetchPlaylist(true);
    pollTimerRef.current = setInterval(() => fetchPlaylist(false), POLL_INTERVAL);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
    };
  }, [fetchPlaylist]);

  // ── Slideshow ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!data?.slides?.length) return;
    if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
    // Duração depende do tipo do slide atual
    const allSlides = slidesRef.current.length > 0 ? slidesRef.current : data.slides;
    const currentSlide = allSlides[currentIndex % Math.max(1, allSlides.length)];
    const isGrid = currentSlide?.slideType === 'grid';
    const customDuration = (currentSlide as any)?.duration;
    const duration = (customDuration || (isGrid ? (data.gridSlideDuration || 15) : (data.slideDuration || 8))) * 1000;
    const ENTER = 800, LEAVE = 600;

    if (slidePhase === 'entering') {
      phaseTimerRef.current = setTimeout(() => setSlidePhase('visible'), ENTER);
    } else if (slidePhase === 'visible') {
      phaseTimerRef.current = setTimeout(() => setSlidePhase('leaving'), duration - ENTER - LEAVE);
    } else if (slidePhase === 'leaving') {
      phaseTimerRef.current = setTimeout(() => {
        const slides = slidesRef.current.length > 0 ? slidesRef.current : data.slides;
        setCurrentIndex(prev => (prev + 1) % slides.length);
        setSlidePhase('entering');
      }, LEAVE);
    }
  }, [slidePhase, data, currentIndex]);

  const handleClick = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  };

  if (error) return (
    <div style={{ background: '#050505', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', fontFamily: 'sans-serif', color: '#333' }}>
      <div style={{ fontSize: 64 }}>📺</div>
      <div style={{ marginTop: 12 }}>Vitrine não encontrada</div>
    </div>
  );

  if (inactive || !data) return (
    <div onClick={handleClick} style={{ background: '#050505', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', cursor: 'pointer' }}>
      {inactive && <><div style={{ fontSize: 64, opacity: 0.15 }}>📺</div><div style={{ color: '#222', fontSize: 14, marginTop: 12, letterSpacing: 4, fontFamily: 'sans-serif' }}>VITRINE PAUSADA</div></>}
    </div>
  );

  const theme = THEMES[data.theme] || THEMES.dark_premium;
  const slides = slidesRef.current.length > 0 ? slidesRef.current : data.slides;
  const slide = slides[currentIndex % slides.length];
  const isGridSlide = slide?.slideType === 'grid';
  const singleSlide = isGridSlide ? null : slide as VitrineSlide;
  const nextSlides = slides.filter((_, i) => i !== currentIndex % slides.length).slice(0, 4);
  const hasPromo = !isGridSlide && singleSlide?.promoPrice != null;
  const discount = hasPromo ? Math.round((1 - singleSlide!.promoPrice! / singleSlide!.priceSell) * 100) : 0;
  const currentDuration = (slide as any)?.duration || (isGridSlide ? (data.gridSlideDuration || 15) : (data.slideDuration || 8));

  const isEntering = slidePhase === 'entering';
  const isLeaving = slidePhase === 'leaving';
  const background = data.customBgUrl ? `url(${data.customBgUrl}) center/cover no-repeat` : theme.bg;

  return (
    <div
      onClick={handleClick}
      style={{
        background,
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        fontFamily: "'Bebas Neue', 'Segoe UI', sans-serif",
        color: theme.text,
        cursor: 'none',
        position: 'relative',
        userSelect: 'none',
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;600;700;800;900&display=swap');

        @keyframes floatUp {
          0%   { transform:translateY(100vh) scale(0.5); opacity:0; }
          10%  { opacity:var(--op); }
          90%  { opacity:var(--op); }
          100% { transform:translateY(-20vh) scale(1.2); opacity:0; }
        }
        @keyframes productFloat {
          0%,100% { transform:translateY(0px); }
          50%      { transform:translateY(-20px); }
        }
        @keyframes glowPulse {
          0%,100% { transform:translate(-50%,-60%) scale(1); opacity:.5; }
          50%      { transform:translate(-50%,-60%) scale(1.15); opacity:.9; }
        }
        @keyframes badgePop {
          0%   { transform:scale(0) rotate(-12deg); opacity:0; }
          60%  { transform:scale(1.2) rotate(4deg); }
          80%  { transform:scale(0.95); }
          100% { transform:scale(1) rotate(0); opacity:1; }
        }
        @keyframes wipeRight {
          from { clip-path:inset(0 100% 0 0); opacity:0; }
          to   { clip-path:inset(0 0% 0 0); opacity:1; }
        }
        @keyframes dropPrice {
          0%   { opacity:0; transform:translateY(-50px) scale(1.2); }
          60%  { transform:translateY(6px) scale(0.98); }
          100% { opacity:1; transform:translateY(0) scale(1); }
        }
        @keyframes fadeUp {
          from { opacity:0; transform:translateY(20px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes discountSpin {
          0%   { transform:scale(0) rotate(-30deg); opacity:0; }
          70%  { transform:scale(1.1) rotate(5deg); }
          100% { transform:scale(1) rotate(0); opacity:1; }
        }
        @keyframes scanLine {
          0%   { top:-2px; }
          100% { top:101%; }
        }
        @keyframes progressFill {
          from { width:0%; }
          to   { width:100%; }
        }
        @keyframes pulse {
          0%,100% { opacity:.3; }
          50%      { opacity:.6; }
        }
        @keyframes shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
        * { box-sizing:border-box; }
      `}</style>

      {/* overlay de fundo customizado */}
      {data.customBgUrl && <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.38)', pointerEvents:'none' }} />}

      {/* Partículas */}
      {!theme.isLight && PARTICLES.map(p => (
        <div key={p.id} style={{
          position:'absolute', left:`${p.x}%`, bottom:'-8px',
          width:`${p.size}px`, height:`${p.size}px`, borderRadius:'50%',
          background:theme.accent, '--op': p.opacity,
          opacity: p.opacity,
          animation:`floatUp ${p.duration}s ${p.delay}s ease-in-out infinite`,
          pointerEvents:'none',
        } as any} />
      ))}

      {/* Scan line */}
      {!theme.isLight && (
        <div style={{
          position:'absolute', left:0, right:0, height:2,
          background:`linear-gradient(to right,transparent,${theme.accent}55,transparent)`,
          animation:'scanLine 8s linear infinite',
          pointerEvents:'none', zIndex:1,
        }} />
      )}

      {/* Logo da loja — processado com remoção de fundo */}
      {data.showLogo && data.logoUrl && (
        <LogoImage src={data.logoUrl} />
      )}

      {/* Instagram da Loja */}
      {data.instagramHandle && (
        <div style={{
          position: 'absolute',
          top: 24,
          right: (!isGridSlide && singleSlide?.badge) ? (hasPromo && discount >= 5 ? 190 : 130) : 24,
          zIndex: 22,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1.5px solid rgba(255,255,255,0.18)',
          borderRadius: 999,
          padding: '6px 16px 6px 8px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5), 0 0 16px rgba(225,48,108,0.25)',
          animation: 'fadeUp .6s ease both',
        }}>
          <img
            src="/instagram-icon.png"
            alt="Instagram"
            style={{
              width: 26,
              height: 26,
              borderRadius: 6,
              objectFit: 'contain',
              filter: 'drop-shadow(0 2px 8px rgba(225,48,108,0.6))',
            }}
          />
          <span style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 'clamp(13px, 1.4vw, 19px)',
            fontWeight: 800,
            color: '#ffffff',
            letterSpacing: '0.02em',
            textShadow: '0 2px 8px rgba(0,0,0,0.8)',
          }}>
            {data.instagramHandle.startsWith('@') ? data.instagramHandle : `@${data.instagramHandle}`}
          </span>
        </div>
      )}

      {/* Badge superior — apenas para slides individuais */}
      {!isGridSlide && singleSlide?.badge && (
        <div key={`badge-${currentIndex}`} style={{
          position:'absolute', top:22, right:22, zIndex:20,
          background:`linear-gradient(135deg,${theme.accent},${theme.accentSecondary})`,
          color:'#000', fontFamily:"'Bebas Neue',sans-serif",
          fontSize:'clamp(16px,2.2vw,28px)', letterSpacing:3,
          padding:'8px 24px', borderRadius:999,
          boxShadow:`0 0 32px ${theme.accent}88`,
          animation:'badgePop .7s cubic-bezier(.34,1.56,.64,1) both',
          animationDelay:'.35s', opacity:0,
        }}>
          ⚡ {singleSlide.badge}
        </div>
      )}

      {/* Badge de desconto circular */}
      {!isGridSlide && hasPromo && discount >= 5 && (
        <div key={`disc-${currentIndex}`} style={{
          position:'absolute', top: singleSlide?.badge ? 74 : 22,
          right: singleSlide?.badge ? 90 : 22, zIndex:20,
          width:78, height:78, borderRadius:'50%',
          background:'#e53e3e', color:'#fff',
          display:'flex', flexDirection:'column',
          alignItems:'center', justifyContent:'center',
          fontFamily:"'Bebas Neue',sans-serif",
          boxShadow:'0 0 24px rgba(229,62,62,.7)',
          animation:'discountSpin .6s cubic-bezier(.34,1.56,.64,1) both',
          animationDelay:'.6s', opacity:0,
        }}>
          <div style={{ fontSize:28, lineHeight:1 }}>{discount}%</div>
          <div style={{ fontSize:10, fontFamily:'Inter,sans-serif', fontWeight:700, letterSpacing:1 }}>OFF</div>
        </div>
      )}

      {/* ── SLIDE ── */}
      <div
        key={`slide-${currentIndex}`}
        style={{
          position:'absolute', inset:0,
          display:'flex', flexDirection:'column',
          alignItems:'center', justifyContent: isGridSlide ? 'flex-start' : 'center',
          padding: isGridSlide ? '70px 48px 110px' : '100px 60px 150px',
          opacity: isEntering ? 0 : isLeaving ? 0 : 1,
          transform: isEntering ? 'scale(1.05)' : isLeaving ? 'scale(0.96)' : 'scale(1)',
          filter: isEntering ? 'blur(6px)' : isLeaving ? 'blur(3px)' : 'blur(0)',
          transition: (isEntering || isLeaving)
            ? 'opacity .85s ease, transform .85s ease, filter .85s ease'
            : 'none',
        }}
      >
        {isGridSlide && <GridSlide slide={slide as VitrineGridSlide} theme={theme} />}
        {!isGridSlide && (<>
        {/* Spotlight */}
        <div style={{
          position:'absolute', width:'52vw', height:'52vw', borderRadius:'50%',
          background:`radial-gradient(circle,${theme.accent}28 0%,${theme.accentSecondary}12 40%,transparent 70%)`,
          animation:'glowPulse 4s ease-in-out infinite',
          pointerEvents:'none', top:'50%', left:'50%',
        }} />

        {/* Imagem */}
        {singleSlide?.imageUrl ? (
          <ProductImage
            src={singleSlide.imageUrl}
            alt={singleSlide.productName}
            accent={theme.accent}
            isLight={theme.isLight}
          />
        ) : (
          <div style={{
            width:180, height:180, borderRadius:32,
            background:`${theme.accent}1A`, border:`2px solid ${theme.accent}44`,
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:80,
          }}>🍺</div>
        )}

        {/* Divisória */}
        <div style={{
          width:'55%', height:2, margin:'20px 0 14px',
          background:`linear-gradient(to right,transparent,${theme.accent}88,transparent)`,
          animation:'fadeUp .5s ease both', animationDelay:'.2s', opacity:0,
        }} />

        {/* Nome */}
        <div style={{
          textAlign:'center', width:'100%', marginBottom:12, padding:'0 40px',
        }}>
          <div style={{
            fontFamily:"'Bebas Neue',sans-serif",
            fontSize: (singleSlide?.productName.length || 0) > 40
              ? 'clamp(26px,3.8vw,54px)'
              : (singleSlide?.productName.length || 0) > 25
              ? 'clamp(30px,4.5vw,64px)'
              : 'clamp(34px,5.2vw,76px)',
            lineHeight:1.1, letterSpacing:'0.03em',
            textTransform:'uppercase',
            wordBreak:'break-word',
            overflowWrap:'break-word',
            textShadow:`0 0 60px ${theme.accent}55, 0 4px 12px rgba(0,0,0,.5)`,
            color: theme.text,
            animation:'fadeUp .7s cubic-bezier(.16,1,.3,1) both',
            animationDelay:'.15s', opacity:0,
          }}>
            {singleSlide?.productName}
          </div>
        </div>

        {/* Preço */}
        <div style={{ textAlign: 'center', marginTop: 4 }}>
          {hasPromo ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: 'rgba(239, 68, 68, 0.18)',
                border: '1px solid rgba(239, 68, 68, 0.45)',
                color: '#ff8888',
                fontFamily: "'Inter', sans-serif",
                fontSize: 'clamp(12px, 1.4vw, 20px)',
                fontWeight: 700,
                padding: '3px 16px',
                borderRadius: 999,
                marginBottom: 6,
                animation: 'fadeUp .4s ease both',
                animationDelay: '.35s',
                opacity: 0,
              }}>
                <span style={{ textDecoration: 'line-through', opacity: 0.85 }}>DE R$ {formatPrice(singleSlide!.priceSell)}</span>
              </div>
              <div style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 'clamp(10px, 1.1vw, 15px)',
                fontWeight: 900,
                letterSpacing: 4,
                color: theme.accent,
                textTransform: 'uppercase',
                marginBottom: 6,
                animation: 'fadeUp .4s ease both',
                animationDelay: '.45s',
                opacity: 0,
                textShadow: `0 0 12px ${theme.accent}66`,
              }}>
                • POR APENAS •
              </div>
              <TabloidPriceDisplay
                price={singleSlide!.promoPrice!}
                accent={theme.accent}
                delay=".55s"
              />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 'clamp(10px, 1.1vw, 15px)',
                fontWeight: 900,
                letterSpacing: 4,
                color: theme.accent,
                textTransform: 'uppercase',
                marginBottom: 6,
                animation: 'fadeUp .4s ease both',
                animationDelay: '.3s',
                opacity: 0,
                textShadow: `0 0 12px ${theme.accent}66`,
              }}>
                • APENAS •
              </div>
              <TabloidPriceDisplay
                price={singleSlide!.priceSell}
                accent={theme.accent}
                delay=".4s"
              />
            </div>
          )}
        </div>
        </>)}
      </div>

      {/* ── A SEGUIR ── */}
      {nextSlides.length > 0 && (
        <div style={{
          position:'absolute', bottom:0, left:0, right:0, height:100,
          display:'flex', alignItems:'center', gap:10, padding:'0 24px',
          background:'linear-gradient(to top,rgba(0,0,0,.72) 0%,transparent 100%)',
          backdropFilter:'blur(4px)',
        }}>
          <div style={{
            fontFamily:'Inter,sans-serif', fontSize:9, fontWeight:800,
            letterSpacing:3, color:theme.accent, opacity:.8,
            textTransform:'uppercase', whiteSpace:'nowrap',
            borderRight:`1px solid ${theme.accent}44`, paddingRight:10, marginRight:4,
          }}>
            A SEGUIR
          </div>

          {nextSlides.map((s, idx) => {
            const k = s.slideType === 'grid' ? (s as VitrineGridSlide).gridId : (s as VitrineSlide).productId;
            return <NextSlideThumb key={k} slide={s} theme={theme} idx={idx} />;
          })}

          {slides.length > 5 && (
            <div style={{ fontFamily:'Inter,sans-serif', fontSize:10, color:'rgba(255,255,255,.25)', whiteSpace:'nowrap' }}>
              +{slides.length - 5} produtos
            </div>
          )}
        </div>
      )}

      {/* Barra de progresso */}
      <div style={{ position:'absolute', bottom:0, left:0, right:0, height:3, background:'rgba(255,255,255,.08)', zIndex:50 }}>
        {slidePhase === 'visible' && (
          <div style={{
            height:'100%',
            background:`linear-gradient(to right,${theme.accent},${theme.accentSecondary})`,
            animation:`progressFill ${currentDuration}s linear both`,
            boxShadow:`0 0 8px ${theme.accent}`,
          }} />
        )}
      </div>

      {/* ── Logo TELTECH fixo no cantinho inferior direito ── */}
      <div style={{
        position: 'absolute',
        bottom: 18,
        right: 24,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1.5px solid rgba(255,255,255,0.18)',
        borderRadius: 16,
        padding: '7px 16px 7px 10px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 20px rgba(0,120,255,0.2)',
        userSelect: 'none',
        pointerEvents: 'none',
      }}>
        <img
          src="/teltech-logo.png"
          alt="Teltech"
          style={{
            height: 32,
            width: 'auto',
            objectFit: 'contain',
            filter: 'drop-shadow(0 2px 10px rgba(0,180,255,0.5))',
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <span style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            fontWeight: 900,
            color: '#ffffff',
            letterSpacing: 2,
            lineHeight: 1.1,
            textShadow: '0 2px 8px rgba(0,0,0,0.8)',
          }}>
            TELTECH
          </span>
          <span style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 8.5,
            fontWeight: 800,
            color: theme.accent,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            marginTop: 2,
          }}>
            SISTEMAS
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Miniatura "A seguir" ─────────────────────────────────────────────────────
function NextSlideThumb({ slide, theme, idx }: { slide: AnySlide; theme: any; idx: number }) {
  const isGrid = slide.slideType === 'grid';

  if (isGrid) {
    const g = slide as VitrineGridSlide;
    return (
      <div style={{
        display:'flex', alignItems:'center', gap:10,
        background:'rgba(255,255,255,.07)',
        border:'1px solid rgba(255,255,255,.14)',
        borderRadius:12, padding:'6px 14px 6px 8px',
        backdropFilter:'blur(12px)',
        WebkitBackdropFilter:'blur(12px)',
        boxShadow:'0 4px 16px rgba(0,0,0,0.3)',
        animation:`fadeUp .35s ease both`,
        animationDelay:`${idx * 0.08}s`,
        flexShrink:0,
      }}>
        {/* Ícone Vetorial de Grade em vez de emoji */}
        <div style={{
          width:42, height:42, borderRadius:8,
          background:`${theme.accent}1A`,
          border:`1.5px solid ${theme.accent}55`,
          display:'flex', alignItems:'center', justifyContent:'center',
          color: theme.accent,
          flexShrink:0,
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="7" height="7" x="3" y="3" rx="1.5" />
            <rect width="7" height="7" x="14" y="3" rx="1.5" />
            <rect width="7" height="7" x="14" y="14" rx="1.5" />
            <rect width="7" height="7" x="3" y="14" rx="1.5" />
          </svg>
        </div>
        <div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:15, letterSpacing:'0.04em', color:'rgba(255,255,255,.95)', maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', lineHeight: 1.1 }}>
            {g.gridTitle}
          </div>
          <div style={{ fontFamily:'Inter,sans-serif', fontSize:9, fontWeight:700, letterSpacing:'0.05em', color:theme.accent, textTransform:'uppercase', marginTop:2 }}>
            {g.gridProducts.length} itens em oferta
          </div>
        </div>
      </div>
    );
  }

  const s = slide as VitrineSlide;
  const imageSrc = resolveImageUrl(s.imageUrl || '');

  return (
    <div style={{
      display:'flex', alignItems:'center', gap:10,
      background:'rgba(255,255,255,.07)',
      border:'1px solid rgba(255,255,255,.14)',
      borderRadius:12, padding:'5px 12px 5px 6px',
      backdropFilter:'blur(12px)',
      WebkitBackdropFilter:'blur(12px)',
      boxShadow:'0 4px 16px rgba(0,0,0,0.3)',
      animation:`fadeUp .35s ease both`,
      animationDelay:`${idx * 0.08}s`,
      flexShrink:0,
    }}>
      {/* Pod Branco de Mini-Estúdio para Thumbnail (Zero artefatos de canvas) */}
      <div style={{
        width:42, height:42, borderRadius:8,
        display:'flex', alignItems:'center', justifyContent:'center',
        overflow:'hidden', flexShrink:0,
        background: '#ffffff',
        padding: 3,
        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.25)',
      }}>
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={s.productName}
            style={{ width:'100%', height:'100%', objectFit:'contain' }}
            loading="lazy"
          />
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>
          </svg>
        )}
      </div>
      <div>
        <div style={{
          fontFamily:'Inter,sans-serif',
          fontSize:11.5,
          fontWeight:700,
          color:'rgba(255,255,255,.92)',
          maxWidth:150,
          overflow:'hidden',
          textOverflow:'ellipsis',
          whiteSpace:'nowrap',
          lineHeight: 1.2,
        }}>
          {formatProductName(s.productName)}
        </div>
        <div style={{
          fontFamily:"'Bebas Neue',sans-serif",
          fontSize:16,
          color:theme.accent,
          letterSpacing:'.04em',
          lineHeight: 1.1,
          marginTop: 2,
        }}>
          R$ {formatPrice(s.promoPrice ?? s.priceSell)}
        </div>
      </div>
    </div>
  );
}
