// const ether = new EthersService();

import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import BigNumber from 'bignumber.js';
import { formatUnits, getAddress } from 'ethers';
import { Model } from 'mongoose';
import { EthersService } from 'src/ethers/ethers.service';
import { PendingStakes } from 'src/staking/schema/pendingStakes.schema';
import {
  ReferralTrail,
  ReferralTrailDocument,
} from 'src/staking/schema/referralTrail.schema';
import { StakeDuration } from 'src/staking/schema/stakeDuration.schema';
import { Staking } from 'src/staking/schema/staking.schema';
import { IRefStakeLogs } from 'src/transaction/types/logs';
import {
  PendingStakesEnum,
  TransactionStatusEnum,
} from 'src/types/transaction';

@Injectable()
export class CreateStakesService {
  constructor(
    @Inject()
    private readonly ethersService: EthersService,
    @InjectModel(Staking.name)
    private StakingModel: Model<Staking>,
    @InjectModel(PendingStakes.name)
    private pendingStakesModel: Model<PendingStakes>,
    @InjectModel(ReferralTrail.name)
    private referralTrailModel: Model<ReferralTrail>,
    @InjectModel(StakeDuration.name)
    private StakeDurationModel: Model<StakeDuration>,
  ) {}

  async getUsersAndUpdate() {
    const users = await this.ethersService.signedIcoContract.getAllUsers();

    console.log(users.length);
    let count = 0;

    await Promise.all(
      users.map(async (user) => {
        // for (let user of users) {
        count += 1;
        // console.log(count);
        if (user === '0x74b7844bf7cf9064606BA4DC896C1e2d25d5a53A') {
          // continue;
          return;
        }
        const { level } = await this.getUserEligibleLevel(user);
        // console.log({ user });
        // console.log({ level });
        if (level > 0) {
          await this.getPendingStakesForUser(user, level);
        }
        // }
      }),
    );

    await this.fetchAndActivatePendingStakes();
  }

  async fetchAndActivatePendingStakes() {
    const pendingStakes = await this.pendingStakesModel.find({
      status: { $in: [PendingStakesEnum.PENDING, PendingStakesEnum.FAILED] },
    });
    for (let stake of pendingStakes) {
      console.log(stake);
      try {
        await this.activatePendingStakeForUser(
          stake.walletAddress,
          stake.level,
        );
        await this.pendingStakesModel.findOneAndUpdate(
          { _id: stake._id },
          { status: PendingStakesEnum.ACTIVATED },
        );
        console.log('done');
      } catch (error) {
        console.log(error);
        await this.pendingStakesModel.findOneAndUpdate(
          { _id: stake._id },
          { status: PendingStakesEnum.FAILED },
        );
      }
    }
  }

  async getPendingStakesForUser(address: string, level: number) {
    let data = [];
    for (let i = 1; i <= level; i++) {
      const pendingStakes =
        await this.ethersService.newReferralContract.getPendingStakesForLevel(
          address,
          i,
        );
      if (pendingStakes.length > 0) {
        console.log({
          address: address,
          level: i,
          pendingStakes: pendingStakes,
        });

        const existingPendingStakes = await this.pendingStakesModel.findOne({
          walletAddress: address,
          level: i,
          status: PendingStakesEnum.PENDING,
        });

        if (existingPendingStakes) {
          console.log('Pending Stake Already Exists');
          continue;
        }

        const convertedStakes = pendingStakes.map((stake: bigint) =>
          Number(stake),
        );

        const pendingStake = await this.pendingStakesModel.create({
          walletAddress: address,
          level: i,
          stakes: convertedStakes,
          status: PendingStakesEnum.PENDING,
        });
        // await this.activatePendingStakeForUser(address, i);
      }
    }
  }

  async activatePendingStakeForUser(address: string, level: number) {
    const tx =
      await this.ethersService.signedIcoContract.activatePendingRefStake(
        address,
        level,
      );
    await this.createRefPendingStake(tx.hash);
  }

