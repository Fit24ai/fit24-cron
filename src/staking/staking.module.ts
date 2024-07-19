import { Module } from '@nestjs/common';
import { StakingService } from './staking.service';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ClaimedRewardForStakeHistory,
  ClaimedRewardForStakeHistorySchema,
} from './schema/claimedRewardForStakeHistory.schema';
import { Staking, StakingSchema } from './schema/staking.schema';
import { EthersService } from 'src/ethers/ethers.service';
import { StakeDuration, StakeDurationSchema } from './schema/stakeDuration.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Staking.name, schema: StakingSchema },
      {
        name: ClaimedRewardForStakeHistory.name,
        schema: ClaimedRewardForStakeHistorySchema,
      },
      { name: StakeDuration.name, schema: StakeDurationSchema },

    ]),
  ],
  providers: [StakingService,EthersService],
})
export class StakingModule {}
