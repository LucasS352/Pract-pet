export type Pet = {
  id: string;
  customerId: string;
  name: string;
  species: string;
  breed?: string | null;
  sex?: string | null;
  size?: string | null;
  weight?: string | number | null;
  birthDate?: string | null;
  color?: string | null;
  neutered?: boolean | null;
  microchip?: string | null;
  allergies?: string | null;
  behavior?: string | null;
  notes?: string | null;
  photoUrl?: string | null;
  active?: boolean;
  customer: Tutor;
  vaccinations?: Vaccination[];
  appointments?: Appointment[];
  _count?: { appointments: number };
};

export type Tutor = {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  cpfCnpj?: string | null;
  address?: string | null;
  notes?: string | null;
  photoUrl?: string | null;
  pets?: Pet[];
};

export type Vaccination = {
  id: string;
  petId?: string;
  vaccineName: string;
  status: string;
  appliedAt?: string | null;
  nextDueAt?: string | null;
  batchNumber?: string | null;
  manufacturer?: string | null;
  clinic?: string | null;
  professional?: string | null;
  notes?: string | null;
  proofUrl?: string | null;
};

export type PetService = {
  id: string;
  name: string;
  description?: string | null;
  durationMinutes: number;
  price: string | number;
  color: string;
  active: boolean;
};

export type StageHistoryEntry = {
  status: string;
  at: string;
  photoUrl?: string | null;
  notes?: string | null;
};

export type Appointment = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  notes?: string | null;
  checkInNotes?: string | null;
  checkedInAt?: string | null;
  readyAt?: string | null;
  completedAt?: string | null;
  stagePhotoUrl?: string | null;
  stageNotes?: string | null;
  stageHistory?: StageHistoryEntry[] | null;
  pet: Pet;
  customer: Tutor;
  professionalId?: string | null;
  professional?: { id: string; name: string } | null;
  services: Array<{ id: string; serviceId?: string; nameSnapshot: string; priceSnapshot: string | number; durationMinutes: number }>;
};

export const money = (value: string | number) => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const dateTime = (value: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));

