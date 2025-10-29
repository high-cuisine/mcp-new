export interface Appointment {
    id: number;
    admission_date: string;
    description: string;
    client_id: number;
    patient_id: number;
    user_id: number;
    type_id: number;
    admission_length: string;
    status: string;
    clinic_id: number;
    direct_direction: number;
    creator_id: number;
    create_date: string;
    escorter_id: number;
    reception_write_channel: string;
    is_auto_create: number;
    invoices_sum: string;
    confirmation: string;
    pet: Pet;
    client: Client;
    doctor_data: DoctorData;
    admission_type_data: AdmissionTypeData;
    invoices: any[];
    wait_time: string;
}

export interface Pet {
    id: number;
    owner_id: number;
    type_id: number;
    alias: string;
    sex: string;
    date_register: string;
    birthday: string;
    note: string;
    breed_id: number;
    old_id: number | null;
    color_id: number;
    deathnote: string | null;
    deathdate: string | null;
    chip_number: string;
    lab_number: string;
    status: string;
    picture: string | null;
    weight: string;
    edit_date: string;
    pet_type_data: PetTypeData;
    breed_data: BreedData;
}

export interface PetTypeData {
    id: number;
    title: string;
    picture: string;
    type: string;
}

export interface BreedData {
    id: number;
    title: string;
    pet_type_id: number;
}

export interface Client {
    id: number;
    address: string;
    home_phone: string;
    work_phone: string;
    note: string;
    type_id: number;
    how_find: number;
    balance: string;
    email: string;
    city: string;
    city_id: number;
    date_register: string;
    cell_phone: string;
    zip: string;
    registration_index: number | null;
    vip: number;
    last_name: string;
    first_name: string;
    middle_name: string;
    status: string;
    discount: number;
    passport_series: string;
    lab_number: string;
    street_id: number;
    apartment: string;
    unsubscribe: number;
    in_blacklist: number;
    last_visit_date: string;
    number_of_journal: string;
    phone_prefix: string;
    unisender_phone_pristavka: string;
}

export interface DoctorData {
    id: number;
    last_name: string;
    first_name: string;
    middle_name: string;
    login: string;
    passwd: string;
    position_id: number;
    email: string;
    phone: string;
    cell_phone: string;
    address: string;
    role_id: number;
    is_active: number;
    calc_percents: number;
    nickname: string;
    last_change_pwd_date: string;
    is_limited: number;
    sip_number: string;
    user_inn: string;
}

export interface AdmissionTypeData {
    id: number;
    combo_manual_id: number;
    title: string;
    value: string;
    dop_param1: string;
    dop_param2: string;
    dop_param3: string;
    is_active: number;
}
