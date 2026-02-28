import type { CrmService } from 'src/crm/services/crm.service';
import type { AppointmentStateData, AppointmentType } from './types';
import { splitName } from './validation';
import { normalizePhone } from '../common/utils';

export async function createAppointmentInCrm(
  crmService: CrmService,
  data: AppointmentStateData,
): Promise<{ success: boolean; error?: string }> {
  const phone = data.ownerPhone ? normalizePhone(data.ownerPhone) : null;
  if (!phone || !data.date || !data.time || !data.doctorId) {
    return { success: false, error: 'Недостаточно данных для записи' };
  }

  const { lastName, firstName, middleName } = splitName(data.ownerName ?? '');
  let clientId: number;

  try {
    const clientSearch = await crmService.getClientByPhone(phone);
    if (clientSearch?.data?.clients && clientSearch.data.clients.length > 0) {
      clientId = parseInt(clientSearch.data.clients[0].id, 10);
    } else {
      const newClient = await crmService.createClient(
        lastName || 'Не указано',
        firstName || 'Не указано',
        middleName || '',
        phone,
      );
      let clientIdStr: string | number | undefined;
      if (newClient?.data?.client) {
        if (Array.isArray(newClient.data.client) && newClient.data.client.length > 0)
          clientIdStr = newClient.data.client[0].id;
        else if (!Array.isArray(newClient.data.client)) clientIdStr = (newClient.data.client as any).id;
      }
      if (!clientIdStr) clientIdStr = (newClient as any)?.data?.id ?? (newClient as any)?.client?.id ?? (newClient as any)?.id;
      if (clientIdStr == null) return { success: false, error: 'Не удалось получить ID созданного клиента' };
      clientId = parseInt(String(clientIdStr), 10);
      if (isNaN(clientId)) return { success: false, error: `Неверный формат clientId: ${clientIdStr}` };
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Ошибка при работе с клиентом' };
  }

  let patientId: number;
  try {
    const petName = data.petName || 'Питомец';
    const petTypeId = 2;
    const petBreedId = 2;
    const newPet = await crmService.createPet(clientId, petName, petTypeId, petBreedId);
    let patientIdStr: string | number | undefined;
    if (newPet?.data?.pet) {
      if (Array.isArray(newPet.data.pet) && newPet.data.pet.length > 0) patientIdStr = newPet.data.pet[0].id;
      else if (!Array.isArray(newPet.data.pet)) patientIdStr = (newPet.data.pet as any).id;
    }
    if (!patientIdStr) patientIdStr = (newPet as any)?.data?.id ?? (newPet as any)?.pet?.id ?? (newPet as any)?.id;
    if (patientIdStr == null) return { success: false, error: 'Не удалось получить ID созданного питомца' };
    patientId = parseInt(String(patientIdStr), 10);
    if (isNaN(patientId)) return { success: false, error: `Неверный формат patientId: ${patientIdStr}` };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Ошибка при создании питомца' };
  }

  const admissionDate = `${data.date} ${data.time}:00`;
  const clinicId = 1;
  const userId = data.doctorId;
  let typeId = 1;
  let admissionLength = 60;
  const typeMap: Record<AppointmentType, { typeId: number; length: number }> = {
    primary: { typeId: 1, length: 60 },
    secondary: { typeId: 2, length: 30 },
    vaccination: { typeId: 3, length: 30 },
    ultrasound: { typeId: 4, length: 30 },
    analyses: { typeId: 5, length: 15 },
    xray: { typeId: 6, length: 30 },
    other: { typeId: 1, length: 60 },
  };
  if (data.appointmentType) {
    const t = typeMap[data.appointmentType];
    typeId = t.typeId;
    admissionLength = t.length;
  }
  const descriptionText =
    data.appointmentType === 'other' && data.appointmentTypeOther
      ? `${data.symptoms || 'Запись через Telegram бота'}. Причина: ${data.appointmentTypeOther}`
      : (data.symptoms || 'Запись через Telegram бота');

  try {
    await crmService.createAppointment(
      typeId,
      admissionDate,
      clinicId,
      clientId,
      patientId,
      descriptionText,
      admissionLength,
      userId,
    );
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Ошибка при создании записи в CRM' };
  }
}
