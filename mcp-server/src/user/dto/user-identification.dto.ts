export class UserIdentificationDto {
    token: string;
    verificationType: 'LIVENESS' | 'FULL';
}