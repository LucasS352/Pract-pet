import { PrismaClient } from '../src/generated/heart-client';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_HEART } },
});

const VALID_FROM = new Date('2026-01-01');

const PROFILES: Array<{
  id: string; name: string; icon: string; group: string;
  description?: string; ncm?: string; cest?: string; unit: string;
  emiteNfce: boolean; observacoes?: string;
  taxRules: Array<{ regime: string; csosn?: string; cstIcms?: string; aliqIcms?: number; cstPis: string; cstCofins: string; ibsCst: string; cbsCst: string }>;
}> = [
  // ── BEBIDAS ──────────────────────────────────────────────────
  { id:'fp_cerveja_nacional', name:'Cerveja Nacional', icon:'🍺', group:'Bebidas', ncm:'22030000', cest:'02.007.00', unit:'UN', emiteNfce:true, observacoes:'ST. Verifique CEST com seu contador.', taxRules:[{regime:'simples',csosn:'400',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_cerveja_importada', name:'Cerveja Importada', icon:'🍺', group:'Bebidas', ncm:'22030000', cest:'02.007.00', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'400',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_chope', name:'Chope', icon:'🍺', group:'Bebidas', ncm:'22030000', cest:'02.006.00', unit:'LT', emiteNfce:true, taxRules:[{regime:'simples',csosn:'400',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_vinho_nacional', name:'Vinho Nacional', icon:'🍷', group:'Bebidas', ncm:'22042100', cest:'02.011.00', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_vinho_importado', name:'Vinho Importado', icon:'🍷', group:'Bebidas', ncm:'22042100', cest:'02.011.00', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_espumante', name:'Espumante / Prosecco', icon:'🍾', group:'Bebidas', ncm:'22041000', cest:'02.012.00', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_whisky', name:'Whisky / Destilados', icon:'🥃', group:'Bebidas', ncm:'22083020', cest:'02.019.00', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_vodka', name:'Vodka', icon:'🍸', group:'Bebidas', ncm:'22086000', cest:'02.019.00', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_gin', name:'Gin', icon:'🍸', group:'Bebidas', ncm:'22085000', cest:'02.019.00', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_cachaca', name:'Cachaça', icon:'🥃', group:'Bebidas', ncm:'22084000', cest:'02.010.00', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_licor', name:'Licor', icon:'🥃', group:'Bebidas', ncm:'22087000', cest:'02.019.00', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_refrigerante', name:'Refrigerante', icon:'🥤', group:'Bebidas', ncm:'22021000', cest:'03.004.00', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'400',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_energetico', name:'Energético', icon:'⚡', group:'Bebidas', ncm:'22029900', cest:'03.005.00', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'400',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_agua_mineral', name:'Água Mineral', icon:'💧', group:'Bebidas', ncm:'22011000', cest:'03.001.00', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_isotonico', name:'Isotônico / Esportivo', icon:'🥤', group:'Bebidas', ncm:'22029900', cest:'03.005.00', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_suco', name:'Suco / Néctar', icon:'🧃', group:'Bebidas', ncm:'20091100', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  // ── TABACARIA ─────────────────────────────────────────────────
  { id:'fp_cigarro_nota', name:'Cigarro (c/ NF fornecedor)', icon:'🚬', group:'Tabacaria', ncm:'24022000', unit:'CX', emiteNfce:true, observacoes:'ST Federal. CSOSN 400.', taxRules:[{regime:'simples',csosn:'400',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_cigarro_informal', name:'Cigarro Informal (sem nota)', icon:'🚬', group:'Tabacaria', unit:'UN', emiteNfce:false, observacoes:'Sem comprovação de origem. Não emite NFC-e.', taxRules:[] },
  { id:'fp_cigarro_eletronico', name:'Cigarro Eletrônico / Vape', icon:'🚬', group:'Tabacaria', unit:'UN', emiteNfce:false, observacoes:'Proibido pela ANVISA RDC 46/2009. Não emite NFC-e.', taxRules:[] },
  { id:'fp_essencia', name:'Essência (Narguilé)', icon:'💨', group:'Tabacaria', ncm:'24031990', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'400',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_seda_filtro', name:'Seda / Filtro', icon:'📄', group:'Tabacaria', ncm:'48131000', unit:'CX', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_piteira', name:'Piteira', icon:'📌', group:'Tabacaria', ncm:'96142000', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_palheiro', name:'Palheiro / Cigarrilha', icon:'🚬', group:'Tabacaria', ncm:'24021000', unit:'CX', emiteNfce:true, taxRules:[{regime:'simples',csosn:'400',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_isqueiro', name:'Isqueiro', icon:'🔥', group:'Tabacaria', ncm:'96131000', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_fosforo', name:'Fósforo', icon:'🔥', group:'Tabacaria', ncm:'36050000', unit:'CX', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_narguile', name:'Narguilé / Acessório', icon:'💨', group:'Tabacaria', ncm:'96142000', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  // ── BOMBONIERE ────────────────────────────────────────────────
  { id:'fp_chocolate', name:'Chocolate', icon:'🍫', group:'Bomboniere', ncm:'18063110', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_bala', name:'Bala / Pastilha', icon:'🍬', group:'Bomboniere', ncm:'17049010', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_chiclete', name:'Chiclete / Goma', icon:'🫧', group:'Bomboniere', ncm:'17041000', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_pirulito', name:'Pirulito', icon:'🍭', group:'Bomboniere', ncm:'17049010', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_pacoca', name:'Paçoca / Amendoim', icon:'🥜', group:'Bomboniere', ncm:'19049000', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_salgadinho', name:'Salgadinho / Snack', icon:'🍿', group:'Bomboniere', ncm:'19059020', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_biscoito', name:'Biscoito / Bolacha', icon:'🍪', group:'Bomboniere', ncm:'19053100', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_sorvete', name:'Sorvete / Picolé', icon:'🍦', group:'Bomboniere', ncm:'21050010', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'400',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_gelo', name:'Gelo', icon:'🧊', group:'Bomboniere', ncm:'22019000', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_carvao', name:'Carvão Vegetal', icon:'🪵', group:'Bomboniere', ncm:'44029000', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_barra_cereal', name:'Barra de Cereal', icon:'🌾', group:'Bomboniere', ncm:'19042000', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  // ── LIMPEZA ───────────────────────────────────────────────────
  { id:'fp_agua_sanitaria', name:'Água Sanitária', icon:'🧴', group:'Limpeza', ncm:'28289011', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_detergente', name:'Detergente', icon:'🧴', group:'Limpeza', ncm:'34022000', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_sabao', name:'Sabão em Barra / Pó', icon:'🧼', group:'Limpeza', ncm:'34011190', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_desinfetante', name:'Desinfetante', icon:'🧴', group:'Limpeza', ncm:'38089419', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_papel_higienico', name:'Papel Higiênico', icon:'🧻', group:'Limpeza', ncm:'48181000', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_descartavel', name:'Copo / Prato Descartável', icon:'🥤', group:'Limpeza', ncm:'39233000', unit:'PCT', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_preservativo', name:'Preservativo', icon:'🩹', group:'Limpeza', ncm:'40141000', unit:'CX', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_esponja', name:'Esponja de Cozinha', icon:'🧽', group:'Limpeza', ncm:'39241000', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_saco_lixo', name:'Saco de Lixo', icon:'🗑️', group:'Limpeza', ncm:'39232100', unit:'RL', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  // ── PET ───────────────────────────────────────────────────────
  { id:'fp_racao', name:'Ração (Cão / Gato)', icon:'🐾', group:'Pet', ncm:'23091000', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_petisco', name:'Petisco Animal', icon:'🦴', group:'Pet', ncm:'23091000', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_areia_higienica', name:'Areia Higiênica', icon:'🪣', group:'Pet', ncm:'25081000', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  // ── OUTROS ────────────────────────────────────────────────────
  { id:'fp_sem_nota', name:'Produto Sem Nota Fiscal', icon:'🚫', group:'Outros', unit:'UN', emiteNfce:false, observacoes:'Sem comprovação de origem. Não emite NFC-e.', taxRules:[] },
  { id:'fp_uso_interno', name:'Serviço / Uso Interno', icon:'🔧', group:'Outros', unit:'UN', emiteNfce:false, observacoes:'Não gera NFC-e.', taxRules:[] },
  { id:'fp_mercadoria_geral', name:'Mercadoria Geral', icon:'📦', group:'Outros', unit:'UN', emiteNfce:true, observacoes:'Use quando não houver perfil específico. Preencha NCM manualmente.', taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
];

const STORE_PROFILES = [
  { slug:'adega', name:'Adega', icon:'🍺', description:'Adega, empório de bebidas.', ids:['fp_cerveja_nacional','fp_cerveja_importada','fp_chope','fp_vinho_nacional','fp_vinho_importado','fp_espumante','fp_whisky','fp_vodka','fp_gin','fp_cachaca','fp_licor','fp_refrigerante','fp_energetico','fp_agua_mineral','fp_isotonico','fp_cigarro_nota','fp_cigarro_informal','fp_essencia','fp_seda_filtro','fp_isqueiro','fp_salgadinho','fp_biscoito','fp_gelo','fp_carvao','fp_descartavel','fp_sem_nota'] },
  { slug:'convenencia', name:'Conveniência', icon:'🏪', description:'Loja de conveniência, minimercado.', ids:['fp_cerveja_nacional','fp_cerveja_importada','fp_refrigerante','fp_energetico','fp_agua_mineral','fp_isotonico','fp_suco','fp_chocolate','fp_bala','fp_chiclete','fp_salgadinho','fp_biscoito','fp_sorvete','fp_gelo','fp_cigarro_nota','fp_cigarro_informal','fp_isqueiro','fp_agua_sanitaria','fp_detergente','fp_papel_higienico','fp_descartavel','fp_preservativo','fp_racao','fp_petisco','fp_sem_nota','fp_mercadoria_geral'] },
  { slug:'mercado', name:'Mercado / Mercearia', icon:'🛒', description:'Mercado, mercearia, supermercado de bairro.', ids:['fp_cerveja_nacional','fp_refrigerante','fp_energetico','fp_agua_mineral','fp_suco','fp_chocolate','fp_bala','fp_biscoito','fp_salgadinho','fp_barra_cereal','fp_sorvete','fp_gelo','fp_agua_sanitaria','fp_detergente','fp_sabao','fp_desinfetante','fp_papel_higienico','fp_descartavel','fp_saco_lixo','fp_esponja','fp_racao','fp_petisco','fp_areia_higienica','fp_carvao','fp_sem_nota','fp_mercadoria_geral'] },
  { slug:'tabacaria', name:'Tabacaria', icon:'🚬', description:'Tabacaria, banca e similares.', ids:['fp_cigarro_nota','fp_cigarro_informal','fp_cigarro_eletronico','fp_essencia','fp_seda_filtro','fp_piteira','fp_palheiro','fp_isqueiro','fp_fosforo','fp_narguile','fp_cerveja_nacional','fp_refrigerante','fp_agua_mineral','fp_energetico','fp_descartavel','fp_preservativo','fp_sem_nota'] },
  { slug:'bar_restaurante', name:'Bar / Restaurante', icon:'🍴', description:'Bar, boteco, restaurante.', ids:['fp_cerveja_nacional','fp_chope','fp_refrigerante','fp_agua_mineral','fp_suco','fp_isotonico','fp_cachaca','fp_whisky','fp_vodka','fp_gin','fp_vinho_nacional','fp_espumante','fp_gelo','fp_descartavel','fp_salgadinho','fp_sem_nota','fp_mercadoria_geral'] },
];

async function main() {
  console.log('🌱 Iniciando seed do Catalogo Fiscal...\n');

  for (const p of PROFILES) {
    const { taxRules, ...data } = p;
    await prisma.fiscalProfile.upsert({
      where: { id: p.id },
      update: { ...data, scope:'SYSTEM', version:'2026.1', status:'ACTIVE' },
      create: { id: p.id, ...data, scope:'SYSTEM', version:'2026.1', status:'ACTIVE' },
    });
    await prisma.fiscalTaxRule.deleteMany({ where: { fiscalProfileId: p.id } });
    for (const r of taxRules) {
      await prisma.fiscalTaxRule.create({ data: { fiscalProfileId: p.id, ...r, validFrom: VALID_FROM } });
    }
    process.stdout.write(`  ${p.icon} ${p.name}\n`);
  }

  for (const sp of STORE_PROFILES) {
    const { ids, ...spData } = sp;
    const store = await prisma.storeProfile.upsert({
      where: { slug: sp.slug }, update: spData, create: spData,
    });
    await prisma.storeProfileFiscal.deleteMany({ where: { storeProfileId: store.id } });
    for (const fpId of ids) {
      await prisma.storeProfileFiscal.create({ data: { storeProfileId: store.id, fiscalProfileId: fpId } });
    }
    process.stdout.write(`  ${sp.icon} ${sp.name} (${ids.length} perfis)\n`);
  }

  console.log('\n✅ Catalogo Fiscal instalado com sucesso!');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
