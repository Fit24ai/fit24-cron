import { EthersService } from 'src/ethers/ethers.service';
import { CreateStakesService } from './create-stakes.service';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Staking, StakingSchema } from 'src/staking/schema/staking.schema';
import {
  StakeDuration,
  StakeDurationSchema,
} from 'src/staking/schema/stakeDuration.schema';
import {
  ReferralTrail,
  ReferralTrailSchema,
} from 'src/staking/schema/referralTrail.schema';
import {
  PendingStakes,
  PendingStakesSchema,
} from 'src/staking/schema/pendingStakes.schema';
import {
  UserTotalBusiness,
  UserTotalBusinessSchema,
} from 'src/staking/schema/user-total-business';
import {
  UserTotalBusinessAfter1Dec,
  UserTotalBusinessAfter1DecSchema,
} from 'src/staking/schema/user-total-business-after-1dec';
import {
  DeactivateStakesUsers,
  DeactivateStakesUsersSchema,
} from 'src/staking/schema/deactivateStakesUsers.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Staking.name, schema: StakingSchema },
      { name: StakeDuration.name, schema: StakeDurationSchema },
      { name: ReferralTrail.name, schema: ReferralTrailSchema },
      { name: PendingStakes.name, schema: PendingStakesSchema },
      { name: UserTotalBusiness.name, schema: UserTotalBusinessSchema },
      {
        name: UserTotalBusinessAfter1Dec.name,
        schema: UserTotalBusinessAfter1DecSchema,
      },
      {
        name: DeactivateStakesUsers.name,
        schema: DeactivateStakesUsersSchema,
      },
    ]),
  ],
  providers: [CreateStakesService, EthersService],
})
export class CreateStakesModule {}