  async createRefPendingStake(txHash: string) {
    const stake = await this.StakingModel.findOne({ txHash });
    if (stake) return;
    const receipt =
      await this.ethersService.blokfitProvider.getTransactionReceipt(txHash);
    console.log('Logs Length:', receipt.logs.length);
    const filteredLogs = receipt.logs.filter(
      (log) => log.topics[0] === process.env.REFERRAL_TOPIC,
    );

    console.log('filteredLogs', filteredLogs);
    // const Result = {
    //     '0': '0x632429b3095aa445a6a2E4576f98C4bf26923073',
    //     '1': '12500000000000000000000',
    //     '2': '960',
    //     '3': '12',
    //     '4': '1733493384',
    //     '5': false,
    //     '6': true,
    //     '7': '0',
    //     __length__: 8,
    //     user: '0x632429b3095aa445a6a2E4576f98C4bf26923073',
    //     amount: '12500000000000000000000',
    //     apr: '960',
    //     poolType: '12',
    //     startTime: '1733493384',
    //     isReferral: false,
    //     active: true,
    //     referredStakes: '0',
    //   };

    // if (!stakeDuration) {
    //   throw new Error('Stake duration not found');
    // }

    if (filteredLogs.length > 0) {
      const refStakedLogs = await Promise.all(
        filteredLogs.map(async (log) => {
          const parsedLog =
            this.ethersService.stakingInterface.parseLog(log).args;

          const idToStake = await this.ethersService.icoContract.idToStake(
            Number(parsedLog[2]),
          );
          console.log(idToStake);

          const stakeDuration = await this.StakeDurationModel.findOne({
            poolType: Number(idToStake[3]),
          });

          if (!stakeDuration) {
            throw new Error('Stake duration not found');
          }

          const formattedReferralLog: IRefStakeLogs = {
            stakeId: Number(parsedLog[2]),
            walletAddress: parsedLog[0],
            amount: this.BigToNumber(parsedLog[1]),
            apr: Number(idToStake[2]) / 10,
            poolType: Number(idToStake[3]),
            startTime: Number(idToStake[4]),
            stakeDuration: stakeDuration.duration,
            txHash,
            isReferred: true,
            level: Number(parsedLog[3]),
            refId: Number(parsedLog[4]),
            transactionStatus:
              receipt.status === 1
                ? TransactionStatusEnum.CONFIRMED
                : TransactionStatusEnum.FAILED,
          };

          return formattedReferralLog;
        }),
      );

      console.log(refStakedLogs);
      await this.StakingModel.insertMany(refStakedLogs);
    }
  }

  private BigToNumber(value: BigInt): number {
    const bigNumberValue = new BigNumber(value.toString());
    return bigNumberValue.dividedBy(new BigNumber(10).pow(18)).toNumber();
  }

  async getUserLevel(address: string) {
    const level = await this.getUserEligibleLevel(address);
    console.log(level);
  }

  async getUserEligibleLevel(address: string) {
    let levelCount = 0;
    let tokensLevel = 0;
    const userTokens = await this.getUserTotalTokenStaked(address);

    if (userTokens.tokens >= 12500) {
      const additionalLevels = Math.floor(userTokens.tokens / 12500) * 6;
      tokensLevel += additionalLevels;
    }

    if (tokensLevel > 24) {
      tokensLevel = 24;
    }

    const directMembers =
      await this.ethersService.newReferralContract.getAllRefrees(address);
    levelCount = directMembers.length;

    if (levelCount <= tokensLevel) {
      levelCount = tokensLevel;
    }
    if (userTokens.tokens === 0) {
      levelCount = 0;
    }

    return { level: levelCount };
  }

  async getUserTotalTokenStaked(walletAddress: string) {
    const fixedAddress = getAddress(walletAddress);
    const tokens =
      await this.ethersService.icoContract.userTotalTokenStaked(fixedAddress);
    return { tokens: Number(formatUnits(tokens, 18)) };
  }

  // async updateReferralTrail(){
  //     const users = await this.ethersService.icoContract.getAllUsers();
  //     console.log(users.length)
  //     users.map(async (user: string) => {
  //       let count = 0;
  //       const refrees = await this.ethersService.newReferralContract.getAllRefrees(user);

  //     })
  // }

  // async updateReferralTrail() {
  //   const users = await this.ethersService.icoContract.getAllUsers();
  //   console.log(`Total users: ${users.length}`);

  //   // Process each user
  //   await Promise.all(
  //     users.map((user: string) => this.processUserReferrals(user)),
  //   );
  // }

