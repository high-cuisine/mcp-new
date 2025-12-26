import { Schema } from "@nestjs/mongoose";
import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
    id: { type: Number, index: true },
    email: { type: String, index: true, required: true },
    password: { type: String, required: true },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
    tokensTelegram: { type: Array, default: [] },

});

UserSchema.index({ id: 1, email: 1 });

UserSchema.index({ id: 1, email: 1 });

export { UserSchema };

