import { Injectable } from "@nestjs/common";

@Injectable()
export class ModelService {
    constructor() {
        console.log('ModelService initialized');
    }
}