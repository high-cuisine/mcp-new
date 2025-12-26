import { Injectable } from "@nestjs/common";
import { CrmService } from "./crm.service";

@Injectable()
export class DoctorService {
    constructor(
        private readonly crmService: CrmService
    ) {
        console.log('DoctorService constructor');
        // this.getDoctors().then(doctors => {
        //     console.log(JSON.stringify(doctors));
        // });
     
        // this.getDoctorsTimeToAppointment(2).then(appointments => {
        //     console.log(JSON.stringify(appointments));
        // });

        // this.getFullDoctorsInfo(5).then(doctor => {
        //     console.log('doctor123');
        //     console.log(JSON.stringify(doctor));
        // });

        // this.getDoctorsWithAppointment().then(doctors => {
        //     console.log(JSON.stringify(doctors));
        // });
    }

    async getDoctorsWithAppointment() {
        try {
            const doctors = await this.getFullDoctorsInfo(1);

            let arr: any[] = [];
            if (Array.isArray(doctors)) {
                arr = doctors;
            } else if (doctors?.data?.user && Array.isArray(doctors.data.user)) {
                // Структура: { success: true, data: { user: [...] } }
                arr = doctors.data.user;
            } else if (doctors?.data && Array.isArray(doctors.data)) {
                arr = doctors.data;
            } else if (doctors?.doctors && Array.isArray(doctors.doctors)) {
                arr = doctors.doctors;
            } else if (doctors?.users && Array.isArray(doctors.users)) {
                arr = doctors.users;
            }

            if (!Array.isArray(arr) || arr.length === 0) {
                return [];
            }

            const doctorsWithAppointments = await Promise.all(
                arr.map(async (doctor) => {
                    try {
                        const appointments = await this.getDoctorsTimeToAppointment(doctor.id);
                        return {
                            ...doctor,
                            appointments: appointments || []
                        };
                    } catch (error) {
                        console.error(`Ошибка при получении записей для врача ${doctor.id}:`, error);
                        return {
                            ...doctor,
                            appointments: []
                        };
                    }
                })
            );

            return doctorsWithAppointments;
        } catch (error) {
            console.error('Ошибка при получении врачей с записями:', error);
            return [];
        }
    }

    async getDoctors() {
        return await this.crmService.getDoctors();
    }

    async getFullDoctorsInfo(doctorId: number) {
        return await this.crmService.getFullDoctorsInfo(doctorId);
    }

    async getDoctorsTimeToAppointment(doctorId: number) {
        // Используем текущую дату для получения записей на текущую неделю
        const today = new Date().toISOString().split('T')[0];
        return await this.crmService.getAppointmentsForWeek(1, today).then(appointments => {
            if (!appointments?.data?.admission || !Array.isArray(appointments.data.admission)) {
                return [];
            }
            
            const now = new Date();
            // Получаем начало текущего дня для сравнения только по дате
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            
            return appointments.data.admission
                .filter((appointment: any) => {
                    // Фильтруем по ID врача (приводим к числу для сравнения)
                    const appointmentUserId = typeof appointment.user_id === 'string' 
                        ? parseInt(appointment.user_id, 10) 
                        : appointment.user_id;
                    
                    if (appointmentUserId !== doctorId) {
                        return false;
                    }
                    
                    // Фильтруем только будущие записи (начиная с начала текущего дня)
                    // Это позволяет включать записи на сегодня, даже если текущее время уже прошло
                    const appointmentDate = new Date(appointment.admission_date);
                    return appointmentDate >= todayStart;
                })
                .map((appointment: any) => appointment.admission_date)
                .sort(); // Сортируем по дате
        });
    }
}