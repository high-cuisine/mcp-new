import type { DoctorService } from 'src/crm/services/doctor.service';
import { getDoctorsWithLiveQueue } from 'src/proccesor/constants/doctors-info.constant';

export function getPositionText(doctor: any): string {
  if (doctor.position) {
    if (typeof doctor.position === 'string') return doctor.position;
    if (typeof doctor.position === 'object' && doctor.position !== null)
      return doctor.position.title || doctor.position.name || '';
  }
  if (doctor.position_data) {
    if (typeof doctor.position_data === 'string') return doctor.position_data;
    if (typeof doctor.position_data === 'object' && doctor.position_data !== null)
      return doctor.position_data.title || doctor.position_data.name || '';
  }
  return '';
}

export function filterNonAdminDoctors(doctors: any[]): any[] {
  return doctors.filter((doctor) => {
    const positionText = getPositionText(doctor).toLowerCase();
    return (
      !positionText.includes('администратор') &&
      !positionText.includes('administrator') &&
      positionText.trim() !== ''
    );
  });
}

export async function buildDoctorsList(doctorService: DoctorService): Promise<string[]> {
  try {
    const doctors = await doctorService.getDoctorsWithAppointment();
    if (!Array.isArray(doctors) || doctors.length === 0) return [];
    const filtered = filterNonAdminDoctors(doctors);
    if (filtered.length === 0) return [];
    const lines: string[] = ['👨‍⚕️ Выберите врача (введите номер):', ''];
    filtered.forEach((doctor, index) => {
      let doctorName = '';
      if (doctor.full_name) doctorName = doctor.full_name;
      else if (doctor.last_name || doctor.first_name) {
        const parts: string[] = [];
        if (doctor.last_name) parts.push(doctor.last_name);
        if (doctor.first_name) parts.push(doctor.first_name);
        if (doctor.middle_name) parts.push(doctor.middle_name);
        doctorName = parts.join(' ').trim();
      }
      if (!doctorName) doctorName = doctor.name || `Врач #${index + 1}`;
      const positionText = getPositionText(doctor);
      let line = `${index + 1}. ${doctorName}`;
      if (positionText) line += ` (${positionText})`;
      lines.push(line);
    });
    lines.push('', 'Или введите ФИО врача или «авто» для автоматического подбора.');
    const liveQueue = getDoctorsWithLiveQueue().map((d) => d.fullName);
    if (liveQueue.length > 0) {
      lines.push('', `По живой очереди (без записи) принимают: ${liveQueue.join(', ')}.`);
    }
    return [lines.join('\n')];
  } catch {
    return [];
  }
}

/** Текст про лист ожидания при отсутствии слотов (создание и перенос записи) */
export function getWaitlistHint(): string {
  return 'Если нужна запись к этому врачу — можно встать в лист ожидания; при освобождении окна с вами свяжутся. Сроки не гарантируем. Напишите «лист ожидания» или «хочу в лист ожидания», чтобы передать заявку администратору.';
}
