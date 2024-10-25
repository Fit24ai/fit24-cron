import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ChainEnum } from 'src/types/transaction';

export type ReferralTransactionDocument = HydratedDocument<ReferralTransaction>;

@Schema({ timestamps: true, collection: 'referralTransactions' })
export class ReferralTransaction {
  @Prop({ type: String, required: true })
  referrer: String;

  @Prop({ type: String, required: true })
  buyer: String;

  @Prop({ type: String, required: true, default: '0' })
  buyAmount: string;

  @Prop({ type: String, required: true, default: '0' })
  referralIncome: string;

  @Prop({ type: String, required: true })
  transactionHash: string;

  @Prop({ type: String })
  token: string;

  @Prop({
    type: String,
    enum: ChainEnum,
    required: true,
    default: ChainEnum.BINANCE,
  })
  chain: ChainEnum;
}

export const ReferralTransactionSchema =
  SchemaFactory.createForClass(ReferralTransaction);
