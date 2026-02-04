import { Injectable } from "@nestjs/common";
import { DoctorService } from "src/crm/services/doctor.service";
import { RedisService } from "@infra/redis/redis.service";

@Injectable()
export class DoctorSlotsService {
    constructor(
        private readonly doctorService: DoctorService,
        private readonly redisService: RedisService,
    ) {}

    async getDoctorAvailableSlots(doctorName: string, date?: string, appointmentType?: string): Promise<string> {
        try {
            const rules = await this.getRulesFromRedis();
            const doctorLastName = doctorName.trim().split(/\s+/)[0] || doctorName;
            const doctorInRules = rules?.doctors?.find((d: any) => this.matchDoctorName(d, doctorLastName));

            const allDoctors = await this.doctorService.getDoctorsWithAppointment();
            const doctorFromCrm = allDoctors.find((d: any) =>
                (d.last_name || d.full_name || '').toLowerCase().includes(doctorLastName.toLowerCase())
            );
            if (!doctorFromCrm) {
                return `Врач "${doctorName}" не найден в системе.`;
            }

            const occupiedSlots = await this.getOccupiedSlots(doctorFromCrm.id);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const { startDate, endDate } = this.getPeriod(date, rules, today);
            const appointmentDuration = this.getAppointmentDuration(doctorInRules, appointmentType);

            const availableSlots = rules?.schedule
                ? this.buildSlotsFromSchedule(rules, doctorLastName, date, startDate, endDate, today, occupiedSlots, appointmentDuration, doctorInRules)
                : this.buildSlotsDefault(startDate, endDate, today, occupiedSlots, appointmentDuration);

            if (availableSlots.length === 0) {
                return this.buildNoSlotsMessage(doctorName, date, rules, doctorLastName);
            }

            return this.formatSlotsResponse(doctorName, availableSlots);
        } catch (error) {
            console.error('Ошибка при получении доступных окон врача:', error);
            return `Произошла ошибка при получении доступных окон. Попробуйте позже.`;
        }
    }

    private async getRulesFromRedis(): Promise<any> {
        const rulesJson = await this.redisService.get('rules');
        return rulesJson ? JSON.parse(rulesJson) : null;
    }

    private matchDoctorName(d: any, doctorLastName: string): boolean {
        const last = (d.lastName || '').toLowerCase().trim();
        const name = (d.name || '').toLowerCase().trim();
        const search = doctorLastName.toLowerCase();
        if (last && (last === search || last.includes(search) || search.includes(last))) return true;
        const firstWord = name.split(/\s+/)[0] || name;
        return firstWord === search || name.includes(search) || search.includes(firstWord);
    }

