import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EthersService } from 'src/ethers/ethers.service';
import { paymentContractAddress } from 'src/ethers/libs/contract';

@Injectable()
export class TransactionService {
  constructor(private readonly ethersService: EthersService) {}

  async syncClaimedRewardForStake(block: number) {
    const fromBlock = await this.ethersService.provider.getBlockNumber();
    const events = await this.ethersService.provider.getLogs({
      address: paymentContractAddress,
      fromBlock: fromBlock - block,
      toBlock: 'latest',
      topics: [process.env.REWARD_CLAIMED_TOPIC],
    });
  }

//   @Cron(CronExpression.EVERY_10_SECONDS)
//   handleCron() {
//     this.syncClaimedRewardForStake(999);
//     // this.syncReferralStake(999);
//   }
}
