import { Injectable } from "@nestjs/common";
import { CRM_API } from "../constants/api";
import { GetClinicsDto } from "../dto/getClinics.dto";
import { GetPetTypesDto } from "../dto/getPetTypes.dto";

@Injectable()
export class CrmService {

    constructor() {
    
    }

    private async handleRequest(url: string, options: RequestInit, method: string) {
        const timeout = 30000; // 30 seconds timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-REST-API-KEY': process.env.CRM_API_KEY || ''
                },
                method,
                signal: controller.signal,
                ...options
            });
            
            clearTimeout(timeoutId);
            
            if(response.ok) {
                return response.json();
            } else {
                throw new Error(`Failed to ${method} ${url}: ${response.statusText}`);
            }
        } catch (error) { 
            clearTimeout(timeoutId);
            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error(`Request timeout after ${timeout}ms: ${url}`);
            }
            if (error instanceof Error && 'code' in error && error.code === 'UND_ERR_CONNECT_TIMEOUT') {
                throw new Error(`Connection timeout: Unable to connect to ${url}`);
            }
            throw error;
        }
    }   

    async getClinics(): Promise<GetClinicsDto> {
        return await this.handleRequest(CRM_API.GET_CLINICS, {}, 'GET');
    }

    async getUsers() {
        return await this.handleRequest(CRM_API.GET_USERS, {}, 'GET');
    }

    async getPatients() {
        return await this.handleRequest(CRM_API.GET_PATIENTS, {}, 'GET');
    }
    
    async getAppointments(clinicId?: number, clientId?: number, startDate?: string, endDate?: string) {
        let url = CRM_API.GET_APPOINTMENTS;
        const params = new URLSearchParams();
        
        params.append('offset', '0');
        params.append('limit', '1000'); // Увеличиваем лимит для поиска всех записей
        params.append('sort', JSON.stringify([{"property":"admission_date","direction":"DESC"}])); // Сортируем по убыванию, чтобы новые записи были первыми
        
        const filter: Array<{property: string, value: any, operator: string}> = [];
        
        // Всегда применяем фильтры по clinicId и clientId, если они указаны
        if (clinicId !== undefined) {
            filter.push({"property":"clinic_id","value":clinicId,"operator":"="});
        }
        
        if (clientId !== undefined) {
            filter.push({"property":"client_id","value":clientId,"operator":"="});
        }
        
        // Фильтруем записи по диапазону дат только если указаны обе даты
        if (startDate && endDate) {
            filter.push({"property":"admission_date","value":startDate,"operator":">="});
            filter.push({"property":"admission_date","value":endDate,"operator":"<="});
        }
        
        if (filter.length > 0) {
            params.append('filter', JSON.stringify(filter));
        }
        
        url += '?' + params.toString();
        
        console.log(`[getAppointments] URL: ${url}`);
        console.log(`[getAppointments] Параметры: clinicId=${clinicId}, clientId=${clientId}, startDate=${startDate}, endDate=${endDate}`);
      
        const data = await this.handleRequest(url, {}, 'GET');
        
        console.log(`[getAppointments] Получено записей от API: ${data?.data?.admission?.length || 0}`);
        console.log(`[getAppointments] Первые 3 записи:`, data?.data?.admission?.slice(0, 3).map((a: any) => ({
            id: a.id,
            date: a.admission_date,
            client_id: a.client_id,
            clinic_id: a.clinic_id,
            status: a.status
        })) || []);
        
        // Дополнительная фильтрация на клиентской стороне, если API не применил фильтры
        if (data?.data?.admission && Array.isArray(data.data.admission)) {
            let filtered = [...data.data.admission];
            const beforeFilter = filtered.length;
            
            // Фильтрация по датам
            if (startDate && endDate) {
                const start = new Date(startDate);
                const end = new Date(endDate);
                
                filtered = filtered.filter((appointment: any) => {
                    if (!appointment.admission_date) return false;
                    const appointmentDate = new Date(appointment.admission_date);
                    return appointmentDate >= start && appointmentDate <= end;
                });
                console.log(`[getAppointments] После фильтрации по датам: ${beforeFilter} -> ${filtered.length}`);
            }
            
            // Фильтрация по клинике
            if (clinicId !== undefined) {
                const beforeClinicFilter = filtered.length;
                filtered = filtered.filter((appointment: any) => {
                    const appointmentClinicId = typeof appointment.clinic_id === 'string' 
                        ? parseInt(appointment.clinic_id, 10) 
                        : appointment.clinic_id;
                    return appointmentClinicId === clinicId;
                });
                console.log(`[getAppointments] После фильтрации по клинике (${clinicId}): ${beforeClinicFilter} -> ${filtered.length}`);
            }
            
            // Фильтрация по клиенту
            if (clientId !== undefined) {
                const beforeClientFilter = filtered.length;
                filtered = filtered.filter((appointment: any) => {
                    const appointmentClientId = typeof appointment.client_id === 'string' 
                        ? parseInt(appointment.client_id, 10) 
                        : appointment.client_id;
                    return appointmentClientId === clientId;
                });
                console.log(`[getAppointments] После фильтрации по клиенту (${clientId}): ${beforeClientFilter} -> ${filtered.length}`);
            }
            
            data.data.admission = filtered;
            
            // Обновляем общее количество после фильтрации
            if (data.data.totalCount !== undefined) {
                data.data.totalCount = filtered.length;
            }
            
            console.log(`[getAppointments] Итого записей после всех фильтров: ${filtered.length}`);
        }
        
        return data;
    }
    async getAppointmentsForClientForYear(clientId: number, clinicId?: number, startDate?: string) {
        // Если дата начала не указана, используем дату месяц назад (чтобы включить недавно созданные записи)
        const today = new Date();
        const monthAgo = new Date(today);
        monthAgo.setMonth(today.getMonth() - 1);
        const startDate_iso = startDate || monthAgo.toISOString().split('T')[0];
        
        // Вычисляем дату конца года (365 дней от начала)
        const endDateObj = new Date(startDate_iso);
        endDateObj.setDate(endDateObj.getDate() + 365);
        const endDate = endDateObj.toISOString().split('T')[0];
        
        console.log(`[getAppointmentsForClientForYear] Параметры:`, {
            clientId,
            clinicId,
            startDate: `${startDate_iso} 00:00:00`,
            endDate: `${endDate} 00:00:00`
        });
        
        const result = await this.getAppointments(
            clinicId, 
            clientId,
            `${startDate_iso} 00:00:00`, 
            `${endDate} 00:00:00`
        );
        
        console.log(`[getAppointmentsForClientForYear] Результат:`, {
            totalCount: result?.data?.totalCount,
            appointmentsCount: result?.data?.admission?.length || 0,
            appointments: result?.data?.admission?.map((a: any) => ({
                id: a.id,
                date: a.admission_date,
                client_id: a.client_id,
                clinic_id: a.clinic_id,
                status: a.status
            })) || []
        });
        
        return result;
    }

    async getAppointmentsForWeek(clinicId: number, weekStartDate?: string) {
        // Если дата начала недели не указана, используем сегодняшнюю дату
        const startDate = weekStartDate || new Date().toISOString().split('T')[0];
        
        // Вычисляем дату конца недели (7 дней от начала)
        const endDateObj = new Date(startDate);
        endDateObj.setDate(endDateObj.getDate() + 7);
        const endDate = endDateObj.toISOString().split('T')[0];
        
        return await this.getAppointments(clinicId, undefined, `${startDate} 00:00:00`, `${endDate} 00:00:00`);
    }

    async createAppointment(type_id: number, admission_date: string, clinic_id: number, client_id: number, patient_id: number, description: string, admission_length: number, user_id: number) {
        try {
            const apiKey = process.env.CRM_API_KEY;
            if (!apiKey) {
                throw new Error('CRM_API_KEY environment variable is not set');
            }

            const requestBody = {
                reception_write_channel: 'not_confirmed',
                type_id,
                admission_date,
                clinic_id,
                client_id,
                patient_id,
                description,
                admission_length,
                user_id
            };

            console.log('[createAppointment] Создание записи с параметрами:', JSON.stringify(requestBody, null, 2));

            const response = await fetch(CRM_API.CREATE_APPOINTMENT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-REST-Api-Key': apiKey
                },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[createAppointment] CRM API Error:', response.status, errorText);
                throw new Error(`CRM API Error: ${response.status} - ${errorText}`);
            }
            
            const result = await response.json();
            console.log('[createAppointment] Запись создана успешно:', JSON.stringify(result, null, 2));
            
            // Извлекаем ID созданной записи для логирования
            let appointmentId: string | number | undefined;
            if (result?.data?.admission) {
                if (Array.isArray(result.data.admission) && result.data.admission.length > 0) {
                    appointmentId = result.data.admission[0].id;
                } else if (!Array.isArray(result.data.admission)) {
                    appointmentId = result.data.admission.id;
                }
            }
            if (appointmentId) {
                console.log(`[createAppointment] ID созданной записи: ${appointmentId}`);
            }
            
            return result;
        } catch (error) {
            console.error('[createAppointment] Error creating appointment:', error);
            throw error;
        }
    }

    async updateAppointment(id: string, appointment: any) {
        const response = await fetch(`${CRM_API.UPDATE_APPOINTMENT.replace('{id}', id)}`, {
            method: 'PUT',
            body: JSON.stringify(appointment),
        });
        return response.json();
    }

    async rescheduleAppointment(id: string, clinic_id: number, start: string, end: string) {
        try {
            const apiKey = process.env.CRM_API_KEY;
            if (!apiKey) {
                throw new Error('CRM_API_KEY environment variable is not set');
            }

            const response = await fetch(`${CRM_API.UPDATE_APPOINTMENT.replace('{id}', id)}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-REST-API-KEY': apiKey
                },
                body: JSON.stringify({
                    clinic_id,
                    start,
                    end
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('CRM API Error (rescheduleAppointment):', response.status, errorText);
                throw new Error(`CRM API Error: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Error rescheduling appointment:', error);
            throw error;
        }
    }

    async getServices(clinic_id: number) {
        const response = await fetch(CRM_API.GET_SERVICES.replace('{clinic_id}', clinic_id.toString()), {
            headers: {
                'Content-Type': 'application/json',
                'X-REST-Api-Key': process.env.CRM_API_KEY || ''
            }
        });
        return response.json();
    }

    async createClient(last_name: string, first_name: string, middle_name: string, cell_phone: string) {
        try {
            const apiKey = process.env.CRM_API_KEY;
            if (!apiKey) {
                throw new Error('CRM_API_KEY environment variable is not set');
            }


            const response = await fetch(CRM_API.CREATE_CLIENT, {
                method: 'POST',
                body: JSON.stringify({
                    "address": "",
                    "home_phone": "",
                    "work_phone": "",
                    "note": "",
                    "type_id": null,
                    "how_find": null,
                    "balance": "0.0000000000",
                    "email": "",
                    "city": "",
                    "city_id": null,
                    "date_register": "2021-09-20 09:08:48",
                    "cell_phone": cell_phone,
                    "zip": "",
                    "registration_index": null,
                    "vip": "0",
                    "last_name": last_name,
                    "first_name": first_name,
                    "middle_name": middle_name,
                    "status": "TEMPORARY",
                    "discount": "0",
                    "passport_series": "",
                    "lab_number": "",
                    "street_id": "0",
                    "apartment": "",
                    "unsubscribe": "0",
                    "in_blacklist": "0",
                    "last_visit_date": "0000-00-00 00:00:00",
                    "number_of_journal": "",
                    "phone_prefix": ""
                }),
                headers: {
                    'Content-Type': 'application/json',
                    'X-REST-Api-Key': apiKey
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('CRM API Error:', response.status, errorText);
                throw new Error(`CRM API Error: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Error creating client:', error);
            throw error;
        }
    }

    async getClientByPhone(phone: string) {
        return await this.handleRequest(CRM_API.GET_CLIENT_BY_PHONE.replace('{phone}', phone), {}, 'GET');
    }

    async getClients() {
        return await this.handleRequest(CRM_API.GET_CLIENTS, {}, 'GET');
    }

    async getDoctors() {
        return await this.handleRequest(CRM_API.GET_DOCTORS, {}, 'GET');
    }

    async createPet(owner_id:number, alias:string, type_id:number, breed_id:number) {
        try {
            const apiKey = process.env.CRM_API_KEY;
            if (!apiKey) {
                throw new Error('CRM_API_KEY environment variable is not set');
            }

            const response = await fetch(CRM_API.CREATE_PET, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-REST-Api-Key': apiKey
                },
                body: JSON.stringify({
                    owner_id,
                    alias,
                    type_id,
                    breed_id
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('CRM API Error (createPet):', response.status, errorText);
                console.error('Request body:', JSON.stringify({ owner_id, alias, type_id, breed_id }, null, 2));
                throw new Error(`CRM API Error: ${response.status} - ${errorText}`);
            }
            
            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Error creating pet:', error);
            throw error;
        }
    }

    async getPetTypes(): Promise<GetPetTypesDto> {
        return await this.handleRequest(CRM_API.GET_PET_TYPES, {}, 'GET');
    }

    /**
     * Получает занятые временные слоты для конкретной даты
     * @param date - дата в формате YYYY-MM-DD
     * @param clinicId - ID клиники (опционально)
     * @returns массив занятых временных слотов
     */
    async getOccupiedTimeSlots(date: string, clinicId?: number): Promise<string[]> {
        try {
            const appointments = await this.getAppointments();
            const occupiedSlots: string[] = [];
            
            if (appointments.data && appointments.data.admission) {
                appointments.data.admission.forEach((appointment: any) => {
                    const appointmentDate = appointment.admission_date?.split('T')[0];
                    if (appointmentDate === date) {
                        // Если указана клиника, фильтруем по ней
                        if (!clinicId || appointment.clinic_id === clinicId) {
                            const dateTime = new Date(appointment.admission_date);
                            const hours = dateTime.getHours();
                            const minutes = dateTime.getMinutes();
                            const timeSlot = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                            occupiedSlots.push(timeSlot);
                        }
                    }
                });
            }
            
            return occupiedSlots;
        } catch (error) {
            console.error('Ошибка при получении занятых слотов:', error);
            return [];
        }
    }

    async chanelAppointment(id: string) {
        try {
            const apiKey = process.env.CRM_API_KEY;
            if (!apiKey) {
                throw new Error('CRM_API_KEY environment variable is not set');
            }


            const response = await fetch(CRM_API.CHANEL_APPOINTMENT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-REST-API-KEY': apiKey
                },
                body: JSON.stringify({
                    id: parseInt(id)
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('CRM API Error (chanelAppointment):', response.status, errorText);
                throw new Error(`CRM API Error: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Error canceling appointment:', error);
            throw error;
        }
    }

    /**
     * Получает доступные даты с информацией о занятости
     * @param daysAhead - количество дней вперед для проверки
     * @param clinicId - ID клиники (опционально)
     * @returns массив дат с информацией о доступности
     */
    async getAvailableDates(daysAhead: number = 14, clinicId: number): Promise<Array<{date: string, occupiedSlots: string[]}>> {
        try {
            const appointments = await this.getAppointmentsForWeek(clinicId, new Date().toISOString());
            const availableDates: Array<{date: string, occupiedSlots: string[]}> = [];
            
            // Генерируем даты на ближайшие дни
            const today = new Date();
            for (let i = 0; i < daysAhead; i++) {
                const date = new Date(today);
                date.setDate(today.getDate() + i);
                
                // Пропускаем воскресенья
                if (date.getDay() === 0) continue;
                
                const dateStr = date.toISOString().split('T')[0];
                const occupiedSlots: string[] = [];
                
                if (appointments.data && appointments.data.admission) {
                    appointments.data.admission.forEach((appointment: any) => {
                        const appointmentDate = appointment.admission_date?.split('T')[0];
                        if (appointmentDate === dateStr) {
                            if (!clinicId || appointment.clinic_id === clinicId) {
                                const dateTime = new Date(appointment.admission_date);
                                const hours = dateTime.getHours();
                                const minutes = dateTime.getMinutes();
                                const timeSlot = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                                occupiedSlots.push(timeSlot);
                            }
                        }
                    });
                }
                
                availableDates.push({
                    date: dateStr,
                    occupiedSlots
                });
            }
            
            return availableDates;
        } catch (error) {
            console.error('Ошибка при получении доступных дат:', error);
            return [];
        }
    }

    async confirmAppointment(id: string) {
        return await this.handleRequest(CRM_API.CONFIRM_APPOINTMENT.replace('{id}', id), {}, 'POST');
    }

    async getFullDoctorsInfo(id: number) {
        return await this.handleRequest(CRM_API.GET_FULL_DOCTORS_INFO, {}, 'GET');
    }
  
}