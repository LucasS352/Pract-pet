const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ datasourceUrl: 'mysql://root:7bar%402025@7bar_mysql:3306/s_o_s' });

async function sync() {
  const readyAppts = await prisma.petAppointment.findMany({
    where: { status: 'ready' },
    include: { pet: true, customer: true, professional: true, services: true }
  });
  console.log('Found ready appointments:', readyAppts.length);

  for (const app of readyAppts) {
    const existing = await prisma.comanda.findFirst({
      where: { status: { in: ['open', 'waiting_payment'] }, notes: { contains: app.id } }
    });
    if (existing) {
      console.log('Already has comanda:', app.pet.name, existing.number);
      continue;
    }

    const serviceName = app.services.map(s => s.nameSnapshot).join(', ').slice(0, 24);
    const compactPayload = {
      v: 2,
      a: app.id,
      s: serviceName || undefined,
      pr: app.professional?.name ? app.professional.name.slice(0, 18) : undefined,
      at: app.startsAt ? new Date(app.startsAt).toISOString().slice(0, 16) : undefined,
    };
    const notesStr = 'PET2:' + JSON.stringify(compactPayload);
    const safeNotes = notesStr.length <= 180 ? notesStr : 'PET2:{"v":2,"a":"' + app.id + '"}';

    const petName = (app.pet?.name || 'Pet').trim();
    const baseNumber = 'Atendimento: ' + petName;
    const conflicting = await prisma.comanda.findFirst({
      where: { number: baseNumber, status: { in: ['open', 'waiting_payment'] } }
    });
    const finalNumber = conflicting ? baseNumber + ' #' + app.id.slice(0, 4).toUpperCase() : baseNumber;
    const total = app.services.reduce((sum, s) => sum + Number(s.priceSnapshot || 0), 0);

    const comanda = await prisma.comanda.create({
      data: {
        number: finalNumber,
        customerName: (app.customer.name + ' · ' + app.pet.name).slice(0, 100),
        notes: safeNotes,
        status: 'waiting_payment',
        total,
        items: {
          create: app.services.map(s => ({
            productId: s.serviceId,
            quantity: 1,
            unitPrice: s.priceSnapshot,
            totalPrice: s.priceSnapshot,
            notes: 'Serviço Pet Shop',
            stockDeducted: true,
            kdsStatus: 'READY'
          }))
        }
      }
    });
    console.log('Created comanda for:', app.pet.name, comanda.id, comanda.number);
  }
}
sync().then(() => prisma.$disconnect()).catch(err => { console.error(err); prisma.$disconnect(); });
