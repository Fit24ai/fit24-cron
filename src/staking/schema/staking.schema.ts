import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type StakingDocument = HydratedDocument<Staking>;

@Schema({ timestamps: true, collection: 'stakings' })
export class Staking {
  @Prop({ type: Number, required: true })
  stakeId: number;
  @Prop({ type: String, required: true })
  walletAddress: string;

  @Prop({ type: String, required: true })
  txHash: string;

  @Prop({ type: Number, required: true })
  amount: number;

  @Prop({ type: Number, required: true })
  apr: number;

  @Prop({ type: Number, required: true })
  poolType: number;

  @Prop({ type: Number, required: true })
  startTime: number;

  @Prop({ type: Number, required: true })
  stakeDuration: number;

  @Prop({ type: Boolean, required: false })
  isReferred:boolean

  @Prop({ type: Number, required: false })
  level: number;

  @Prop({ type: Number, required: false })
  refId: number;

}

export const StakingSchema = SchemaFactory.createForClass(Staking);
