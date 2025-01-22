import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ReferralTrailDocument = HydratedDocument<ReferralTrail>;

@Schema({ timestamps: true, collection: 'referral-trail' })
export class ReferralTrail {
  @Prop({ type: String, required: true, unique: true })
  userAddress: string; // Address of the user

  @Prop({ type: String, required: false })
  referredBy?: string; // Address of the user who referred this user

  @Prop({ type: [String], default: [] })
  directMembers: string[];
}

export const ReferralTrailSchema = SchemaFactory.createForClass(ReferralTrail);
