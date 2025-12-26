import { PetTypeData } from './pet-type-data.entity';
import { BreedData } from './breed-data.entity';

export interface Pet {
    id: string;
    owner_id: string;
    type_id: string;
    alias: string;
    sex: string;
    date_register: string;
    birthday: string | null;
    note: string;
    breed_id: string;
    old_id: string | null;
    color_id: string;
    deathnote: string | null;
    deathdate: string | null;
    chip_number: string;
    lab_number: string;
    status: string;
    picture: string | null;
    weight: string;
    pet_type_data: PetTypeData;
    breed_data: BreedData;
}
