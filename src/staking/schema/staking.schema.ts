import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { TransactionStatusEnum } from 'src/types/transaction';

export type StakingDocument = HydratedDocument<Staking>;

@Schema({ timestamps: true, collection: 'stakings' })
export class Staking {
  @Prop({ type: Number, required: true, default: 0 })
  stakeId: number;
  @Prop({ type: String, required: true })
  walletAddress: string;

  @Prop({ type: String, required: true })
  txHash: string;

  @Prop({ type: Number, required: true, default: 0 })
  amount: number;

  @Prop({ type: Number, required: true, default: 0 })
  apr: number;

  @Prop({ type: Number, required: true, default: 0 })
  poolType: number;

  @Prop({ type: Number, required: true })
  startTime: number;

  @Prop({ type: Number, required: true })
  stakeDuration: number;

  @Prop({ type: Boolean, required: false })
  isReferred: boolean;

  @Prop({ type: Number, required: false, default: 0 })
  totalClaimed: number;

  @Prop({ type: Number, required: false })
  level: number;

  @Prop({ type: Number, required: false })
  refId: number;

  @Prop({
    type: String,
    enum: TransactionStatusEnum,
    required: true,
    default: TransactionStatusEnum.PENDING,
  })
  transactionStatus: TransactionStatusEnum;
}

export const StakingSchema = SchemaFactory.createForClass(Staking);
