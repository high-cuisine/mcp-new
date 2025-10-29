

export interface PetType {
    id: number;
    title: string;
    picture: string;
    type: string;
    breeds: Breed[];
}

export interface Breed {
    id: number;
    title: string;
    pet_type_id: number;
}

export interface GetPetTypesDto {
    success: boolean;
    message: string;
    data: {
        totalCount: number;
        petType: PetType[];
    }
}