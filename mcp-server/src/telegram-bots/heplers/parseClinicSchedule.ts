import * as fs from 'fs';
import * as mammoth from 'mammoth';

// === Типы ===

interface DoctorProfile {
  lastName: string;
  specialties: string[];
  appointmentTypes: Record<string, number>;
}

interface ClinicDay {
  clinicOpensAt: string | null;
  walkInOnly: boolean;
  doctorAppointments: string[];
  procedureProviders: string[];
  specialTags: ('surgery_day' | 'dental_day' | 'cardiology_day')[];
}

interface BusinessRules {
  surgery_day: {
    surgeon: string;
    maxSurgeries: number;
    fixedConsultSlots: string[];
    maxLargeBitches: number;
    maxComplexSurgeries: number;
  };
  dental_day: {
    dentist: string;
    maxPatients: number;
    fixedSlots: string[];
  };
  cardiology_day: {
    cardiologist: string;
    startTime: string;
    endTime: string;
  };
  firstVaccination: {
    requiresDoctorConsult: boolean;
  };
}

interface Procedures {
  providers: string[];
  types: Record<string, { durationMinutes: number }>;
}

interface Restrictions {
  noOrthopedist: boolean;
  noXray: boolean;
  stationaryOnlyAfterConsult: boolean;
}

interface ClinicSchedule {
  period: { start: string; end: string };
  doctors: DoctorProfile[];
  schedule: Record<string, ClinicDay>;
  businessRules: BusinessRules;
  procedures: Procedures;
  restrictions: Restrictions;
}

// === Вспомогательные функции ===

function normalizeSpecialty(spec: string): string {
  const map: Record<string, string> = {
    стоматолог: 'dentist',
    кардиолог: 'cardiologist',
    хирург: 'surgeon',
    гастроэнтеролог: 'gastroenterologist',
    онколог: 'oncologist',
    дерматолог: 'dermatologist',
    офтальмолог: 'ophthalmologist',
    анестезиолог: 'anesthesiologist',
    терапевт: 'therapist',
    узи: 'ultrasound',
    невролог: 'neurologist',
  };
  return map[spec.trim().toLowerCase()] || spec.toLowerCase().replace(/\s+/g, '_');
}

function extractTimeSlots(text: string): string[] {
  const times = text.match(/\b([01]?[0-9]|2[0-3]):[0-5][0-9]\b/g) || [];
  return [...new Set(times)].sort();
}

function parseDateRange(text: string): { start: string; end: string; year: number } | null {
  // Ищем паттерны типа "8–12 декабря" или "8-12 декабря" с возможным указанием года
  const match = text.match(/(\d+)[–-](\d+)\s+декабря(?:\s+(\d{4}))?/i);
  if (match) {
    const startDay = parseInt(match[1], 10);
    const endDay = parseInt(match[2], 10);
    const year = match[3] ? parseInt(match[3], 10) : new Date().getFullYear();
    return {
      start: `${year}-12-${String(startDay).padStart(2, '0')}`,
      end: `${year}-12-${String(endDay).padStart(2, '0')}`,
      year,
    };
  }
  return null;
}

function extractNumber(text: string, pattern: RegExp): number | null {
  const match = text.match(pattern);
  if (match) {
    const num = parseInt(match[1] || match[0], 10);
    return isNaN(num) ? null : num;
  }
  return null;
}

// === Основной парсер ===

