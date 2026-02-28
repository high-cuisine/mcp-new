import type { AppointmentType, AppointmentStep, VisitFlow } from './types';

/** Порядок шагов для потока по умолчанию (текущий универсальный флоу) */
const DEFAULT_STEPS: AppointmentStep[] = [
  'intro',
  'symptoms',
  'pet_name',
  'pet_breed',
  'owner_phone',
  'owner_name',
  'appointment_type',
  'appointment_type_other',
  'date',
  'time',
  'clinic',
  'doctor',
  'slot_selection',
  'confirmation',
  'completed',
];

/**
 * Определяет вариант потока записи по типу приёма.
 * Позволяет в будущем иметь разную последовательность шагов (например: прививка без симптомов, хирургия с доп. полями).
 */
export function getFlowForAppointmentType(type: AppointmentType): VisitFlow {
  switch (type) {
    case 'vaccination':
      return 'vaccination'; // заготовка: можно сократить шаги или изменить порядок
    case 'ultrasound':
    case 'analyses':
    case 'xray':
      return 'diagnostics'; // заготовка: диагностика — свой флоу при необходимости
    case 'primary':
    case 'secondary':
    case 'other':
    default:
      return 'default';
  }
}

/**
 * Возвращает список шагов для потока.
 * Пока все потоки используют тот же порядок; позже можно вернуть разные массивы для vaccination / surgery / diagnostics.
 */
export function getStepsForFlow(flow: VisitFlow): AppointmentStep[] {
  switch (flow) {
    case 'vaccination':
    case 'surgery':
    case 'diagnostics':
      return [...DEFAULT_STEPS]; // пока как default; позже — своя последовательность
    case 'default':
    default:
      return DEFAULT_STEPS;
  }
}

/**
 * Проверка, входит ли шаг в текущий поток (для будущего пропуска шагов).
 * Пока все шаги считаются входящими в поток.
 */
export function isStepInFlow(step: AppointmentStep, flow: VisitFlow): boolean {
  const steps = getStepsForFlow(flow);
  return steps.includes(step);
}
