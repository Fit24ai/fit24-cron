import {
  TransactionStatusEnum,
  ChainEnum,
  DistributionStatusEnum,
  StakingStatus,
  MigrationStatus,
} from 'src/types/transaction';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type StakingTransactionDocument = HydratedDocument<StakingTransaction>;

@Schema({ timestamps: true, collection: 'stakingTransaction' })
export class StakingTransaction {
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

  @Prop({ type: String, required: true, default: '0' })
  apr: number;

  @Prop({ type: String, required: true, default: '0' })
  poolType: number;

  @Prop({
    type: String,
    enum: DistributionStatusEnum,
    required: true,
    default: DistributionStatusEnum.PENDING,
  })
  distributionStatus: DistributionStatusEnum;

  @Prop({
    type: String,
    enum: StakingStatus,
    required: true,
    default: StakingStatus.PENDING,
  })
  stakingStatus: StakingStatus;

  @Prop({
    type: String,
    enum: MigrationStatus,
    required: true,
    default: MigrationStatus.PENDING,
  })
  migrationStatus: MigrationStatus;
}

export const StakingTransactionSchema =
  SchemaFactory.createForClass(StakingTransaction);
