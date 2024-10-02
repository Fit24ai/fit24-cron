import { Injectable } from '@nestjs/common';
import { EthersService } from 'src/ethers/ethers.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BigNumberish, formatUnits } from 'ethers';

const ether = new EthersService();
@Injectable()
export class ContractService {
  public icoContract = ether.icoContract;
  public signedIcoContract = ether.signedIcoContract;
  public stakingContract = ether.binanceStakingContract;

  public async getActiveStakesOfUser(user: string) {
    try {
      return await this.icoContract.getUserActiveStakes(user);
    } catch (error) {
      console.error('Could not find user active stakes:');
      return [];
    }
  }

  public async processWithdrawTokens(activeStake: BigNumberish, user: string) {
    console.log(user, Number(formatUnits(activeStake, 0)));
    try {
      const withdraw = await this.signedIcoContract.withdrawUserTokens(
        user,
        Number(formatUnits(activeStake, 0)),
      );
    } catch (error) {
      console.log('withdraw Unsuccessfull', error);
    }
  }

  public async processStake(activeStake: BigNumberish, user: string) {
    try {
      console.log('stake', activeStake);
      const idToStake = await this.icoContract.idToStake(activeStake);
      if (!idToStake) {
        return;
      }
      const poolType = formatUnits(idToStake[3], 0);
      const stakeDuration = await this.icoContract.stakeDuration(poolType);
      const blockTimestamp = BigInt(
        (await ether.provider.getBlock('latest')).timestamp,
      );
      const stakeEndTime = stakeDuration + idToStake[4];

      console.log('blockTimestamp', blockTimestamp);
      console.log('stakeEndTime', stakeEndTime);

      if (stakeEndTime < blockTimestamp) {
        console.log('Continue');
        this.processWithdrawTokens(activeStake, user);
      } else {
        console.log("Don't Continue");
      }
    } catch (error) {
      console.error('Error processing stake:');
    }
  }

  public async handleActiveStakes(activeStakes: BigNumberish[], user: string) {
    for (const activeStake of activeStakes) {
      await this.processStake(activeStake, user);
    }
  }

  public async readOnly() {
    try {
      const users = await this.icoContract.getAllUsers();
      if (!users) {
        return;
      }
      console.log(users);
      for (const user of users) {
        console.log('user:', user);
        const activeStakes = await this.getActiveStakesOfUser(user);
        if (activeStakes.length > 0) {
          console.log('Active stakes found');
          console.log(activeStakes);
          await this.handleActiveStakes(activeStakes, user);
        }
      }
    } catch (error) {
      console.error('Error:', error);
    }
  }

  public async updateClaimTreasury() {
    try {
      await this.signedIcoContract.claimTreasuryReward();
    } catch (error) {
      console.log('Unable to claim treasury reward');
    }
  }

  // private hasRun = false;
  @Cron('0 * * * *')
  async handleCron() {
    // if (this.hasRun) {
    //   return;
    // }
    // this.hasRun = true;
    console.log('Hello Ethers');
    await this.updateClaimTreasury();
    await this.readOnly();
  }
}
