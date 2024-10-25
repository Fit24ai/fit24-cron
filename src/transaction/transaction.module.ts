import { Module } from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { EthersService } from 'src/ethers/ethers.service';
import { MongooseModule, Schema } from '@nestjs/mongoose';
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
import {
  StakingMigrate,
  StakingMigrateSchema,
} from './schema/stakingMigrate.schema';
import {
  PresaleTransaction,
  PresaleTransactionSchema,
} from './schema/presaleTransaction.schema';
import {
  ReferralTransaction,
  ReferralTransactionSchema,
} from 'src/staking/schema/referralTransaction.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StakingTransaction.name, schema: StakingTransactionSchema },
      { name: PresaleTransaction.name, schema: PresaleTransactionSchema },
      { name: ReferralTransaction.name, schema: ReferralTransactionSchema },
      { name: User.name, schema: UserSchema },
      { name: Staking.name, schema: StakingSchema },
      { name: StakingMigrate.name, schema: StakingMigrateSchema },
      { name: StakeDuration.name, schema: StakeDurationSchema },
    ]),
  ],
  providers: [TransactionService, EthersService],
})
export class TransactionModule {}
