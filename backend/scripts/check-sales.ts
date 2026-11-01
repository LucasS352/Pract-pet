import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient({ datasources: { db: { url: 'mysql://root:root@localhost:3306/tenant_packon?schema=public' } } });
  
  const sale = await prisma.sale.findFirst({
    orderBy: { createdAt: 'desc' }
  });
  
  console.log('Last Sale Status:', sale?.nfceStatus);
  console.log('Has XML?', !!sale?.nfceXml);
  console.log('XML Length:', sale?.nfceXml?.length);
  
  await prisma.$disconnect();
}

main().catch(console.error);