  // private async processUserReferrals(user: string) {
  //   const referralTrail = await this.referralTrailModel.findOneAndUpdate(
  //     { userAddress: user },
  //     { userAddress: user, referralLevels: [] },
  //     { upsert: true, new: true },
  //   );

  //   await this.fetchReferrals(user, 1, referralTrail);
  // }

  // private async fetchReferrals(
  //   user: string,
  //   level: number,
  //   referralTrail: ReferralTrailDocument,
  // ) {
  //   if (level > 24) return; // Stop if level exceeds 24

  //   const refrees =
  //     await this.ethersService.newReferralContract.getAllRefrees(user);
  //   if (!refrees || refrees.length === 0) return; // Stop if no more referrals

  //   // Update database for the current level
  //   const existingLevel = referralTrail.referralLevels.find(
  //     (lvl) => lvl.level === level,
  //   );
  //   if (existingLevel) {
  //     existingLevel.members = [
  //       ...new Set([...existingLevel.members, ...refrees]),
  //     ]; // Avoid duplicates
  //   } else {
  //     referralTrail.referralLevels.push({ level, members: refrees });
  //   }
  //   await referralTrail.save();

  //   // Recursively fetch referrals for the next level
  //   await Promise.all(
  //     refrees.map((refree: string) =>
  //       this.fetchReferrals(refree, level + 1, referralTrail),
  //     ),
  //   );
  // }

  async updateReferralTrail() {
    const users = await this.ethersService.icoContract.getAllUsers();
    console.log(`Total users: ${users.length}`);

    let count = 0;
    await Promise.all(
      users.map(async (user: string) => {
        const directMembers =
          await this.ethersService.newReferralContract.getAllRefrees(user);

        const referredBy =
          await this.ethersService.newReferralContract.referedBy(user);

        await this.referralTrailModel.findOneAndUpdate(
          { userAddress: user },
          {
            userAddress: user,
            referredBy: referredBy || null,
            directMembers,
          },
          { upsert: true, new: true },
        );
        console.log(++count);
      }),
    );
  }

  // async getTeamWithLevelsAndTotal(userAddress: string): Promise<{
  //   totalTeamSize: number;
  //   levels: { level: number; members: string[] }[];
  // }> {
  //   const maxLevels = 24;

  //   const fetchTeamWithLevels = async (
  //     addresses: string[],
  //     level: number,
  //     result: { level: number; members: string[] }[],
  //   ): Promise<{
  //     totalTeamSize: number;
  //     levels: { level: number; members: string[] }[];
  //   }> => {
  //     if (level > maxLevels || addresses.length === 0) {
  //       const totalTeamSize = result.reduce(
  //         (sum, levelData) => sum + levelData.members.length,
  //         0,
  //       );
  //       return { totalTeamSize, levels: result };
  //     }

  //     const allDirectMembers = (
  //       await Promise.all(
  //         addresses.map(async (address) => {
  //           const user = await this.referralTrailModel.findOne({
  //             userAddress: address,
  //           });
  //           return user?.directMembers || [];
  //         }),
  //       )
  //     ).flat();

  //     result.push({ level, members: allDirectMembers });

  //     return fetchTeamWithLevels(allDirectMembers, level + 1, result);
  //   };

  //   return await fetchTeamWithLevels([userAddress], 1, []);
  // }

  // private hasRun = false;
  @Cron(CronExpression.EVERY_30_MINUTES)
  handleCron() {
    // if (this.hasRun) {
    //   return;
    // }
    // this.hasRun = true;
    this.updateReferralTrail();
    this.getUsersAndUpdate();
    // this.getTeamWithLevelsAndTotal('0x7756F546D687d0109C397Ee57d40bbF47305288F');
    // this.activatePendingStakeForUser(
    //   '0x62997A47AF6A87bEaB3199F1705110Fa3f377840',
    //   14,
    // );
    // this.createRefPendingStake(
    //   '0x85980f0cbd17aabd4d6e9b2092a0f060a659590e4d3a1bc63b969aa1beae91a7',
    // );

    // this.getUserLevel('0x0633931dD8A9c97327d0A4DA6f5c8fFd7Dd6c45F');
  }
}
