'use client';
import { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, Check } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  unit?: string;
  volumeUnit?: string | null;
  volumeCapacity?: number | null;
}

interface ProductSearchSelectProps {
  products: Product[];
  value: string;
  onChange: (productId: string) => void;
  placeholder?: string;
}

export function ProductSearchSelect({ products, value, onChange, placeholder = 'Selecione o produto...' }: ProductSearchSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Fecha o dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Foca o input de busca quando abre o dropdown
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearch('');
    }
  }, [isOpen]);

  const selectedProduct = products.find(p => p.id === value);

  // Filtragem dos produtos
  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative w-full" ref={containerRef}>
      {/* Botão Gatilho */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-zinc-950 border border-zinc-850 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 transition flex items-center justify-between text-left"
      >
        <span className={selectedProduct ? 'text-white font-medium' : 'text-zinc-500'}>
          {selectedProduct ? selectedProduct.name : placeholder}
        </span>
        <ChevronDown size={14} className="text-zinc-500 shrink-0 ml-1.5" />
      </button>

      {/* Dropdown Flutuante */}
      {isOpen && (
        <div className="absolute z-[120] left-0 mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-60 animate-in fade-in slide-in-from-top-1 duration-100">
          {/* Input de Busca */}
          <div className="p-2 border-b border-zinc-800 flex items-center gap-1.5 bg-zinc-950/60">
            <Search size={12} className="text-zinc-500 shrink-0 ml-1" />
            <input
              ref={searchInputRef}
              type="text"
              className="w-full bg-transparent text-xs text-white placeholder-zinc-500 focus:outline-none"
              placeholder="Digite para buscar..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && filteredProducts.length > 0) {
                  e.preventDefault();
                  onChange(filteredProducts[0].id);
                  setIsOpen(false);
                } else if (e.key === 'Escape') {
                  setIsOpen(false);
                }
              }}
            />
          </div>

          {/* Lista de Opções */}
          <div className="overflow-y-auto max-h-48 custom-scrollbar py-1">
            {filteredProducts.length === 0 ? (
              <p className="text-[11px] text-zinc-500 text-center py-3">Nenhum produto encontrado</p>
            ) : (
              filteredProducts.map(p => {
                const isSelected = p.id === value;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onChange(p.id);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-start justify-between px-3 py-2 text-left text-xs transition ${
                      isSelected 
                        ? 'bg-blue-600/20 text-blue-400 font-semibold' 
                        : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                    }`}
                  >
                    <span className="block whitespace-normal break-words pr-2 flex-1">{p.name}</span>
                    {isSelected && <Check size={12} className="text-blue-400 shrink-0 ml-2 mt-0.5" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
