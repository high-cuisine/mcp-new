export class InitAuthDTO {
  apiId: number;
  apiHash: string;
  phoneNumber: string;
}

export class VerifyCodeDTO {
  phoneNumber: string;
  code: string;
  phoneCodeHash: string;
}

export class VerifyPasswordDTO {
  phoneNumber: string;
  password: string;
  phoneCodeHash: string;
}

