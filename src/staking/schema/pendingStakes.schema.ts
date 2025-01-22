import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  PendingStakesEnum,
  TransactionStatusEnum,
} from 'src/types/transaction';

export type PendingStakesDocument = HydratedDocument<PendingStakes>;

@Schema({ timestamps: true, collection: 'pending-stakes' })
export class PendingStakes {
  @Prop({ type: String, required: true })
  walletAddress: string;

  @Prop({ type: Number, required: true })
  level: number;

  @Prop({ type: [Number], required: true })
  stakes: number[];

  @Prop({ type: String, enum: PendingStakesEnum, required: true })
  status: PendingStakesEnum;
}

export const PendingStakesSchema = SchemaFactory.createForClass(PendingStakes);