export async function parseClinicSchedule(text: string): Promise<ClinicSchedule> {
  const normalizedText = text.trim();
  const lines = normalizedText
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  const doctors: Record<string, DoctorProfile> = {};
  const schedule: Record<string, ClinicDay> = {};
  const knownParamedics = new Set<string>();
  const businessRules: Partial<BusinessRules> = {
    surgery_day: { surgeon: '', maxSurgeries: 0, fixedConsultSlots: [], maxLargeBitches: 0, maxComplexSurgeries: 0 },
    dental_day: { dentist: '', maxPatients: 0, fixedSlots: [] },
    cardiology_day: { cardiologist: '', startTime: '', endTime: '' },
    firstVaccination: { requiresDoctorConsult: false },
  };
  const procedures: Procedures = { providers: [], types: {} };
  const restrictions: Restrictions = { noOrthopedist: false, noXray: false, stationaryOnlyAfterConsult: false };

  // Парсим период из текста
  let period = { start: '', end: '' };
  let year = new Date().getFullYear();
  const periodMatch = parseDateRange(normalizedText);
  if (periodMatch) {
    period = { start: periodMatch.start, end: periodMatch.end };
    year = periodMatch.year;
  }

  // Генерируем даты периода
  if (period.start && period.end) {
    const startDate = new Date(period.start);
    const endDate = new Date(period.end);
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const isoDate = d.toISOString().split('T')[0];
    schedule[isoDate] = {
      clinicOpensAt: null,
      walkInOnly: false,
      doctorAppointments: [],
      procedureProviders: [],
      specialTags: [],
    };
    }
  }

  let currentSection = '';
  let inProceduresSection = false;
  let inSurgerySection = false;
  let inDentalSection = false;
  let inCardiologySection = false;
  let inRestrictionsSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lowerLine = line.toLowerCase();

    // Определяем разделы
    if (lowerLine.match(/^1\.\s*расписание/i) || lowerLine.includes('расписание') && /\d+[–-]\d+/.test(line)) {
      currentSection = 'schedule';
    } else if (lowerLine.match(/^2\.\s*состав/i) || lowerLine.includes('состав врачей') || lowerLine.includes('узкие специалисты')) {
      currentSection = 'doctors';
    } else if (lowerLine.match(/^3\.\s*правила/i) || lowerLine.includes('правила записи')) {
      currentSection = 'rules';
      // Парсим типы приёмов из правил
      // Ищем информацию о длительности приёмов для всех врачей
      const fullText = normalizedText;
      
      // Первичный приём - 1 час (60 минут)
      if (line.includes('Первичный приём') && line.includes('1 час')) {
        Object.keys(doctors).forEach(doctorName => {
          if (!doctors[doctorName].appointmentTypes.primary) {
            doctors[doctorName].appointmentTypes.primary = 60;
          }
        });
      }
      
      // Повторный приём - 30 минут
      if (line.includes('Повторный приём') && line.includes('30 минут')) {
        Object.keys(doctors).forEach(doctorName => {
          if (!doctors[doctorName].appointmentTypes.follow_up) {
            doctors[doctorName].appointmentTypes.follow_up = 30;
          }
        });
      }
      
      // Кардиология - ЭхоКГ
      if (line.includes('ЭхоКГ') && line.includes('30 минут')) {
        const echoMatch = line.match(/(\d+)\s*минут/i);
        if (echoMatch) {
          Object.keys(doctors).forEach(doctorName => {
            if (doctors[doctorName].specialties.includes('cardiologist')) {
              doctors[doctorName].appointmentTypes.echo_kg = parseInt(echoMatch[1], 10);
            }
          });
        }
      }
      
      // Хирургия - приём перед операцией
      if (line.includes('приём') && line.includes('20 минут') && line.includes('операц')) {
        const surgeryMatch = line.match(/(\d+)\s*минут/i);
        if (surgeryMatch) {
          Object.keys(doctors).forEach(doctorName => {
            if (doctors[doctorName].specialties.includes('surgeon')) {
              doctors[doctorName].appointmentTypes.surgery_consult = parseInt(surgeryMatch[1], 10);
            }
          });
        }
      }
      
      // Стоматология
      if (line.includes('стоматолог') || line.includes('стоматологический')) {
        Object.keys(doctors).forEach(doctorName => {
          if (doctors[doctorName].specialties.includes('dentist')) {
            doctors[doctorName].appointmentTypes.dental = 60;
          }
        });
      }
    } else if (lowerLine.match(/^4\.\s*хирургия/i) || lowerLine.includes('хирургия')) {
      currentSection = 'surgery';
      inSurgerySection = true;
    } else if (lowerLine.match(/^5\.\s*стоматолог/i) || lowerLine.includes('стоматологический')) {
      currentSection = 'dental';
      inDentalSection = true;
    } else if (lowerLine.match(/^6\.\s*кардиолог/i) || lowerLine.includes('кардиология')) {
      currentSection = 'cardiology';
      inCardiologySection = true;
    } else if (lowerLine.match(/^7\.\s*процедуры/i) || (lowerLine.includes('процедуры') && lowerLine.includes('фельдшер'))) {
      currentSection = 'procedures';
      inProceduresSection = true;
    } else if (lowerLine.includes('чего у нас нет') || lowerLine.includes('нет травматолога') || lowerLine.includes('нет рентгена')) {
      currentSection = 'restrictions';
      inRestrictionsSection = true;
    } else if (lowerLine.match(/^11\.\s*стационар/i) || lowerLine.includes('стационар')) {
      currentSection = 'stationary';
      if (line.includes('только') || line.includes('наших')) {
        restrictions.stationaryOnlyAfterConsult = true;
      }
    }

    // === Парсим врачей (раздел "Состав врачей") ===
    if (currentSection === 'doctors') {
      // Ищем строку вида: "Фамилия: роль1, роль2..."
      const doctorLineMatch = line.match(/^([А-ЯЁ][а-яё]+):\s*(.+)$/);
      if (doctorLineMatch) {
        const lastName = doctorLineMatch[1];
        const rolesText = doctorLineMatch[2];

        // Пропускаем анестезиолога
        if (lastName === 'Парахневич') {
          // Продолжаем цикл, но не обрабатываем этого врача
        } else {

        const specialties: string[] = [];
        
        // Маппинг специальностей
        const roleKeywords: Record<string, string> = {
          'офтальмолог': 'ophthalmologist',
          'стоматолог': 'dentist',
          'онколог': 'oncologist',
          'гастроэнтеролог': 'gastroenterologist',
          'дерматолог': 'dermatologist',
          'хирург': 'surgeon',
          'кардиолог': 'cardiologist',
          'невролог': 'neurologist',
          'терапевт': 'therapist',
        };

        for (const [keyword, tag] of Object.entries(roleKeywords)) {
          if (rolesText.includes(keyword)) {
            specialties.push(tag);
          }
        }

        // УЗИ
        if (rolesText.includes('УЗИ')) {
          specialties.push('ultrasound');
        }

        // Все врачи — терапевты (кроме анестезиолога)
        if (!specialties.includes('therapist')) {
          specialties.push('therapist');
        }

        // Типы приёмов будут заполнены позже из раздела правил
        const appointmentTypes: Record<string, number> = {};

        doctors[lastName] = { lastName, specialties, appointmentTypes };
        }
      }
    }

    // === Парсим расписание ===
    if (currentSection === 'schedule') {
      const dateMatch = line.match(/^(\d+)\s+декабря/i);
      if (dateMatch) {
        const day = parseInt(dateMatch[1], 10);
        const isoDate = `${year}-12-${String(day).padStart(2, '0')}`;

        if (!schedule[isoDate]) {
          schedule[isoDate] = {
          clinicOpensAt: null,
          walkInOnly: false,
          doctorAppointments: [],
          procedureProviders: [],
          specialTags: [],
        };
        }

        const dayRecord = schedule[isoDate];

        // Время открытия
        const openTimeMatch = line.match(/с\s+(\d{1,2}):(\d{2})/i);
        if (openTimeMatch) {
          dayRecord.clinicOpensAt = `${openTimeMatch[1].padStart(2, '0')}:${openTimeMatch[2]}`;
        }

        // Приём по записи
        if (line.includes('Приём по записи:')) {
          const names = line.split('Приём по записи:')[1]
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0);
          dayRecord.doctorAppointments.push(...names);
        }

        // Процедуры по записи
        if (line.includes('Процедуры по записи:')) {
          const name = line.split('Процедуры по записи:')[1].trim();
          if (name) dayRecord.procedureProviders.push(name);
        }
 
        // Особые дни
        if (line.includes('Хирургический день')) {
          dayRecord.specialTags.push('surgery_day');
          const surgeonMatch = line.match(/Хирургический день\s+([А-ЯЁ][а-яё]+)/i);
          if (surgeonMatch) {
            dayRecord.doctorAppointments.push(surgeonMatch[1]);
          }
        }
        if (line.includes('стоматологический день') || line.includes('Стоматологический день')) {
          dayRecord.specialTags.push('dental_day');
        }
        if (line.includes('Кардиолог') || line.includes('кардиолог')) {
          dayRecord.specialTags.push('cardiology_day');
          const cardiologistMatch = line.match(/([А-ЯЁ][а-яё]+)/);
          if (cardiologistMatch) {
            dayRecord.doctorAppointments.push(cardiologistMatch[1]);
          }
        }

        // Живая очередь
        if (line.includes('приёма по записи нет') || line.includes('живой очереди')) {
          dayRecord.walkInOnly = true;
          dayRecord.doctorAppointments = [];
        }

        // Собираем данные из следующих строк для этого дня
        let j = i + 1;
        while (j < lines.length && !lines[j].match(/^\d+\s+декабря/i)) {
          const nextLine = lines[j];
          
          // Приём по записи (может быть на следующей строке)
          if (nextLine.includes('Приём по записи:')) {
            const names = nextLine.split('Приём по записи:')[1]
              .split(',')
              .map(s => s.trim())
              .filter(s => s.length > 0);
            dayRecord.doctorAppointments.push(...names);
          }
          
          // Процедуры по записи (может быть на следующей строке)
          if (nextLine.includes('Процедуры по записи:')) {
            const name = nextLine.split('Процедуры по записи:')[1].trim();
            if (name) dayRecord.procedureProviders.push(name);
          }
          
          // Особые дни (может быть на следующей строке)
          if (nextLine.includes('стоматологический день') || nextLine.includes('Стоматологический день')) {
            dayRecord.specialTags.push('dental_day');
            // Ищем стоматолога в тексте
            Object.keys(doctors).forEach(doctorName => {
              if (doctors[doctorName].specialties.includes('dentist') && !dayRecord.doctorAppointments.includes(doctorName)) {
                dayRecord.doctorAppointments.push(doctorName);
              }
            });
          }
          
          if (nextLine.includes('Кардиолог')) {
            dayRecord.specialTags.push('cardiology_day');
            const cardiologistMatch = nextLine.match(/Кардиолог\s+([А-ЯЁ][а-яё]+)/i);
            if (cardiologistMatch && !dayRecord.doctorAppointments.includes(cardiologistMatch[1])) {
              dayRecord.doctorAppointments.push(cardiologistMatch[1]);
            }
          }
          
          if (nextLine.includes('Хирургический день')) {
            dayRecord.specialTags.push('surgery_day');
            const surgeonMatch = nextLine.match(/Хирургический день\s+([А-ЯЁ][а-яё]+)/i);
            if (surgeonMatch && !dayRecord.doctorAppointments.includes(surgeonMatch[1])) {
              dayRecord.doctorAppointments.push(surgeonMatch[1]);
            }
          }
          
          j++;
        }
      }
    }


    // === Парсим хирургию ===
    if (inSurgerySection) {
      // Хирург
      const surgeonMatch = line.match(/хирург[^.]*—\s*([А-ЯЁ][а-яё]+)/i) || line.match(/хирург[^.]*:\s*([А-ЯЁ][а-яё]+)/i);
      if (surgeonMatch && businessRules.surgery_day) {
        businessRules.surgery_day.surgeon = surgeonMatch[1];
      }

      // Максимум операций
      const maxSurgeriesMatch = line.match(/(\d+)\s*(?:несложных|операций)/i);
      if (maxSurgeriesMatch && businessRules.surgery_day) {
        businessRules.surgery_day.maxSurgeries = parseInt(maxSurgeriesMatch[1], 10);
      }

      // Слоты времени
      const slots = extractTimeSlots(line);
      if (slots.length > 0 && businessRules.surgery_day && businessRules.surgery_day.fixedConsultSlots.length === 0) {
        businessRules.surgery_day.fixedConsultSlots = slots;
      }

      // Лимит крупных сук
      const largeBitchesMatch = line.match(/(\d+)\s*(?:сук|собак).*20\s*кг/i);
      if (largeBitchesMatch && businessRules.surgery_day) {
        businessRules.surgery_day.maxLargeBitches = parseInt(largeBitchesMatch[1], 10);
      }

      // Лимит сложных операций
      const complexMatch = line.match(/(\d+)\s*(?:объёмных|сложных)/i);
      if (complexMatch && businessRules.surgery_day) {
        businessRules.surgery_day.maxComplexSurgeries = parseInt(complexMatch[1], 10);
      }
    }

    // === Парсим стоматологию ===
    if (inDentalSection) {
      // Стоматолог
      const dentistMatch = line.match(/([А-ЯЁ][а-яё]+)/);
      if (dentistMatch && businessRules.dental_day && !businessRules.dental_day.dentist) {
        businessRules.dental_day.dentist = dentistMatch[1];
      }

      // Максимум пациентов
      const maxPatientsMatch = line.match(/(\d+)\s*(?:стоматологических|пациентов)/i);
      if (maxPatientsMatch && businessRules.dental_day) {
        businessRules.dental_day.maxPatients = parseInt(maxPatientsMatch[1], 10);
      }

      // Слоты времени
      const slots = extractTimeSlots(line);
      if (slots.length > 0 && businessRules.dental_day && businessRules.dental_day.fixedSlots.length === 0) {
        businessRules.dental_day.fixedSlots = slots;
      }
    }

    // === Парсим кардиологию ===
    if (inCardiologySection) {
      // Кардиолог
      const cardiologistMatch = line.match(/([А-ЯЁ][а-яё]+)/);
      if (cardiologistMatch && businessRules.cardiology_day && !businessRules.cardiology_day.cardiologist) {
        businessRules.cardiology_day.cardiologist = cardiologistMatch[1];
      }

      // Время работы
      const timeMatch = line.match(/(\d{1,2}):(\d{2})\s+до\s+(\d{1,2}):(\d{2})/i);
      if (timeMatch && businessRules.cardiology_day) {
        businessRules.cardiology_day.startTime = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
        businessRules.cardiology_day.endTime = `${timeMatch[3].padStart(2, '0')}:${timeMatch[4]}`;
      }
    }

    // === Парсим процедуры ===
    if (inProceduresSection) {
      // Ищем имена фельдшеров
      const paramedicMatch = line.match(/^([А-ЯЁ][а-яё]+)$/);
      if (paramedicMatch && !doctors[paramedicMatch[1]]) {
        knownParamedics.add(paramedicMatch[1]);
      }

      // Парсим типы процедур и длительности
      const procedureMatch = line.match(/([А-ЯЁа-яё\s]+)\s*—\s*(\d+)\s*(?:минут|мин)/i);
      if (procedureMatch) {
        const procedureName = procedureMatch[1].trim().toLowerCase();
        const duration = parseInt(procedureMatch[2], 10);
        
        let key = '';
        if (procedureName.includes('вакцин')) key = 'vaccination_non_primary';
        else if (procedureName.includes('инъекц')) key = 'injection';
        else if (procedureName.includes('капельниц')) key = 'iv_drip';
        else if (procedureName.includes('анализ')) key = 'blood_draw';
        else if (procedureName.includes('обработка ран')) key = 'wound_care';
        else if (procedureName.includes('перевязк')) key = 'bandage';
        else if (procedureName.includes('санация') || procedureName.includes('параанальн')) key = 'anal_gland_expression';
        else if (procedureName.includes('катетер')) key = 'iv_catheter';
        else if (procedureName.includes('когт')) key = 'nail_trim';

        if (key) {
          procedures.types[key] = { durationMinutes: duration };
        }
      }
    }

    // === Парсим ограничения ===
    if (inRestrictionsSection) {
      if (line.includes('нет травматолога') || line.includes('нет ортопеда')) {
        restrictions.noOrthopedist = true;
      }
      if (line.includes('нет рентгена')) {
        restrictions.noXray = true;
      }
    }

    // Парсим первичную вакцинацию
    if (line.includes('первичная вакцинация') && line.includes('приём врача')) {
      if (businessRules.firstVaccination) {
        businessRules.firstVaccination.requiresDoctorConsult = true;
      }
    }
  }

  // Заполняем дефолтные типы приёмов, если не были найдены в правилах
  Object.keys(doctors).forEach(doctorName => {
    if (!doctors[doctorName].appointmentTypes.primary) {
      doctors[doctorName].appointmentTypes.primary = 60;
    }
    if (!doctors[doctorName].appointmentTypes.follow_up) {
      doctors[doctorName].appointmentTypes.follow_up = 30;
    }
  });

  // === ФЕЛЬДШЕРЫ ===
  procedures.providers = Array.from(knownParamedics);

  return {
    period: period.start && period.end ? period : { start: '', end: '' },
    doctors: Object.values(doctors).filter(d => d.lastName !== 'Парахневич'),
    schedule,
    businessRules: businessRules as BusinessRules,
    procedures,
    restrictions,
  };
}

// === Пример использования (для CLI) ===

if (require.main === module) {
  const args = process.argv.slice(2);
  const filePath = args[0] || 'График и работа с ним.docx';

  const buffer = fs.readFileSync(filePath);
  mammoth.extractRawText({ buffer })
    .then(result => parseClinicSchedule(result.value))
    .then(schedule => {
      console.log(JSON.stringify(schedule, null, 2));
    })
    .catch(err => {
      console.error('Ошибка парсинга:', err);
      process.exit(1);
    });
}
