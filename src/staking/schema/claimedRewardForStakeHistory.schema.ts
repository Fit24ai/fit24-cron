import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ClaimedRewardForStakeHistoryDocument = HydratedDocument<ClaimedRewardForStakeHistory>;

@Schema({ timestamps: true, collection: 'claimedRewardHistories' })
export class ClaimedRewardForStakeHistory {
  @Prop({ type: Number, required: true })
  stakeId: number;

  @Prop({ type: String, required: true })
  walletAddress: string;

  @Prop({ type: Number, required: true })
  amount: number;

  @Prop({ type: Number, required: true })
  timestamp: number;

  @Prop({ type: String, required: true })
  txHash: string;
}

export const ClaimedRewardForStakeHistorySchema =
  SchemaFactory.createForClass(ClaimedRewardForStakeHistory);
