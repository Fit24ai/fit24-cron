import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LogDescription, ethers } from 'ethers';
import { EthersService } from 'src/ethers/ethers.service';
import { StakingContract } from 'src/ethers/libs/contract';
import { ClaimedRewardForStakeHistory } from './schema/claimedRewardForStakeHistory.schema';
import { Staking } from './schema/staking.schema';
import { StakeDuration } from './schema/stakeDuration.schema';

@Injectable()
export class StakingService {
  constructor(
    private readonly ethersService: EthersService,
    @InjectModel(ClaimedRewardForStakeHistory.name)
    private claimedRewardForStakeModel: Model<ClaimedRewardForStakeHistory>,
    @InjectModel(Staking.name) private StakingModel: Model<Staking>,
    @InjectModel(StakeDuration.name)
    private StakeDurationModel: Model<StakeDuration>,
  ) {}

  private BigIntToNumber(value: BigInt) {
    return Number(value) / Math.pow(10, 18);
  }

  async syncClaimedRewardForStake(block: number) {
    const fromBlock = await this.ethersService.provider.getBlockNumber();
    const events = await this.ethersService.provider.getLogs({
      address: StakingContract,
      fromBlock: fromBlock - block,
      toBlock: 'latest',
      topics: [process.env.REWARD_CLAIMED_TOPIC],
    });

    events.map(async (event) => {
      const parsedEvent = this.ethersService.stakingInterface.parseLog(event);
      const isExist = await this.claimedRewardForStakeModel.findOne({
        txHash: { $regex: event.transactionHash, $options: 'i' },
        stakeId: Number(parsedEvent.args[0]),
        walletAddress: { $regex: parsedEvent.args[1], $options: 'i' },
      });

      if (isExist) {
        return;
      }

      const formattedClaimedLog = {
        stakeId: Number(parsedEvent[0]),
        walletAddress: parsedEvent[1],
        amount: this.BigIntToNumber(parsedEvent[2]),
        timestamp: Number(parsedEvent[3]),
        txHash: event.transactionHash,
      };
      await this.claimedRewardForStakeModel.create(formattedClaimedLog);
    });
  }

  async syncReferralStake(block: number) {
    const fromBlock = await this.ethersService.provider.getBlockNumber();
    const events = await this.ethersService.provider.getLogs({
      address: StakingContract,
      fromBlock: fromBlock - block,
      toBlock: 'latest',
      topics: [process.env.STAKED_TOPIC],
    });
    events.map(async (event) => {
      const parsedEvent = this.ethersService.stakingInterface.parseLog(event);
      const isExist = await this.StakingModel.findOne({
        txHash: { $regex: event.transactionHash, $options: 'i' },
        stakeId: Number(parsedEvent.args[5]),
        walletAddress: { $regex: parsedEvent.args[0], $options: 'i' },
      });

      if (isExist) {
        return;
      }

      const receipt = await this.ethersService.provider.getTransactionReceipt(
        event.transactionHash,
      );

      const stakedLogs: LogDescription =
        this.ethersService.stakingInterface.parseLog(
          receipt?.logs[receipt.logs.length - 1],
        );

      const filteredLogs = receipt.logs.filter(
        (log) => log.topics[0] === process.env.REFERRAL_TOPIC,
      );

      const stakeDuration = await this.StakeDurationModel.findOne({
        poolType: Number(stakedLogs.args[3]),
      });

      if (filteredLogs.length > 0) {
        const refStakedLogs = filteredLogs.map((log) => {
          const parsedLog =
            this.ethersService.stakingInterface.parseLog(log).args;

          const formattedReferralLog = {
            stakeId: Number(parsedLog[2]),
            walletAddress: parsedLog[0],
            amount: this.BigIntToNumber(parsedLog[1]),
            apr: Number(stakedLogs.args[2]) / 10,
            poolType: Number(stakedLogs.args[3]),
            startTime: Number(stakedLogs.args[4]),
            stakeDuration: stakeDuration.duration,
            txHash: event.transactionHash,
            isReferred: true,
            level: Number(parsedLog[3]),
            refId: Number(parsedLog[4]),
          };

          return formattedReferralLog;
        });

        await this.StakingModel.insertMany(refStakedLogs);
      }
      await this.StakingModel.create({
        stakeId: Number(stakedLogs.args[5]),
        walletAddress: stakedLogs.args[0],
        amount: this.BigIntToNumber(stakedLogs.args[1]),
        apr: Number(stakedLogs.args[2]) / 10,
        poolType: Number(stakedLogs.args[3]),
        startTime: Number(stakedLogs.args[4]),
        stakeDuration: stakeDuration.duration,
        txHash: event.transactionHash,
        isReferred: false,
      });
    });
  }
  @Cron(CronExpression.EVERY_5_MINUTES)
  handleCron() {
    this.syncClaimedRewardForStake(999);
    this.syncReferralStake(999);
  }
}
