import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ModeratorDocument = Moderator & Document;

@Schema({ collection: 'telegram_moderators', timestamps: true })
export class Moderator {
  @Prop({ required: true, unique: true })
  telegramId: string;

  @Prop()
  username?: string;

  @Prop()
  firstName?: string;

  @Prop()
  lastName?: string;
}

export const ModeratorSchema = SchemaFactory.createForClass(Moderator);
