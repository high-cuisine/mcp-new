const BASE_URL = 'https://ooovete13.vetmanager2.ru/rest/api';

export const CRM_API = {
    GET_CLINICS: `${BASE_URL}/clinics`,
    GET_USERS: `${BASE_URL}/users`,
    GET_SERVICES: `${BASE_URL}/Good/ProductsDataForInvoice?clinic_id={clinic_id}`,
    GET_CLIENTS: `${BASE_URL}/client`,
    GET_CLIENT_BY_PHONE: `${BASE_URL}/client/clientsSearchData?search_query={phone}`,
    CREATE_CLIENT: `${BASE_URL}/client`,
    GET_PATIENTS: `${BASE_URL}/patients`,
    GET_APPOINTMENTS: `${BASE_URL}/Admission`,
    CREATE_APPOINTMENT: `${BASE_URL}/Admission`,
    UPDATE_APPOINTMENT: `${BASE_URL}/Admission/{id}`,
    GET_DOCTORS: `${BASE_URL}/userPosition`,
    CREATE_PET: `${BASE_URL}/pet`,
    CHANEL_APPOINTMENT: `${BASE_URL}/Admission/CancelAdmission`,
    GET_PET_TYPES: `${BASE_URL}/PetType`,
    CONFIRM_APPOINTMENT: `${BASE_URL}/Admission/ConfirmAdmission`,
    GET_FULL_DOCTORS_INFO: `${BASE_URL}/User`
}