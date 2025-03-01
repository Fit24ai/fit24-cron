import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  PendingStakesEnum,
  TransactionStatusEnum,
} from 'src/types/transaction';

export type UserTotalBusinessDocument = HydratedDocument<UserTotalBusiness>;

@Schema({ timestamps: true, collection: 'user-total-business' })
export class UserTotalBusiness {
  @Prop({ type: String, required: true })
  walletAddress: string;

  @Prop({ type: Number, required: true })
  eligibleLevel: number;

  @Prop({ type: Number, required: true })
  totalLevel: number;

  @Prop({ type: Number, required: true })
  selfStakes: number;

  @Prop({ type: Number, required: true })
  selfStakesUsd: number;

  @Prop({ type: Number, required: true })
  eligibleReferralBusiness: number;

  @Prop({ type: Number, required: true })
  eligibleReferralBusinessUsd: number;

  @Prop({ type: Number, required: true })
  totalReferralBusiness: number;

  @Prop({ type: Number, required: true })
  totalReferralBusinessUsd: number;
}

export const UserTotalBusinessSchema =
  SchemaFactory.createForClass(UserTotalBusiness);