    private async getOccupiedSlots(doctorId: number): Promise<Set<string>> {
        const appointments = await this.doctorService.getDoctorsTimeToAppointment(doctorId);
        const set = new Set<string>();
        appointments.forEach((appointmentDate: string) => {
            const d = new Date(appointmentDate);
            set.add(`${d.toISOString().split('T')[0]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
        });
        return set;
    }

    private getPeriod(date: string | undefined, rules: any, today: Date): { startDate: Date; endDate: Date } {
        if (date) {
            const start = new Date(date + 'T00:00:00');
            start.setHours(0, 0, 0, 0);
            const end = new Date(date + 'T23:59:59');
            end.setHours(23, 59, 59, 999);
            return { startDate: start, endDate: end };
        }
        if (rules?.period?.start && rules?.period?.end) {
            const start = new Date(rules.period.start + 'T00:00:00');
            start.setHours(0, 0, 0, 0);
            const end = new Date(rules.period.end + 'T23:59:59');
            end.setHours(23, 59, 59, 999);
            return { startDate: start, endDate: end };
        }
        const start = new Date(today);
        const end = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
        end.setHours(23, 59, 59, 999);
        return { startDate: start, endDate: end };
    }

    private getAppointmentDuration(doctor: any, appointmentType?: string): number {
        if (appointmentType === 'primary') return doctor?.appointmentTypes?.primary || doctor?.duration?.primary || 60;
        if (appointmentType === 'follow_up') return doctor?.appointmentTypes?.follow_up || doctor?.duration?.repeat || 30;
        if (appointmentType === 'ultrasound') return doctor?.appointmentTypes?.ultrasound || doctor?.duration?.ultrasound || 30;
        if (appointmentType === 'analyses') return doctor?.appointmentTypes?.analyses || doctor?.duration?.analyses || 15;
        if (appointmentType === 'xray') return doctor?.appointmentTypes?.xray || doctor?.duration?.xray || 30;
        return doctor?.appointmentTypes?.primary || doctor?.duration?.primary || 60;
    }

    private buildSlotsFromSchedule(
        rules: any,
        doctorLastName: string,
        date: string | undefined,
        startDate: Date,
        endDate: Date,
        today: Date,
        occupiedSlots: Set<string>,
        appointmentDuration: number,
        doctor: any,
    ): Array<{ date: string; time: string; type: string }> {
        const entries = Array.isArray(rules.schedule)
            ? rules.schedule.map((item: any) => [item.date, item])
            : Object.entries(rules.schedule);
        const result: Array<{ date: string; time: string; type: string }> = [];

        for (const [scheduleDate, daySchedule] of entries) {
            const day = daySchedule as any;
            const scheduleDateObj = new Date(scheduleDate + 'T00:00:00');
            scheduleDateObj.setHours(0, 0, 0, 0);
            if (date && scheduleDate !== date) continue;
            if (scheduleDateObj < today || scheduleDateObj < startDate || scheduleDateObj > endDate) continue;

            const doctorAppointments = day.doctorAppointments || day.reception || [];
            const procedureProviders = day.procedureProviders || day.procedures || [];
            const walkInOnly = day.walkInOnly || day.liveQueue || false;
            const isDoctorWorking = doctorAppointments.some((name: string) => this.nameMatches(name, doctorLastName));
            const isProcedureOnly = procedureProviders.some((name: string) => this.nameMatches(name, doctorLastName)) && !isDoctorWorking;
            if (isProcedureOnly || walkInOnly || !isDoctorWorking) continue;

            const clinicOpensAt = day.clinicOpensAt || '09:00';
            const specialTags = day.specialTags || [];
            const isSurgeryDay = day.surgeryDay || specialTags.includes('surgery_day');
            const isDentalDay = day.dentistryDay || day.dentalDay || specialTags.includes('dental_day');
            const isCardiologyDay = day.cardiologyDay || specialTags.includes('cardiology_day');
            const br = rules.businessRules || {};
            let timeSlots: string[] = [];
            if (isSurgeryDay && br.surgery_day?.surgeon?.toLowerCase() === doctorLastName.toLowerCase()) {
                timeSlots = br.surgery_day.fixedConsultSlots || br.surgery_day.slots || [];
            } else if (isDentalDay && br.dental_day?.dentist?.toLowerCase() === doctorLastName.toLowerCase()) {
                timeSlots = br.dental_day.fixedSlots || br.dental_day.slots || [];
            } else if (isCardiologyDay && br.cardiology_day?.cardiologist?.toLowerCase() === doctorLastName.toLowerCase()) {
                timeSlots = this.generateTimeSlots(br.cardiology_day.startTime || '10:00', br.cardiology_day.endTime || '20:00', 60);
            } else {
                timeSlots = this.generateTimeSlots(clinicOpensAt, '18:00', appointmentDuration);
            }

            timeSlots.forEach(timeSlot => {
                const key = `${scheduleDate} ${timeSlot}`;
                if (!occupiedSlots.has(key)) {
                    result.push({ date: scheduleDate, time: timeSlot, type: 'primary' });
                }
            });
        }
        return result;
    }

    private nameMatches(name: string, doctorLastName: string): boolean {
        const lower = name.toLowerCase().trim();
        const first = lower.split(/\s+/)[0] || lower;
        const search = doctorLastName.toLowerCase();
        return first === search || lower.includes(search);
    }

    private buildSlotsDefault(
        startDate: Date,
        endDate: Date,
        today: Date,
        occupiedSlots: Set<string>,
        appointmentDuration: number,
    ): Array<{ date: string; time: string; type: string }> {
        const result: Array<{ date: string; time: string; type: string }> = [];
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const current = new Date(d);
            current.setHours(0, 0, 0, 0);
            if (current < today) continue;
            const dateStr = current.toISOString().split('T')[0];
            const timeSlots = this.generateTimeSlots('09:00', '18:00', appointmentDuration);
            timeSlots.forEach(timeSlot => {
                if (!occupiedSlots.has(`${dateStr} ${timeSlot}`)) {
                    result.push({ date: dateStr, time: timeSlot, type: 'primary' });
                }
            });
        }
        return result;
    }

    private buildNoSlotsMessage(doctorName: string, date: string | undefined, rules: any, doctorLastName: string): string {
        if (!rules?.schedule) {
            return `К сожалению, у врача ${doctorName} нет доступных окон для записи${date ? ` на ${date}` : ''}. Все слоты заняты.`;
        }
        const entries = Array.isArray(rules.schedule) ? rules.schedule.map((item: any) => [item.date, item]) : Object.entries(rules.schedule);
        const datesWithDoctor = entries
            .filter(([, day]: [string, any]) => (day.doctorAppointments || day.reception || []).some((name: string) => this.nameMatches(name, doctorLastName)))
            .map(([d]) => d);
        if (datesWithDoctor.length === 0) {
            return `Врач "${doctorName}" не указан в расписании ни на одну дату. Возможно, он работает только по живой очереди или не ведет прием по записи.`;
        }
        return `К сожалению, у врача ${doctorName} нет доступных окон для записи${date ? ` на ${date}` : ''}. Врач указан в расписании на даты: ${datesWithDoctor.join(', ')}, но все слоты заняты.`;
    }

    private formatSlotsResponse(doctorName: string, slots: Array<{ date: string; time: string }>): string {
        const byDate: Record<string, string[]> = {};
        slots.forEach(slot => {
            if (!byDate[slot.date]) byDate[slot.date] = [];
            byDate[slot.date].push(slot.time);
        });
        let text = `Доступные окна для записи к врачу ${doctorName}:\n\n`;
        Object.entries(byDate)
            .sort()
            .forEach(([date, times]) => {
                const dateObj = new Date(date);
                const dateStr = dateObj.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });
                text += `📅 ${dateStr} (${date}):\n`;
                times.sort().forEach(t => { text += `   • ${t}\n`; });
                text += '\n';
            });
        return text;
    }

    generateTimeSlots(startTime: string, endTime: string, durationMinutes: number): string[] {
        const [startH, startM] = startTime.split(':').map(Number);
        const [endH, endM] = endTime.split(':').map(Number);
        const start = new Date();
        start.setHours(startH, startM, 0, 0);
        const end = new Date();
        end.setHours(endH, endM, 0, 0);
        const slots: string[] = [];
        let current = new Date(start);
        while (current < end) {
            slots.push(`${String(current.getHours()).padStart(2, '0')}:${String(current.getMinutes()).padStart(2, '0')}`);
            current = new Date(current.getTime() + durationMinutes * 60 * 1000);
        }
        return slots;
    }
}
