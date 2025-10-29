import { PaginationButton } from './pagination.helper';

export interface TimeSlot {
  time: string;
  isAvailable: boolean;
  appointmentId?: string;
}

export interface DateSlot {
  date: string;
  displayName: string;
  availableSlots: number;
  totalSlots: number;
}

export class DateTimeHelper {
  private static readonly WORK_START_HOUR = 9; // 9:00
  private static readonly WORK_END_HOUR = 18; // 18:00
  private static readonly SLOT_DURATION_HOURS = 1; // 1 час на прием

  /**
   * Генерирует доступные даты на ближайшие дни
   * @param daysAhead - количество дней вперед для генерации
   * @returns массив доступных дат
   */
  static generateAvailableDates(daysAhead: number = 14): DateSlot[] {
    const dates: DateSlot[] = [];
    const today = new Date();
    
    for (let i = 0; i < daysAhead; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      
      // Пропускаем воскресенья (день недели 0)
      if (date.getDay() === 0) {
        continue;
      }
      
      const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
      const displayName = this.formatDateDisplay(date);
      const totalSlots = this.calculateTotalSlots();
      
      dates.push({
        date: dateStr,
        displayName,
        availableSlots: totalSlots, // Будет обновлено после проверки занятых слотов
        totalSlots
      });
    }
    
    return dates;
  }

  /**
   * Генерирует временные слоты для конкретной даты
   * @param date - дата в формате YYYY-MM-DD
   * @param occupiedSlots - занятые временные слоты
   * @returns массив временных слотов
   */
  static generateTimeSlots(date: string, occupiedSlots: string[] = []): TimeSlot[] {
    const slots: TimeSlot[] = [];
    const workStart = this.WORK_START_HOUR;
    const workEnd = this.WORK_END_HOUR;
    
    for (let hour = workStart; hour < workEnd; hour++) {
      const timeStr = `${hour.toString().padStart(2, '0')}:00`;
      const isOccupied = occupiedSlots.includes(timeStr);
      
      slots.push({
        time: timeStr,
        isAvailable: !isOccupied
      });
    }
    
    return slots;
  }

  /**
   * Создает кнопки для выбора даты с пагинацией
   * @param dates - массив доступных дат
   * @param currentPage - текущая страница
   * @returns массив кнопок для пагинации
   */
  static createDateButtons(dates: DateSlot[], currentPage: number = 1): PaginationButton[] {
    return dates.map((dateSlot, index) => {
      const availabilityText = dateSlot.availableSlots > 0 
        ? `✅ ${dateSlot.availableSlots}/${dateSlot.totalSlots}` 
        : '❌ Занято';
      
      return {
        text: `${dateSlot.displayName} ${availabilityText}`,
        callbackData: `date_${dateSlot.date}`
      };
    });
  }

  /**
   * Создает кнопки для выбора времени
   * @param timeSlots - массив временных слотов
   * @param currentPage - текущая страница
   * @returns массив кнопок для пагинации
   */
  static createTimeButtons(timeSlots: TimeSlot[], currentPage: number = 1): PaginationButton[] {
    return timeSlots
      .filter(slot => slot.isAvailable)
      .map(slot => ({
        text: `🕐 ${slot.time}`,
        callbackData: `time_${slot.time}`
      }));
  }

  /**
   * Парсит callback данные для даты
   * @param callbackData - данные callback
   * @returns дата в формате YYYY-MM-DD или null
   */
  static parseDateCallback(callbackData: string): string | null {
    const match = callbackData.match(/^date_(.+)$/);
    return match ? match[1] : null;
  }

  /**
   * Парсит callback данные для времени
   * @param callbackData - данные callback
   * @returns время в формате HH:MM или null
   */
  static parseTimeCallback(callbackData: string): string | null {
    const match = callbackData.match(/^time_(.+)$/);
    return match ? match[1] : null;
  }

  /**
   * Проверяет, является ли callback для выбора даты
   * @param callbackData - данные callback
   * @returns true, если это callback для даты
   */
  static isDateCallback(callbackData: string): boolean {
    return callbackData.startsWith('date_');
  }

  /**
   * Проверяет, является ли callback для выбора времени
   * @param callbackData - данные callback
   * @returns true, если это callback для времени
   */
  static isTimeCallback(callbackData: string): boolean {
    return callbackData.startsWith('time_');
  }

  /**
   * Форматирует дату для отображения
   * @param date - объект Date
   * @returns отформатированная строка даты
   */
  static formatDateDisplay(date: Date): string {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    if (date.toDateString() === today.toDateString()) {
      return '📅 Сегодня';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return '📅 Завтра';
    } else {
      const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
      const monthNames = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 
                         'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
      
      const dayName = dayNames[date.getDay()];
      const day = date.getDate();
      const month = monthNames[date.getMonth()];
      
      return `📅 ${dayName}, ${day} ${month}`;
    }
  }

  /**
   * Рассчитывает общее количество слотов в рабочем дне
   * @returns количество слотов
   */
  private static calculateTotalSlots(): number {
    return this.WORK_END_HOUR - this.WORK_START_HOUR;
  }

  /**
   * Конвертирует дату и время в формат для API
   * @param date - дата в формате YYYY-MM-DD
   * @param time - время в формате HH:MM
   * @returns дата и время в формате для API
   */
  static formatDateTimeForAPI(date: string, time: string): string {
    return `${date}T${time}:00`;
  }

  /**
   * Получает занятые слоты из списка приемов
   * @param appointments - массив приемов из API
   * @param targetDate - целевая дата
   * @returns массив занятых временных слотов
   */
  static getOccupiedTimeSlots(appointments: any[], targetDate: string): string[] {
    return appointments
      .filter(appointment => {
        const appointmentDate = appointment.admission_date?.split('T')[0];
        return appointmentDate === targetDate;
      })
      .map(appointment => {
        const dateTime = new Date(appointment.admission_date);
        const hours = dateTime.getHours();
        const minutes = dateTime.getMinutes();
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      });
  }
}
