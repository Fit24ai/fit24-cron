import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type DeactivateStakesUsersDocument =
  HydratedDocument<DeactivateStakesUsers>;

@Schema({ timestamps: true, collection: 'deactivateStakesUsers' })
export class DeactivateStakesUsers {
  @Prop({ type: String, required: true })
  walletAddress: string;

  @Prop({ type: Boolean, nullable: true })
  isReferred: boolean;

  @Prop({ type: [Number], default: [] })
  stakeIds: number[];
}

export const DeactivateStakesUsersSchema = SchemaFactory.createForClass(
  DeactivateStakesUsers,
);
