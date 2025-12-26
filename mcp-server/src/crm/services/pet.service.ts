import { Injectable } from "@nestjs/common";
import { CrmService } from "./crm.service";

@Injectable()
export class PetService {
    private petTypes: Array<{ id: number; title: string; pet_type_id: number }> = [];
    
    constructor(
        private readonly crmService: CrmService
    ) {
        //this.onModuleInit();
    }

    async onModuleInit() {
        try {
            const petTypes = await this.crmService.getPetTypes();
            
            // Получаем массив пород в виде строк с pet_type_id
            const breedsWithTypeId = petTypes.data.petType
                .filter(petType => petType.breeds && Array.isArray(petType.breeds))
                .map(petType => 
                    petType.breeds.map(breed => ({
                        id: breed.id,
                        title: breed.title,
                        pet_type_id: breed.pet_type_id,
                    }))
                )
                .flat();
                
            this.petTypes = breedsWithTypeId;

            const petType = await this.getPetType('британец', this.petTypes);
      
            console.log(petType);
        } catch (error) {
            console.error('Failed to initialize pet types during module init:', error instanceof Error ? error.message : error);
            // Don't throw - allow the application to start even if pet types can't be loaded initially
            // They will be loaded on-demand when needed
        }
    }

    async createPetg(owner_id:number, alias:string, type_id:number, breed:string) {
        // Если petTypes не загружены, загружаем их
        if (this.petTypes.length === 0) {
            try {
                const petTypes = await this.crmService.getPetTypes();
                
                if (petTypes.data && petTypes.data.petType) {
                    const breedsWithTypeId = petTypes.data.petType
                        .filter(petType => petType.breeds && Array.isArray(petType.breeds))
                        .map(petType => 
                            petType.breeds.map(breed => ({
                                id: breed.id,
                                title: breed.title,
                                pet_type_id: breed.pet_type_id,
                            }))
                        )
                        .flat();
                        
                    this.petTypes = breedsWithTypeId;
                }
            } catch (error) {
                console.error('Ошибка при загрузке типов питомцев:', error);
                throw new Error(`Ошибка при загрузке типов питомцев: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
            }
        }

        const breedInfo = await this.getPetType(breed, this.petTypes);

        if (!breedInfo) {
            console.error(`Порода '${breed}' не найдена. Доступные породы:`, this.petTypes.map(p => p.title).slice(0, 10));
            throw new Error(`Порода '${breed}' не найдена`);
        }

        console.log(`Создание питомца: owner_id=${owner_id}, alias=${alias}, type_id=${breedInfo.pet_type_id}, breed_id=${breedInfo.id}`);

        return await this.crmService.createPet(owner_id, alias, breedInfo.pet_type_id, breedInfo.id);
    }

    private async getPetType(alias: string, petTypes: Array<{ id: number; title: string; pet_type_id: number }>) {
        if (!alias || petTypes.length === 0) {
            return null;
        }

        const aliasLower = alias.toLowerCase().trim();
        
        // Точное совпадение
        const exactMatch = petTypes.find(pet => 
            pet.title.toLowerCase() === aliasLower
        );
        if (exactMatch) {
            return exactMatch;
        }

        // Поиск по вхождению подстроки
        const containsMatch = petTypes.find(pet => 
            pet.title.toLowerCase().includes(aliasLower)
        );
        if (containsMatch) {
            return containsMatch;
        }

        // Поиск по началу строки
        const startsWithMatch = petTypes.find(pet => 
            pet.title.toLowerCase().startsWith(aliasLower)
        );
        if (startsWithMatch) {
            return startsWithMatch;
        }

        // Поиск по схожести (Levenshtein distance)
        const similarityMatches = petTypes
            .map(pet => ({
                ...pet,
                similarity: this.calculateSimilarity(aliasLower, pet.title.toLowerCase())
            }))
            .filter(match => match.similarity > 0.3) // порог схожести
            .sort((a, b) => b.similarity - a.similarity);

        return similarityMatches[0] || null;
    }

    private calculateSimilarity(str1: string, str2: string): number {
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) return 1.0;
        
        const distance = this.levenshteinDistance(longer, shorter);
        return (longer.length - distance) / longer.length;
    }

    private levenshteinDistance(str1: string, str2: string): number {
        const matrix = Array(str2.length + 1).fill(null).map(() => 
            Array(str1.length + 1).fill(null)
        );

        for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
        for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

        for (let j = 1; j <= str2.length; j++) {
            for (let i = 1; i <= str1.length; i++) {
                const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[j][i] = Math.min(
                    matrix[j][i - 1] + 1,
                    matrix[j - 1][i] + 1,
                    matrix[j - 1][i - 1] + indicator
                );
            }
        }

        return matrix[str2.length][str1.length];
    }
}       