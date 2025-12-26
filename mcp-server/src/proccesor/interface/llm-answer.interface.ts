export interface LLMAnswer {
    action: 'getClinics' | 'getUsers' | 'getServices' | 'getClients' | 'getPatients' | 'getAppointments' | 'createAppointment' | 'updateAppointment';
}