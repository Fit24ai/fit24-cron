import { Module } from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { EthersService } from 'src/ethers/ethers.service';
import { MongooseModule } from '@nestjs/mongoose';
import {
  StakingTransaction,
  StakingTransactionSchema,
} from './schema/stakingTransaction.schema';
import { User, UserSchema } from './schema/user.schema';
import { Staking, StakingSchema } from 'src/staking/schema/staking.schema';
import {
  StakeDuration,
  StakeDurationSchema,
} from 'src/staking/schema/stakeDuration.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StakingTransaction.name, schema: StakingTransactionSchema },
      { name: User.name, schema: UserSchema },
      { name: Staking.name, schema: StakingSchema },
      { name: StakeDuration.name, schema: StakeDurationSchema },
    ]),
  ],
  providers: [TransactionService, EthersService],
})
export class TransactionModule {}
