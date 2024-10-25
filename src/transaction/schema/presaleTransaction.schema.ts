import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  ChainEnum,
  DistributionStatusEnum,
  MigrationStatus,
  TransactionStatusEnum,
} from 'src/types/transaction';

export type PresaleTransactionDocument = HydratedDocument<PresaleTransaction>;

@Schema({ timestamps: true, collection: 'transaction' })
export class PresaleTransaction {
  @Prop({ type: String, required: true })
  transactionHash: string;

  @Prop({ type: String })
  distributionHash: string;

  @Prop({ type: String, required: true, default: '0' })
  amountBigNumber: string;

  @Prop({ type: String })
  tokenAddress: string;

  @Prop({ type: String, enum: ChainEnum, required: true })
  chain: ChainEnum;

  @Prop({
    type: String,
    enum: TransactionStatusEnum,
    required: true,
    default: TransactionStatusEnum.PENDING,
  })
  transactionStatus: TransactionStatusEnum;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user: Types.ObjectId;

  @Prop({ type: String, required: true, default: '0' })
  tokenAmount: string;

  @Prop({
    type: String,
    enum: DistributionStatusEnum,
    required: true,
    default: DistributionStatusEnum.PENDING,
  })
  distributionStatus: DistributionStatusEnum;

  @Prop({
    type: String,
    enum: MigrationStatus,
    required: true,
    default: MigrationStatus.PENDING,
  })
  migrationStatus: MigrationStatus;

  @Prop({ type: String, nullable: true })
  vestingHash: string;
}

export const PresaleTransactionSchema =
  SchemaFactory.createForClass(PresaleTransaction);
