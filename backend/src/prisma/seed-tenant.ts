import { PrismaClient } from '@prisma/client';

/**
 * Seed de Disk Bebidas — Catálogo Curado
 *
 * Contém apenas os produtos que REALMENTE vendem em um Disk Bebidas.
 * priceSell = 0 e priceCost = 0 intencionalmente — o cliente configura
 * os preços pela tela de "Lançamento de Produtos" ou "Edição em Massa".
 */

const prisma = new PrismaClient();

async function main() {
  // ── Categorias ──────────────────────────────────────────────────────────────
  const catCervejas    = await prisma.category.upsert({ where: { name: 'Cervejas' },        update: {}, create: { name: 'Cervejas' } });
  const catDestilados  = await prisma.category.upsert({ where: { name: 'Destilados' },      update: {}, create: { name: 'Destilados' } });
  const catEnergeticos = await prisma.category.upsert({ where: { name: 'Energéticos' },     update: {}, create: { name: 'Energéticos' } });
  const catRefris      = await prisma.category.upsert({ where: { name: 'Refrigerantes' },   update: {}, create: { name: 'Refrigerantes' } });
  const catAgua        = await prisma.category.upsert({ where: { name: 'Água e Sucos' },     update: {}, create: { name: 'Água e Sucos' } });
  const catConv        = await prisma.category.upsert({ where: { name: 'Conveniência' },    update: {}, create: { name: 'Conveniência' } });
  const catTabacaria   = await prisma.category.upsert({ where: { name: 'Tabacaria' },       update: {}, create: { name: 'Tabacaria' } });
  const catPetiscos    = await prisma.category.upsert({ where: { name: 'Petiscos' },        update: {}, create: { name: 'Petiscos' } });

  const P = 0; // preço zerado — cliente define depois

  // ── Produtos ─────────────────────────────────────────────────────────────────
  const products = [
    // ── CERVEJAS (top vendors em disk) ─────────────────────────────────────────
    { name: 'Heineken Long Neck 330ml',         ncm: '22030000', cest: '0300100', categoryId: catCervejas.id },
    { name: 'Heineken Latão 473ml',             ncm: '22030000', cest: '0300100', categoryId: catCervejas.id },
    { name: 'Heineken Puro Malte Lata 350ml',   ncm: '22030000', cest: '0300100', categoryId: catCervejas.id },
    { name: 'Budweiser Lata 350ml',             ncm: '22030000', cest: '0300100', categoryId: catCervejas.id },
    { name: 'Budweiser Long Neck 330ml',        ncm: '22030000', cest: '0300100', categoryId: catCervejas.id },
    { name: 'Brahma Duplo Malte Latão 473ml',   ncm: '22030000', cest: '0300100', categoryId: catCervejas.id },
    { name: 'Brahma Duplo Malte Lata 350ml',    ncm: '22030000', cest: '0300100', categoryId: catCervejas.id },
    { name: 'Skol Lata 350ml',                  ncm: '22030000', cest: '0300100', categoryId: catCervejas.id },
    { name: 'Skol Pilsen Latão 473ml',          ncm: '22030000', cest: '0300100', categoryId: catCervejas.id },
    { name: 'Amstel Lata 350ml',                ncm: '22030000', cest: '0300100', categoryId: catCervejas.id },
    { name: 'Amstel Latão 473ml',               ncm: '22030000', cest: '0300100', categoryId: catCervejas.id },
    { name: 'Spaten Lager Latão 473ml',         ncm: '22030000', cest: '0300100', categoryId: catCervejas.id },
    { name: 'Spaten Long Neck 355ml',           ncm: '22030000', cest: '0300100', categoryId: catCervejas.id },
    { name: 'Corona Long Neck 330ml',           ncm: '22030000', cest: '0300100', categoryId: catCervejas.id },
    { name: 'Stella Artois Long Neck 330ml',    ncm: '22030000', cest: '0300100', categoryId: catCervejas.id },
    { name: 'Itaipava Lata 350ml',              ncm: '22030000', cest: '0300100', categoryId: catCervejas.id },
    { name: 'Itaipava Latão 473ml',             ncm: '22030000', cest: '0300100', categoryId: catCervejas.id },
    { name: 'Bohemia Puro Malte Long Neck 350ml', ncm: '22030000', cest: '0300100', categoryId: catCervejas.id },

    // ── DESTILADOS ──────────────────────────────────────────────────────────────
    { name: 'Vodka Smirnoff 998ml',            ncm: '22084000', cest: '0300600', categoryId: catDestilados.id },
    { name: 'Vodka Smirnoff 600ml',            ncm: '22084000', cest: '0300600', categoryId: catDestilados.id },
    { name: 'Vodka Absolut 750ml',             ncm: '22084000', cest: '0300600', categoryId: catDestilados.id },
    { name: 'Gin Tanqueray 750ml',             ncm: '22085000', cest: '0300600', categoryId: catDestilados.id },
    { name: 'Gin Gordon\'s 750ml',             ncm: '22085000', cest: '0300600', categoryId: catDestilados.id },
    { name: 'Gin Beefeater 750ml',             ncm: '22085000', cest: '0300600', categoryId: catDestilados.id },
    { name: 'Whisky JW Red Label 1L',          ncm: '22083000', cest: '0300600', categoryId: catDestilados.id },
    { name: 'Whisky JW Black Label 1L',        ncm: '22083000', cest: '0300600', categoryId: catDestilados.id },
    { name: 'Whisky Jack Daniels 1L',          ncm: '22083000', cest: '0300600', categoryId: catDestilados.id },
    { name: 'Cachaça 51 965ml',               ncm: '22087000', cest: '0300600', categoryId: catDestilados.id },
    { name: 'Campari 900ml',                  ncm: '22089000', cest: '0300600', categoryId: catDestilados.id },
    { name: 'Aperol 1L',                      ncm: '22089000', cest: '0300600', categoryId: catDestilados.id },

    // ── ENERGÉTICOS ─────────────────────────────────────────────────────────────
    { name: 'Red Bull 250ml',                 ncm: '22021000', cest: '0300200', categoryId: catEnergeticos.id },
    { name: 'Red Bull Tropical 250ml',        ncm: '22021000', cest: '0300200', categoryId: catEnergeticos.id },
    { name: 'Red Bull Melancia 250ml',        ncm: '22021000', cest: '0300200', categoryId: catEnergeticos.id },
    { name: 'Monster Energy Green 473ml',     ncm: '22021000', cest: '0300200', categoryId: catEnergeticos.id },
    { name: 'Monster Mango Loco 473ml',       ncm: '22021000', cest: '0300200', categoryId: catEnergeticos.id },
    { name: 'Baly Tradicional 2L',            ncm: '22021000', cest: '0300200', categoryId: catEnergeticos.id },
    { name: 'Baly Morango 2L',                ncm: '22021000', cest: '0300200', categoryId: catEnergeticos.id },

    // ── REFRIGERANTES ───────────────────────────────────────────────────────────
    { name: 'Coca-Cola 2L',                   ncm: '22021000', cest: '0300200', categoryId: catRefris.id },
    { name: 'Coca-Cola 1L',                   ncm: '22021000', cest: '0300200', categoryId: catRefris.id },
    { name: 'Coca-Cola Lata 350ml',            ncm: '22021000', cest: '0300200', categoryId: catRefris.id },
    { name: 'Guaraná Antarctica 2L',           ncm: '22021000', cest: '0300200', categoryId: catRefris.id },
    { name: 'Guaraná Antarctica Lata 350ml',   ncm: '22021000', cest: '0300200', categoryId: catRefris.id },
    { name: 'Sprite 2L',                      ncm: '22021000', cest: '0300200', categoryId: catRefris.id },
    { name: 'Fanta Laranja 2L',               ncm: '22021000', cest: '0300200', categoryId: catRefris.id },
    { name: 'Schweppes Citrus 350ml',         ncm: '22021000', cest: '0300200', categoryId: catRefris.id },
    { name: 'Schweppes Tônica 350ml',         ncm: '22021000', cest: '0300200', categoryId: catRefris.id },

    // ── ÁGUA E SUCOS ────────────────────────────────────────────────────────────
    { name: 'Água Mineral s/ Gás 500ml',      ncm: '22011000', cest: '0300300', categoryId: catAgua.id },
    { name: 'Água Mineral c/ Gás 500ml',      ncm: '22011000', cest: '0300300', categoryId: catAgua.id },
    { name: 'Água Mineral 1,5L',              ncm: '22011000', cest: '0300300', categoryId: catAgua.id },
    { name: 'Suco Del Valle Uva 1L',          ncm: '20099000', cest: '0300200', categoryId: catAgua.id },
    { name: 'Suco Del Valle Pêssego 1L',      ncm: '20099000', cest: '0300200', categoryId: catAgua.id },
    { name: 'Suco Tropicana 1L',              ncm: '20099000', cest: '0300200', categoryId: catAgua.id },

    // ── CONVENIÊNCIA ────────────────────────────────────────────────────────────
    { name: 'Gelo em Escamas 5kg',            ncm: '22011000', cest: '0300300', categoryId: catConv.id },
    { name: 'Carvão 3kg',                     ncm: '44029000', cest: '',        categoryId: catConv.id },
    { name: 'Copo Descartável 300ml (50un)',   ncm: '39241000', cest: '',        categoryId: catConv.id },
    { name: 'Copo Descartável 400ml (50un)',   ncm: '39241000', cest: '',        categoryId: catConv.id },
    { name: 'Guardanapo Pacote',              ncm: '48189000', cest: '',        categoryId: catConv.id },
    { name: 'Isqueiro Bic',                   ncm: '96131000', cest: '',        categoryId: catConv.id },

    // ── TABACARIA ────────────────────────────────────────────────────────────────
    { name: 'Cigarro Marlboro Vermelho',       ncm: '24022000', cest: '0300700', categoryId: catTabacaria.id },
    { name: 'Cigarro Marlboro Gold',           ncm: '24022000', cest: '0300700', categoryId: catTabacaria.id },
    { name: 'Cigarro Philip Morris',           ncm: '24022000', cest: '0300700', categoryId: catTabacaria.id },
    { name: 'Essência Zomo Menta 50g',         ncm: '24039900', cest: '',        categoryId: catTabacaria.id },
    { name: 'Essência Adalya Love 66 50g',     ncm: '24039900', cest: '',        categoryId: catTabacaria.id },

    // ── PETISCOS ────────────────────────────────────────────────────────────────
    { name: 'Amendoim Japonês 200g',           ncm: '20081900', cest: '',        categoryId: catPetiscos.id },
    { name: 'Ruffles Original 76g',            ncm: '19059000', cest: '',        categoryId: catPetiscos.id },
    { name: 'Doritos Queijo 76g',              ncm: '19059000', cest: '',        categoryId: catPetiscos.id },
    { name: 'Pringles Original 114g',          ncm: '19059000', cest: '',        categoryId: catPetiscos.id },
    { name: 'Trident Menta c/21',              ncm: '17049000', cest: '',        categoryId: catPetiscos.id },
  ];

  let inserted = 0;
  for (const p of products) {
    // upsert by name — evita duplicar se seed for rodado mais de uma vez
    const existing = await prisma.product.findFirst({ where: { name: p.name } });
    if (!existing) {
      await prisma.product.create({
        data: {
          name:         p.name,
          priceSell:    P,
          priceCost:    P,
          stock:        0,
          categoryId:   p.categoryId,
          ncm:          p.ncm || null,
          cest:         (p.cest || null) as string | null,
          origem:       0,
        },
      });
      inserted++;
    }
  }

  console.log(`✅  Seed Disk Bebidas: ${inserted} produtos inseridos (${products.length - inserted} já existiam).`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
