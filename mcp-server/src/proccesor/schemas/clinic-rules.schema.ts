import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";
import { ClinicRulesJson } from "../interface/clinic-rules-json.interface";

export type ClinicRulesDocument = ClinicRules & Document;

@Schema({ collection: 'clinic_rules', timestamps: true })
export class ClinicRules {
    @Prop({ type: Object, required: true })
    content: ClinicRulesJson;

    @Prop()
    fileName?: string;

    @Prop()
    mimeType?: string;

    @Prop()
    rawText?: string;
}

export const ClinicRulesSchema = SchemaFactory.createForClass(ClinicRules);
