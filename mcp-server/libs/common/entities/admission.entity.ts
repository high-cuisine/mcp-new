import { Client } from "./client.entity";
import { Pet } from "./pet.entity";

export interface Admission {
    id: string;
    admission_date: string;
    description: string;
    client_id: string;
    patient_id: string;
    user_id: string;
    type_id: string;
    admission_length: string;
    status: string;
    clinic_id: string;
    direct_direction: string;
    creator_id: string;
    create_date: string;
    escorter_id: string;
    reception_write_channel: string;
    is_auto_create: string;
    pet: Pet;
    client: Client;
    wait_time: string;
}
