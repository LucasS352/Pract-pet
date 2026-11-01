const { PrismaClient } = require('/app/src/generated/heart-client');
const prisma = new PrismaClient({ datasources: { db: { url: 'mysql://root:7bar@2025@mysql:3306/heart' } } });
const VALID_FROM = new Date('2026-01-01');
const PROFILES = [
  { id:'fp_cerveja_nacional', name:'Cerveja Nacional', icon:'🍺', group:'Bebidas', ncm:'22030000', cest:'02.007.00', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'400',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_cerveja_importada', name:'Cerveja Importada', icon:'🍺', group:'Bebidas', ncm:'22030000', cest:'02.007.00', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'400',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_chope', name:'Chope', icon:'🍺', group:'Bebidas', ncm:'22030000', cest:'02.006.00', unit:'LT', emiteNfce:true, taxRules:[{regime:'simples',csosn:'400',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_vinho_nacional', name:'Vinho Nacional', icon:'🍷', group:'Bebidas', ncm:'22042100', cest:'02.011.00', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_vinho_importado', name:'Vinho Importado', icon:'🍷', group:'Bebidas', ncm:'22042100', cest:'02.011.00', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_espumante', name:'Espumante', icon:'🍾', group:'Bebidas', ncm:'22041000', cest:'02.012.00', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_whisky', name:'Whisky / Destilados', icon:'🥃', group:'Bebidas', ncm:'22083020', cest:'02.019.00', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_vodka', name:'Vodka', icon:'🍸', group:'Bebidas', ncm:'22086000', cest:'02.019.00', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_gin', name:'Gin', icon:'🍸', group:'Bebidas', ncm:'22085000', cest:'02.019.00', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_cachaca', name:'Cachaca', icon:'🥃', group:'Bebidas', ncm:'22084000', cest:'02.010.00', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_licor', name:'Licor', icon:'🥃', group:'Bebidas', ncm:'22087000', cest:'02.019.00', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_refrigerante', name:'Refrigerante', icon:'🥤', group:'Bebidas', ncm:'22021000', cest:'03.004.00', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'400',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_energetico', name:'Energetico', icon:'⚡', group:'Bebidas', ncm:'22029900', cest:'03.005.00', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'400',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_agua_mineral', name:'Agua Mineral', icon:'💧', group:'Bebidas', ncm:'22011000', cest:'03.001.00', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_isotonico', name:'Isotonico', icon:'🥤', group:'Bebidas', ncm:'22029900', cest:'03.005.00', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_suco', name:'Suco / Nectar', icon:'🧃', group:'Bebidas', ncm:'20091100', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_cigarro_nota', name:'Cigarro (c/ NF)', icon:'🚬', group:'Tabacaria', ncm:'24022000', unit:'CX', emiteNfce:true, observacoes:'ST Federal. CSOSN 400.', taxRules:[{regime:'simples',csosn:'400',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_cigarro_informal', name:'Cigarro Informal', icon:'🚬', group:'Tabacaria', unit:'UN', emiteNfce:false, observacoes:'Sem NF. Nao emite NFC-e.', taxRules:[] },
  { id:'fp_cigarro_eletronico', name:'Cigarro Eletronico / Vape', icon:'🚬', group:'Tabacaria', unit:'UN', emiteNfce:false, observacoes:'Proibido ANVISA.', taxRules:[] },
  { id:'fp_essencia', name:'Essencia Narguile', icon:'💨', group:'Tabacaria', ncm:'24031990', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'400',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_seda_filtro', name:'Seda / Filtro', icon:'📄', group:'Tabacaria', ncm:'48131000', unit:'CX', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_piteira', name:'Piteira', icon:'📌', group:'Tabacaria', ncm:'96142000', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_isqueiro', name:'Isqueiro', icon:'🔥', group:'Tabacaria', ncm:'96131000', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_fosforo', name:'Fosforo', icon:'🔥', group:'Tabacaria', ncm:'36050000', unit:'CX', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_narguile', name:'Narguile / Acessorio', icon:'💨', group:'Tabacaria', ncm:'96142000', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_chocolate', name:'Chocolate', icon:'🍫', group:'Bomboniere', ncm:'18063110', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_bala', name:'Bala / Pastilha', icon:'🍬', group:'Bomboniere', ncm:'17049010', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_salgadinho', name:'Salgadinho / Snack', icon:'🍿', group:'Bomboniere', ncm:'19059020', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_biscoito', name:'Biscoito / Bolacha', icon:'🍪', group:'Bomboniere', ncm:'19053100', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_sorvete', name:'Sorvete / Picole', icon:'🍦', group:'Bomboniere', ncm:'21050010', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'400',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_gelo', name:'Gelo', icon:'🧊', group:'Bomboniere', ncm:'22019000', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_carvao', name:'Carvao Vegetal', icon:'🪵', group:'Bomboniere', ncm:'44029000', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_agua_sanitaria', name:'Agua Sanitaria', icon:'🧴', group:'Limpeza', ncm:'28289011', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_detergente', name:'Detergente', icon:'🧴', group:'Limpeza', ncm:'34022000', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_sabao', name:'Sabao em Barra', icon:'🧼', group:'Limpeza', ncm:'34011190', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_papel_higienico', name:'Papel Higienico', icon:'🧻', group:'Limpeza', ncm:'48181000', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_descartavel', name:'Copo / Prato Descartavel', icon:'🥤', group:'Limpeza', ncm:'39233000', unit:'PCT', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_preservativo', name:'Preservativo', icon:'🩹', group:'Limpeza', ncm:'40141000', unit:'CX', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_racao', name:'Racao Animal', icon:'🐾', group:'Pet', ncm:'23091000', unit:'UN', emiteNfce:true, taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
  { id:'fp_sem_nota', name:'Produto Sem Nota Fiscal', icon:'🚫', group:'Outros', unit:'UN', emiteNfce:false, observacoes:'Sem comprovacao de origem. Nao emite NFC-e.', taxRules:[] },
  { id:'fp_mercadoria_geral', name:'Mercadoria Geral', icon:'📦', group:'Outros', unit:'UN', emiteNfce:true, observacoes:'Use quando nao houver perfil especifico.', taxRules:[{regime:'simples',csosn:'102',cstPis:'99',cstCofins:'99',ibsCst:'99',cbsCst:'99'}] },
];
const STORE_PROFILES = [
  { slug:'adega', name:'Adega', icon:'🍺', description:'Adega, emporio de bebidas.', ids:['fp_cerveja_nacional','fp_cerveja_importada','fp_chope','fp_vinho_nacional','fp_vinho_importado','fp_espumante','fp_whisky','fp_vodka','fp_gin','fp_cachaca','fp_licor','fp_refrigerante','fp_energetico','fp_agua_mineral','fp_isotonico','fp_cigarro_nota','fp_cigarro_informal','fp_essencia','fp_seda_filtro','fp_isqueiro','fp_salgadinho','fp_biscoito','fp_gelo','fp_carvao','fp_descartavel','fp_sem_nota'] },
  { slug:'convenencia', name:'Conveniencia', icon:'🏪', description:'Loja de conveniencia.', ids:['fp_cerveja_nacional','fp_refrigerante','fp_energetico','fp_agua_mineral','fp_chocolate','fp_bala','fp_salgadinho','fp_biscoito','fp_sorvete','fp_gelo','fp_cigarro_nota','fp_cigarro_informal','fp_isqueiro','fp_agua_sanitaria','fp_detergente','fp_papel_higienico','fp_descartavel','fp_preservativo','fp_racao','fp_sem_nota','fp_mercadoria_geral'] },
  { slug:'mercado', name:'Mercado', icon:'🛒', description:'Mercado, mercearia.', ids:['fp_cerveja_nacional','fp_refrigerante','fp_energetico','fp_agua_mineral','fp_suco','fp_chocolate','fp_bala','fp_biscoito','fp_salgadinho','fp_sorvete','fp_gelo','fp_agua_sanitaria','fp_detergente','fp_sabao','fp_papel_higienico','fp_descartavel','fp_racao','fp_carvao','fp_sem_nota','fp_mercadoria_geral'] },
  { slug:'tabacaria', name:'Tabacaria', icon:'🚬', description:'Tabacaria e banca.', ids:['fp_cigarro_nota','fp_cigarro_informal','fp_cigarro_eletronico','fp_essencia','fp_seda_filtro','fp_piteira','fp_isqueiro','fp_fosforo','fp_narguile','fp_cerveja_nacional','fp_refrigerante','fp_agua_mineral','fp_descartavel','fp_preservativo','fp_sem_nota'] },
  { slug:'bar_restaurante', name:'Bar / Restaurante', icon:'🍴', description:'Bar, boteco, restaurante.', ids:['fp_cerveja_nacional','fp_chope','fp_refrigerante','fp_agua_mineral','fp_suco','fp_cachaca','fp_whisky','fp_vodka','fp_gin','fp_vinho_nacional','fp_espumante','fp_gelo','fp_descartavel','fp_salgadinho','fp_sem_nota','fp_mercadoria_geral'] },
];
async function main() {
  console.log('Iniciando seed do Catalogo Fiscal...');
  for (const p of PROFILES) {
    const { taxRules, ...data } = p;
    await prisma.fiscalProfile.upsert({ where:{id:p.id}, update:{...data,scope:'SYSTEM',version:'2026.1',status:'ACTIVE'}, create:{id:p.id,...data,scope:'SYSTEM',version:'2026.1',status:'ACTIVE'} });
    await prisma.fiscalTaxRule.deleteMany({ where:{fiscalProfileId:p.id} });
    for (const r of taxRules) { await prisma.fiscalTaxRule.create({ data:{fiscalProfileId:p.id,...r,validFrom:VALID_FROM} }); }
    process.stdout.write(p.icon + ' ' + p.name + '\n');
  }
  for (const sp of STORE_PROFILES) {
    const { ids, ...spData } = sp;
    const store = await prisma.storeProfile.upsert({ where:{slug:sp.slug}, update:spData, create:spData });
    await prisma.storeProfileFiscal.deleteMany({ where:{storeProfileId:store.id} });
    for (const fpId of ids) { await prisma.storeProfileFiscal.create({ data:{storeProfileId:store.id,fiscalProfileId:fpId} }); }
    process.stdout.write(sp.icon + ' ' + sp.name + ' (' + ids.length + ' perfis)\n');
  }
  console.log('Seed concluido com sucesso!');
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.());
