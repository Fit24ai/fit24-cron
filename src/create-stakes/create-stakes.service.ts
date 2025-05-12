// const ether = new EthersService();

import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import BigNumber from 'bignumber.js';
import { formatUnits, getAddress } from 'ethers';
import { Model } from 'mongoose';
import { EthersService } from 'src/ethers/ethers.service';
import { DeactivateStakesUsers } from 'src/staking/schema/deactivateStakesUsers.schema';
import { PendingStakes } from 'src/staking/schema/pendingStakes.schema';
import {
  ReferralTrail,
  ReferralTrailDocument,
} from 'src/staking/schema/referralTrail.schema';
import { StakeDuration } from 'src/staking/schema/stakeDuration.schema';
import { Staking } from 'src/staking/schema/staking.schema';
import { UserTotalBusiness } from 'src/staking/schema/user-total-business';
import { UserTotalBusinessAfter1Dec } from 'src/staking/schema/user-total-business-after-1dec';
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
    @InjectModel(UserTotalBusiness.name)
    private userTotalBusinessModel: Model<UserTotalBusiness>,
    @InjectModel(UserTotalBusinessAfter1Dec.name)
    private userTotalBusinessAfter1DecModel: Model<UserTotalBusinessAfter1Dec>,
    @InjectModel(DeactivateStakesUsers.name)
    private deactivateStakesUsersModel: Model<DeactivateStakesUsers>,
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

  async getUserTotalTokenStaked2(walletAddress: string) {
    const stakes = await this.StakingModel.find({
      walletAddress,
      isReferred: false,
    });
    let tokens = 0;
    let usdTokens = 0;
    for (const stake of stakes) {
      tokens += stake.amount;
      usdTokens += stake.usdAmount;
    }
    return { tokens, usdTokens };
  }

  async getUserTotalTokenStaked2After1Dec(walletAddress: string) {
    const stakes = await this.StakingModel.find({
      walletAddress,
      transactionStatus: TransactionStatusEnum.CONFIRMED,
      isReferred: false,
      startTime: { $gte: 1732991400 },
    });
    let tokens = 0;
    let usdTokens = 0;
    for (const stake of stakes) {
      tokens += stake.amount;
      usdTokens += stake.usdAmount;
    }
    return { tokens, usdTokens };
  }

  async getTotalReferralBusinessInfinity(
    address: string,
    checkedAddresses: Set<string> = new Set(),
    currentLevel: number = 0,
  ): Promise<{
    totalStakedAmount: number;
    totalUsdStakedAmount: number;
    maxReferralLevel: number;
  }> {
    if (checkedAddresses.has(address)) {
      return {
        totalStakedAmount: 0,
        totalUsdStakedAmount: 0,
        maxReferralLevel: currentLevel - 1,
      };
    }
    checkedAddresses.add(address);

    try {
      // Fetch the root user's tokens
      // const { tokens: currentUserTokens, usdTokens: currentUserUsdTokens } =
      //   await this.getUserTotalTokenStaked2(address);

      const referrals = await this.referralTrailModel.findOne({
        userAddress: address,
      });

      if (!referrals || !referrals.directMembers?.length) {
        // No referrals, so return the root user's staked tokens.
        return {
          totalStakedAmount: 0,
          totalUsdStakedAmount: 0,
          maxReferralLevel: currentLevel,
        };
      }

      // Fetch tokens for direct members concurrently.
      const tokenPromises = referrals.directMembers.map(async (member) => {
        const { tokens, usdTokens } =
          await this.getUserTotalTokenStaked2(member);
        return { tokens, usdTokens };
      });

      // Recursively fetch totals and levels for each direct member.
      const recursivePromises = referrals.directMembers.map((member) =>
        this.getTotalReferralBusinessInfinity(
          member,
          checkedAddresses,
          currentLevel + 1,
        ),
      );

      const [tokenResults, recursiveResults] = await Promise.all([
        Promise.all(tokenPromises),
        Promise.all(recursivePromises),
      ]);

      // Sum tokens for direct members.
      const directTokensSum = tokenResults.reduce(
        (sum, result) => sum + result.tokens,
        0,
      );
      const directUsdTokensSum = tokenResults.reduce(
        (sum, result) => sum + result.usdTokens,
        0,
      );

      // Sum tokens from recursive referrals.
      const recursiveTokensSum = recursiveResults.reduce(
        (sum, result) => sum + result.totalStakedAmount,
        0,
      );
      const recursiveUsdTokensSum = recursiveResults.reduce(
        (sum, result) => sum + result.totalUsdStakedAmount,
        0,
      );

      // Determine the deepest referral level in the subtree.
      const maxReferralLevelInSubtree = recursiveResults.reduce(
        (maxLevel, result) => Math.max(maxLevel, result.maxReferralLevel),
        currentLevel,
      );

      // Include the current (root) user's tokens in the totals.
      return {
        totalStakedAmount: directTokensSum + recursiveTokensSum,
        totalUsdStakedAmount: directUsdTokensSum + recursiveUsdTokensSum,
        maxReferralLevel: maxReferralLevelInSubtree,
      };
    } catch (error) {
      console.error('Error fetching staked amounts:', error);
      return {
        totalStakedAmount: 0,
        totalUsdStakedAmount: 0,
        maxReferralLevel: currentLevel,
      };
    }
  }

  async getTotalReferralBusinessInfinityAfter1Dec(
    address: string,
    checkedAddresses: Set<string> = new Set(),
    currentLevel: number = 0,
  ): Promise<{
    totalStakedAmount: number;
    totalUsdStakedAmount: number;
    maxReferralLevel: number;
  }> {
    if (checkedAddresses.has(address)) {
      return {
        totalStakedAmount: 0,
        totalUsdStakedAmount: 0,
        maxReferralLevel: currentLevel - 1,
      };
    }
    checkedAddresses.add(address);

    try {
      // Fetch the root user's tokens
      // const { tokens: currentUserTokens, usdTokens: currentUserUsdTokens } =
      //   await this.getUserTotalTokenStaked2(address);

      const referrals = await this.referralTrailModel.findOne({
        userAddress: address,
      });

      if (!referrals || !referrals.directMembers?.length) {
        // No referrals, so return the root user's staked tokens.
        return {
          totalStakedAmount: 0,
          totalUsdStakedAmount: 0,
          maxReferralLevel: currentLevel,
        };
      }

      // Fetch tokens for direct members concurrently.
      const tokenPromises = referrals.directMembers.map(async (member) => {
        const { tokens, usdTokens } =
          await this.getUserTotalTokenStaked2After1Dec(member);
        return { tokens, usdTokens };
      });

      // Recursively fetch totals and levels for each direct member.
      const recursivePromises = referrals.directMembers.map((member) =>
        this.getTotalReferralBusinessInfinityAfter1Dec(
          member,
          checkedAddresses,
          currentLevel + 1,
        ),
      );

      const [tokenResults, recursiveResults] = await Promise.all([
        Promise.all(tokenPromises),
        Promise.all(recursivePromises),
      ]);

      // Sum tokens for direct members.
      const directTokensSum = tokenResults.reduce(
        (sum, result) => sum + result.tokens,
        0,
      );
      const directUsdTokensSum = tokenResults.reduce(
        (sum, result) => sum + result.usdTokens,
        0,
      );

      // Sum tokens from recursive referrals.
      const recursiveTokensSum = recursiveResults.reduce(
        (sum, result) => sum + result.totalStakedAmount,
        0,
      );
      const recursiveUsdTokensSum = recursiveResults.reduce(
        (sum, result) => sum + result.totalUsdStakedAmount,
        0,
      );

      // Determine the deepest referral level in the subtree.
      const maxReferralLevelInSubtree = recursiveResults.reduce(
        (maxLevel, result) => Math.max(maxLevel, result.maxReferralLevel),
        currentLevel,
      );

      // Include the current (root) user's tokens in the totals.
      return {
        totalStakedAmount: directTokensSum + recursiveTokensSum,
        totalUsdStakedAmount: directUsdTokensSum + recursiveUsdTokensSum,
        maxReferralLevel: maxReferralLevelInSubtree,
      };
    } catch (error) {
      console.error('Error fetching staked amounts:', error);
      return {
        totalStakedAmount: 0,
        totalUsdStakedAmount: 0,
        maxReferralLevel: currentLevel,
      };
    }
  }

  async getEligibleReferralBusiness(userAddress: string) {
    const referredStakes = await this.StakingModel.find({
      walletAddress: userAddress,
      isReferred: true,
      transactionStatus: TransactionStatusEnum.CONFIRMED,
    });

    const stakePromises = referredStakes.map(async (stake) => {
      const refStake = await this.StakingModel.findOne({
        stakeId: stake.refId,
        transactionStatus: TransactionStatusEnum.CONFIRMED,
      });

      return {
        amount: refStake ? refStake.amount : 0,
        usdAmount: refStake ? refStake.usdAmount : 0,
      };
    });

    const amounts = await Promise.all(stakePromises);
    const totalAmount = amounts.reduce((sum, data) => sum + data.amount, 0);
    const totalUsdAmount = amounts.reduce(
      (sum, data) => sum + data.usdAmount,
      0,
    );
    return { totalAmount, totalUsdAmount };
  }

  async getEligibleReferralBusinessAfter1Dec(userAddress: string) {
    const referredStakes = await this.StakingModel.find({
      walletAddress: userAddress,
      isReferred: true,
      startTime: { $gte: 1732991400 },
      transactionStatus: TransactionStatusEnum.CONFIRMED,
    });

    const stakePromises = referredStakes.map(async (stake) => {
      const refStake = await this.StakingModel.findOne({
        stakeId: stake.refId,
        startTime: { $gte: 1732991400 },
        transactionStatus: TransactionStatusEnum.CONFIRMED,
        isReferred: false,
      });

      return {
        amount: refStake ? refStake.amount : 0,
        usdAmount: refStake ? refStake.usdAmount : 0,
      };
    });

    const amounts = await Promise.all(stakePromises);
    const totalAmount = amounts.reduce((sum, data) => sum + data.amount, 0);
    const totalUsdAmount = amounts.reduce(
      (sum, data) => sum + data.usdAmount,
      0,
    );
    return { totalAmount, totalUsdAmount };
  }

  async updateAllUsersBusiness() {
    const users = await this.ethersService.icoContract.getAllUsers();
    console.log(`Total users: ${users.length}`);

    // Use map index for logging if needed
    await Promise.all(
      users.map(async (user, idx) => {
        await this.updateUserBusiness(user);
      }),
    );

    console.log('All users updated.');
  }

  async updateAllUsersBusinessAfter1Dec() {
    const users = await this.ethersService.icoContract.getAllUsers();
    console.log(`Total users: ${users.length}`);

    // Use map index for logging if needed
    await Promise.all(
      users.map(async (user, idx) => {
        await this.updateUserBusinessAfter1Dec(user);
      }),
    );

    console.log('All users updated.');
  }

  async updateUserBusiness(address: string) {
    try {
      // Execute all independent API calls concurrently
      const [
        selfStakes,
        totalReferralStakes,
        eligibleReferralStakes,
        userLevel,
      ] = await Promise.all([
        this.getUserTotalTokenStaked2(address),
        this.getTotalReferralBusinessInfinity(address),
        this.getEligibleReferralBusiness(address),
        this.getUserEligibleLevel(address),
      ]);

      console.log({
        address: address,
        selfStakes: selfStakes,
        totalReferralStakes: totalReferralStakes,
        eligibleReferralStakes: eligibleReferralStakes,
        userLevel: userLevel,
      });

      // Consolidate update data
      const updateData = {
        walletAddress: address,
        eligibleLevel: userLevel.level,
        totalLevel: totalReferralStakes.maxReferralLevel,
        selfStakes: selfStakes.tokens,
        selfStakesUsd: selfStakes.usdTokens,
        eligibleReferralBusiness: eligibleReferralStakes.totalAmount,
        eligibleReferralBusinessUsd: eligibleReferralStakes.totalUsdAmount,
        totalReferralBusiness: totalReferralStakes.totalStakedAmount,
        totalReferralBusinessUsd: totalReferralStakes.totalUsdStakedAmount,
      };

      // Use a single upsert operation to either update or create the record
      await this.userTotalBusinessModel.updateOne(
        { walletAddress: address },
        { $set: updateData },
        { upsert: true },
      );
    } catch (error) {
      console.log(error);
    }
  }

  async updateUserBusinessAfter1Dec(address: string) {
    try {
      const [
        selfStakes,
        totalReferralStakes,
        eligibleReferralStakes,
        userLevel,
      ] = await Promise.all([
        this.getUserTotalTokenStaked2After1Dec(address),
        this.getTotalReferralBusinessInfinityAfter1Dec(address),
        this.getEligibleReferralBusinessAfter1Dec(address),
        this.getUserEligibleLevel(address),
      ]);

      console.log({
        address: address,
        selfStakes: selfStakes,
        totalReferralStakes: totalReferralStakes,
        eligibleReferralStakes: eligibleReferralStakes,
        userLevel: userLevel,
      });

      // Consolidate update data
      const updateData = {
        walletAddress: address,
        eligibleLevel: userLevel.level,
        totalLevel: totalReferralStakes.maxReferralLevel,
        selfStakes: selfStakes.tokens,
        selfStakesUsd: selfStakes.usdTokens,
        eligibleReferralBusiness: eligibleReferralStakes.totalAmount,
        eligibleReferralBusinessUsd: eligibleReferralStakes.totalUsdAmount,
        totalReferralBusiness: totalReferralStakes.totalStakedAmount,
        totalReferralBusinessUsd: totalReferralStakes.totalUsdStakedAmount,
      };

      // Use a single upsert operation to either update or create the record
      await this.userTotalBusinessAfter1DecModel.updateOne(
        { walletAddress: address },
        { $set: updateData },
        { upsert: true },
      );
    } catch (error) {
      console.log(error);
    }
  }

  async getAllDeactivateStakesUsers() {
    const users = await this.deactivateStakesUsersModel.find();

    for (const user of users) {
      // if (user.walletAddress !== '0xb8A8aCC33209BF27cA3779128dA29695434D8ae7')
      //   continue;
      // const stakeIds = await this.getStakeIds(user.walletAddress);
      let stakeIds = [];
      if (user.isReferred === true) {
        stakeIds = await this.getReferredStakeIds(user.walletAddress);
      } else {
        stakeIds = await this.getStakeIds(user.walletAddress);
      }
      // console.log({ stakeIds });
      if (stakeIds.length > 0) {
        for (const stakeId of stakeIds) {
          try {
            const existingStakeId = user.stakeIds.find(
              (id) => id === Number(stakeId),
            );
            // console.log({
            //   existingStakeId,
            // });
            if (!existingStakeId) {
              console.log('continue');
              const deactivateStake =
                await this.ethersService.signedIcoContract.dectivateStake(
                  stakeId,
                  false,
                );
              // console.log('deactivateStake', deactivateStake);
              const receipt =
                await this.ethersService.blokfitProvider.waitForTransaction(
                  deactivateStake.hash,
                );
              // console.log('receipt', receipt);

              console.log('stake deactivated successfully :', stakeId);
              user.stakeIds.push(Number(stakeId));
              await user.save();
            }
          } catch (error) {
            console.log({ error });
            continue;
          }
        }
        console.log('done');
      }
    }

    console.log('FINAL DONE');
  }

  async checkStakes() {
    let activeStakes = [];
    const users = await this.deactivateStakesUsersModel.find();
    await Promise.all(
      users.map(async (user) => {
        await Promise.all(
          user.stakeIds.map(async (stakeId) => {
            const data = await this.ethersService.icoContract.idToStake(
              Number(stakeId),
            );
            if (data[6] === true) {
              activeStakes.push(Number(stakeId));
            }
          }),
        );
      }),
    );
    console.log('activeStakes', activeStakes);
  }

  async getStakeIds(address: string) {
    let stakeIds = [];
    const stakes = await this.StakingModel.find({
      walletAddress: address,
      transactionStatus: TransactionStatusEnum.CONFIRMED,
    });

    for (const stake of stakes) {
      stakeIds.push(stake.stakeId);
    }
    return stakeIds;
    // const stakes =
    //   await this.ethersService.icoContract.getUserActiveStakes(address);
    // return stakes;
  }
  async getReferredStakeIds(address: string) {
    let stakeIds = [];
    const stakes = await this.StakingModel.find({
      walletAddress: address,
      isReferred: true,
      transactionStatus: TransactionStatusEnum.CONFIRMED,
    });

    for (const stake of stakes) {
      stakeIds.push(stake.stakeId);
    }
    return stakeIds;
    // const stakes =
    //   await this.ethersService.icoContract.getUserActiveStakes(address);
    // return stakes;
  }

  async createDeactivatedStakesUsers() {
    // const users = [
    //   '0x32730c217cb93700fa406d3a73C864C60C2c8E03',
    //   '0xf3Cc7d1a05d32B3400417078d99aeC923902aD5c',
    //   '0x53560340Cd3BBA4795A4C7C37B7d6071B97B09f2',
    //   '0xc741A7B64432C3D08D925ADce77835bd8F3234F6',
    // ];
    const users = await this.ethersService.icoContract.getAllUsers();
    for (const user of users) {
      const existingUser = await this.deactivateStakesUsersModel.findOne({
        walletAddress: user,
      });
      if (!existingUser) {
        await this.deactivateStakesUsersModel.create({
          walletAddress: user,
          isReferred: null,
          stakeIds: [],
        });
      }
    }
  }

  async getUserActiveStakes(address: string) {
    const stakes =
      await this.ethersService.icoContract.getUserActiveStakes(address);
    console.log({ stakes, count: stakes.length });

    const stakesInDb = await this.StakingModel.find({
      walletAddress: address,
      transactionStatus: TransactionStatusEnum.CONFIRMED,
    });

    // Extract stakeIds from DB and on-chain
    const dbStakeIds = stakesInDb.map((s) => s.stakeId.toString());
    const onChainStakeIds = stakes.map((s) => s.toString());

    // Compare and find mismatches
    const notMatching = onChainStakeIds.filter(
      (id) => !dbStakeIds.includes(id),
    );

    if (notMatching.length > 0) {
      console.log('Stake IDs not matching with DB:', notMatching);
    } else {
      console.log('All stake IDs match with DB');
    }
    console.log('count :', stakes.length);

    return {
      count: stakes.length,
      stakes,
    };
  }

  async deactivateStake(stakeId: number) {
    const tx = await this.ethersService.signedIcoContract.dectivateStake(
      stakeId,
      true,
    );
    console.log('Transaction Hash:', tx.hash);

    const receipt =
      await this.ethersService.blokfitProvider.getTransactionReceipt(tx.hash);
    console.log('Transaction Receipt:', receipt);
  }

  async getTotalReferralTrail1(address: string): Promise<any[]> {
    const data: any[] = [];

    const referrals = await this.referralTrailModel.findOne({
      userAddress: address,
    });

    if (referrals) {
      data.push(...referrals.directMembers);

      for (const directMember of referrals.directMembers) {
        const directMemberData = await this.getTotalReferralTrail(directMember);
        data.push(...directMemberData);
      }
    }

    return data;
  }

  async getTotalReferralTrail(address: string, level = 1): Promise<any[]> {
    if (level > 24) {
      return [];
    }

    const data: any[] = [];

    const referrals = await this.referralTrailModel.findOne({
      userAddress: address,
    });

    if (referrals) {
      data.push(...referrals.directMembers);

      for (const directMember of referrals.directMembers) {
        const directMemberData = await this.getTotalReferralTrail(
          directMember,
          level + 1,
        );
        data.push(...directMemberData);
      }
    }
    // console.log({ level });

    return data;
  }

  // Define an interface to hold both referral address and level info

  async getTotalReferralTrailAndLevel(
    address: string,
    level = 1,
  ): Promise<any[]> {
    // If the level exceeds 24, stop the recursion
    if (level > 24) {
      return [];
    }

    const data = [];

    // Find the referral record for the given address
    const referrals = await this.referralTrailModel.findOne({
      userAddress: address,
    });

    if (referrals) {
      // For each direct member, create an object with the referral address and current level
      data.push(
        ...referrals.directMembers.map((member: string) => ({
          address: member,
          level: level,
        })),
      );

      // Recursively retrieve the referral trails for each direct member, incrementing the level
      for (const directMember of referrals.directMembers) {
        const directMemberData = await this.getTotalReferralTrailAndLevel(
          directMember,
          level + 1,
        );
        data.push(...directMemberData);
      }
    }

    data.sort((a, b) => a.level - b.level);

    return data;
  }
  async getTotalReferralTrailAndLevel2(address: string) {
    const data = [];
    const addresses = [];

    // Find the referral record for the given address
    const referralStakes = await this.StakingModel.find({
      walletAddress: address,
      isReferred: true,
    }).sort({ updatedAt: 1 });

    for (const stake of referralStakes) {
      const refStake = await this.StakingModel.findOne({
        stakeId: stake.refId,
      });
      if (refStake) {
        if (
          !data.find(
            (d) =>
              d.address === refStake.walletAddress ||
              addresses.includes(refStake.walletAddress),
          )
        ) {
          data.push({
            address: refStake.walletAddress,
            level: stake.level,
          });
          addresses.push(refStake.walletAddress);
        }
      }
    }
    return addresses;
  }

  async getReferralsBasedOnStakes(address: string) {
    const data = [];
    const stakes = await this.StakingModel.find({
      walletAddress: address,
      isReferred: true,
    });
    for (const stake of stakes) {
      const refStake = await this.StakingModel.findOne({
        stakeId: stake.refId,
      });
      if (refStake) {
        if (!data.includes(refStake.walletAddress))
          data.push(refStake.walletAddress);
      }
    }
    return data;
  }

  async getReferralTrailOfAddress(address: string) {
    // const data = await this.getTotalReferralTrail(address);
    // const dataBasedOnStakes = await this.getReferralsBasedOnStakes(address);
    // console.log({
    //   dataBasedOnStakes,
    //   count2: dataBasedOnStakes.length,
    // });
    const dataAndLevel = await this.getTotalReferralTrailAndLevel2(address);
    console.log({ dataAndLevel, count: dataAndLevel.length });
    // console.log(
    //   JSON.stringify({ dataAndLevel, count: dataAndLevel.length }, null, 2),
    // );
    // const remainingData = [];
    // for (const lAdata of dataAndLevel) {
    //   if (!dataBasedOnStakes.includes(lAdata.address)) {
    //     remainingData.push(lAdata);
    //   }
    // }
    // console.log({
    //   remainingData,
    // });
    // await this.createDeactivatedStakesUsers(dataAndLevel);
  }

  async updateDeactivateStakeUsers() {
    const users = await this.deactivateStakesUsersModel.updateMany({
      isReferred: true,
    });
  }

  async getTeam(address: string) {
    const data = await this.getTotalReferralTrail1(address);
    console.log(JSON.stringify({ data, count: data.length }, null, 2));
  }

  async activateDeactivatedStakes() {
    // Fetch everyone who has stakes to activate
    const users = await this.deactivateStakesUsersModel.find();
    const data = {
      totalMembers: users.length,
      blockedMembers: 0,
      remainingMembers: 0,
    };

    for (const user of users) {
      console.log('Processing:', user.walletAddress);

      // Skip any blocked wallet addresses (you'll need to define this array)
      if (blockedMembers.includes(user.walletAddress)) {
        data.blockedMembers++;
        console.log(' → Skipped (blocked)');
        continue;
      }
      data.remainingMembers++;

      // Activate each stake and $pull it out of the stakeIds array
      for (const stakeId of user.stakeIds) {
        try {
          const tx = await this.ethersService.signedIcoContract.dectivateStake(
            stakeId,
            true,
          );
          const receipt =
            await this.ethersService.blokfitProvider.getTransactionReceipt(
              tx.hash,
            );
          console.log(` → Activated ${stakeId}`, receipt.hash);

          // Remove just this one ID from the stored array
          await this.deactivateStakesUsersModel.updateOne(
            { walletAddress: user.walletAddress },
            { $pull: { stakeIds: stakeId } },
          );
        } catch (err) {
          console.error(`Error activating stake ${stakeId}:`, err);
        }
      }
    }

    console.log('Summary:', data);
    console.log('final Done');
    return data;
  }

  private hasRun = false;
  @Cron(CronExpression.EVERY_5_SECONDS)
  handleCron() {
    if (this.hasRun) {
      return;
    }
    this.hasRun = true;
    // this.updateReferralTrail();
    // this.getUsersAndUpdate();
    // this.updateAllUsersBusiness();
    // this.updateAllUsersBusinessAfter1Dec();
    // this.getTeamWithLevelsAndTotal('0x7756F546D687d0109C397Ee57d40bbF47305288F');
    // this.activatePendingStakeForUser(
    //   '0x62997A47AF6A87bEaB3199F1705110Fa3f377840',
    //   14,
    // );
    // this.createRefPendingStake(
    //   '0x85980f0cbd17aabd4d6e9b2092a0f060a659590e4d3a1bc63b969aa1beae91a7',
    // );
    // this.getUserLevel('0x0633931dD8A9c97327d0A4DA6f5c8fFd7Dd6c45F');
    // this.getAllDeactivateStakesUsers();
    // this.getUserActiveStakes('0x53560340Cd3BBA4795A4C7C37B7d6071B97B09f2');
    // this.deactivateStake(3979);
    // this.checkStakes();
    // this.createDeactivatedStakesUsers();
    // this.updateDeactivateStakeUsers();
    // this.getReferralTrailOfAddress(
    //   '0x32730c217cb93700fa406d3a73C864C60C2c8E03',
    // );
    // this.getAllDeactivateStakesUsers();
    // this.getTeam('0xc741A7B64432C3D08D925ADce77835bd8F3234F6');
    // this.getTeam("0x112FEe828b9e8c64fbF9Ec48264376b984d778eB")
    this.activateDeactivatedStakes();
  }
}

const blockedMembers = [
  '0x4ddd6Dd1170E293DEbBFDE2e4a019B9bFD132784',
  '0x3921546B2c4290740D8b983BbdAB3E2aAd608154',
  '0x0EFd4E7c38A8Ae269e53C0B4a1583E94de0Da099',
  '0x8d9f8c57Ba79CBC83E21987db3e140a170541dFa',
  '0x25957b48dBD56131F70f5E80A51699Bce4950f17',
  '0x755B1E0541D52e59b33F5d5f3A4c08a883455225',
  '0x2C4576Fdd01c56e4Ce1C78aA600f637E81ddc075',
  '0x1309914C8016a1E83d419bF629868386bfB69665',
  '0x03a43E92062077488683A7B09a3a2A62a387D6Cb',
  '0x1B3561FF21baC19BE486d52cd1366183E1d29df3',
  '0xb15f3F408DaEAB10cd185E18D5B955C8329c8CA9',
  '0xAA62fC02A714d179A096b83E4D298003556dF9fE',
  '0xE4755E10F67B527a4fbf5627e9702EC66f7aE8ce',
  '0x182D22661c5D57FffB6636bC7611262Da31E2c85',
  '0xF1374AB385190cDF67a59ef702786cE0c7536a53',
  '0x09917A49F751CdB4E34d7A6ffD8a683b7FF77471',
  '0xd31D5853Ec6db362Cf075BD4Fd05888e30d58849',
  '0x4B23a7B39da35C0Fab0283A5F0917782BeC0B7dd',
  '0x4d5b85a06C65160f2a889c4e79f07168961b442d',
  '0x162D0406B12EaB079C3B4d7847f5458F28BAE21E',
  '0x8B76F28c1db084eb660239498f92fc1DdC3769DB',
  '0xe534C7B7e0D37da4159Dd74e2f6df493F3d6baa3',
  '0x08c52771C3f4E6E6B1e9948491c893D1869912E8',
  '0xb96afFC2f06Bc53E245e91E94545F5123155DCE8',
  '0x8F584A51EF56C94b69b64A0bb63DF1D7Fd154a31',
  '0x146AD27F819bdBe73646b24a5622D4c4d7E65C72',
  '0x5a774463265D973B488F7b2aFB294C57a1f0271a',
  '0xd28d9fCFE7Ee0BE86115efec847E5F1f56D37867',
  '0x9a67C3D2baE2bEDf6b27f864c139D779A4b0faA1',
  '0x417283844A78d1Fef3890AEF3394EAf53B1808f8',
  '0x2aF7e7502308c6D1a0Df2D5aBb80f7C5a49a1B8A',
  '0x123A9F6b835824b8D18329c7Ae9804686330f05a',
  '0x1F37379D6df597d49CbE2066210B049906ef569B',
  '0xe30c28EB74D3d4f283E66B26DD2e5f8a611c50F8',
  '0xEC910980961FdC9168E81968e8D780daa7304A0f',
  '0xD162067FE7C63f2B3f32a7d5c1e3c0470CfbeDa2',
  '0xde931f71c080AA44d0dA92c5b97164CF45c7863E',
  '0x92f7db17C0aEcF5ccde8e70FAc8e0ff7724250ec',
  '0xe40F6306C6C0Fa5e22C9ed3DfDbCf5801AC2843d',
  '0x7dbe69fE9D94880e02FbF7Ec316582907C4BDB57',
  '0xf882Aa8148CeC4e7e4D2C315bcCb6C696dD7C136',
  '0x1040ceab7fe8c04A1CaFba77abd673362C217c79',
  '0x4605C7cDA968DFb2bBF9761E344F8C846c132bA7',
  '0xe7079D853341702f42C14169A0Df297bCE0C90e4',
  '0xFB3F9Eb5590a4295A0dFfb972C7020eC2EDc6D87',
  '0xabe9e7415AEd550E8920F6c521A0Ce62FD289BCe',
  '0x8AeaBc72917bb31661A96800bF574A9502Bed516',
  '0xA5d68A38434C9aEA1B09991e79c1e9c9f8b84D58',
  '0xBB66271e9bf7386429d853Dc8686B9f5B9cB7b6E',
  '0xbEAEEfCb8F6933C448cc669202Cf8B36399e138B',
  '0xf45fb0013129eD159d8D855C3Dcfc06b6cBEc46e',
  '0x65e95e0d01892794ECECDc035a372e385B115830',
  '0x19cC0B4468bCFA275125Ef8cf12A03C04bbC55fB',
  '0x3c09765869b45632B4C974be47750750d80B1aD3',
  '0x96E8d64dee16f9Dd52beC192ddC03eBF470c6D89',
  '0x815958fD5d751F7c8B41DB539aDFfCA74d867008',
  '0x117757c2C8ea2cEc1899549E64C207E0e372B53C',
  '0x6eb08CDF51c28C128E413077E3992518b473cB49',
  '0x09875103DE1Da50f564c1dc5ef321C3e1A7F15df',
  '0x2615a8441E386956cCF714549eb138b84dc4b099',
  '0x4D29987962B5332945597fded997f19CEe60E371',
  '0x3AA8119E357976710afd8068254228Bd34E2f4b8',
  '0x41576C036dcD300EA76383372cbf32f68AFa1963',
  '0x5bd0708Ce26e8D067724E8e94B76C277190005b4',
  '0xB7580c18F32d136E83DB403058db1f818C548F98',
  '0x9AaB9E280F626B0d84699523fF93eA1c3929474d',
  '0x61d87c2644bF3518c592EC8B77E6582f1b9DA1d5',
  '0x1afBe7894A828f3BF0B93252c9f3e52d8AE936B9',
  '0xccE132766536b5c6dAD0E0Ac90D5Dab58e438beE',
  '0xbDda0B18f826082839Ef1Fbd86637fE714e4706F',
  '0x401C79fC875083d6c9bC0502e94cD21aeF2be5d9',
  '0x351bC4FFae64DE1d96869649722965A16635653A',
  '0x38baf3B7C9A6581B220bF4F5e083e3D64Df39C14',
  '0x7AD379Cf9a23e57c05BEddC4F3159A5Bd194bD3A',
  '0xABf1B1AEc1B4673977C59d46945d0255074a6307',
  '0x0f1C119D68A18ba34a8Cac8feA4ecf210a873b39',
  '0x6078b9261dEc043A67aA0A51a19c30Df376ce3B1',
  '0x33CB9CFf7EBfD36dBaAA15BbbBb3342B57Bdfde6',
  '0x6bA08Fb303DeB266C93e9084c419B1a8cC300F55',
  '0x92d4332573EE8b492950CbC4e69F64cd6723dcAD',
  '0xC0c0B609bd732bc882FC77FAD9b3372aFA57Ce2b',
  '0xAC4fBC2233474657DeA769643Da59E3252affEd3',
  '0xA417D834C832DC460cf316E767f2565Fdd27Cd59',
  '0x5a7eaFeF20b1479C7d31483cBf35745947382ea2',
  '0xec733135bB7D323BbA63cB27B9Ffb298eadc9BEE',
  '0x4Eb0B2e91925F1E37D93f3219113662Ef74F62e1',
  '0x73EE960945C6a0a6Ed8073daBB9160C9b6A0cdfC',
  '0x3844Af5f6Ee113CAB385Da99eD2B4e755d416Bda',
  '0x68fBdaAf98ea9E2A66d051053D5607BBaf86b377',
  '0xb8A8aCC33209BF27cA3779128dA29695434D8ae7',
  '0xB979959252566441d9054B32A4Be013357248DE4',
  '0xD19dD4abDA48b1da32620FF55Ea57275174650B6',
  '0xad2E906ce5067F220d6043a0aECA944b4a639B29',
  '0x1A8d4Ec486a7a1Eec0CC1CC3594d161e36C34685',
  '0x3565AdFB34b6ce7d37BEF9681A5E629913C98442',
  '0xc9BDB180570AF599c3CE2099463B75eb34fA0f48',
  '0xE2c90A07D508a8D88963112B499eCECc1C7c5bC3',
  '0x4A2973CE0aFfD5a1575e8a5069e401fdD0eC7A54',
  '0x46b20Ca6420AB7d0e2049e105701E9FaEf2eb014',
  '0x482288D7dF94fd3ca1bFb142bcd009333e30b2bB',
  '0x367F2E914f2CC04798a9e46E5dB6ABc1d96adF6A',
  '0x6208e0737a8838978f1b622AC735Dc98Ca44c8e9',
  '0x1c871D166aA0647b5759452a20f8925B7abBe581',
  '0xdAd0d6F472682650a620fC6300d7de7f8D01cEa3',
  '0x93Fd42827eFBcc51b2a6433CbD034A138b4Fc494',
  '0x1D2d75c889134B09Ea7167f21a0611e0dFac7195',
  '0x586A1024044e29f01D100DabA08f886a3a33efb2',
  '0x818aeD3DcDFD64C15E68A387d28b701E61C3Eee4',
  '0xc658b98133517C5bCF7C7bA428E69dE3e7888eF9',
  '0xD54A4115939bBddB885ED9d187a0514fC016d66F',
  '0x302261F489A287e683fE1F2d7e1466684D1B65c4',
  '0x738ad7E4576BaC4ddB8434dD1f5Fd3a799f24331',
  '0x90936Aceb3230B7d43Ff0630c6BC3af0307A863b',
  '0xceCfc8BB8cd244971Fb349b4F79F76a0648a310e',
  '0x7B08F70770B1d12B585440201BF638c6936a47e0',
  '0x1ed7F20903828E0b4fa076269bE5816212bB5479',
  '0x132ff59aD6a8FFF09C42a360031228d1FeECf62a',
  '0x8541c5cb2151E7561e3dD22D2FF572506Ba0841e',
  '0xc958274294c78bEd41C2F05BFA520Bf8db701155',
  '0x4d179C39eF3a94765d93f7708EE9121fe0299e75',
  '0x529dcf61C23EeEb284Ea3879C0cE0C4338B800De',
  '0x8f3Cabe89CADCeF6Bd36b1A7D25c8E2BD17250A7',
  '0x5A44C29dAa4011C269ad6e602452014872A4a7E8',
  '0xAc844212a5C834F0e99bcc6ffc2c681ebc782a1e',
  '0x959bDA7e9366647E096390514378f38d1f163290',
  '0x608abdB30EF61C95D753d496588ceab3AeEA48F5',
  '0x099E08f46F6Fa695F4d877F044f45C9AdD56a696',
  '0xB7bE39449B97B02c5Fec7807dD85F7d5170761fC',
  '0x1334681f74d6FFB87F896b0D3d7d7e82D4a60C06',
  '0xe1fafb850Dd03A35c4534B12289EB208efDA69F2',
  '0x1b075c172DE6c5b8B86a813cf3fea6541f2Aeba7',
  '0xC3D1419EDdd3be5Aa0A4337B0806bdE11B6ffBe4',
  '0xD05463713E0b258E4Ee8c8a9a8c6345D8C44b5Ef',
  '0x57072E90e15237620fD409f4e6524F764432FE4B',
  '0x12F7dF0e2AEF4A490aC3fF1a543B1c6B54d6921E',
  '0x0cE75B5e8a71dA205Bb004b66D8A62dA7D02E1fB',
  '0xa6a1fE306Ddddf83080Ca81Cf9E5950Ad4cB701c',
  '0xD92b7a0ece6F69EE32C0029986D7A58447cA5BD0',
  '0xda9E184F859dFC5D0995e9Bd29f862Df100Dc165',
  '0x632429b3095aa445a6a2E4576f98C4bf26923073',
  '0xaC5dE6aDbC82aa467cD68B2E8613C29c83b2378b',
  '0x8319fcF1A9762FFb3136E7f986DA4D92002B841f',
  '0x014A2CCA23CB313345a28Fd5c732F3bF2B187117',
  '0x9fe79FE821e1582380D1AE523d82187fe440Fb5d',
  '0x24B199D4F3D4c1b07eFF567Bb8314D4c5b7cc899',
  '0x576a8f14164B6309D1Eaf539f1C6221f8e07980f',
  '0x36b1e0682cF60eEF415130c316eeCC51e7542d17',
  '0xf05c8c327Ce79440d0d0C7af9aF19Ed07FBA1D14',
  '0xd8b10140B5b2eb6FD02EaB639E75C95df2c743A6',
  '0xF256FEAf8a03174AF31BbBDA44B1118481d5c6C9',
  '0x6763792fA88fD552Eb0108E2Ea9cAB8bEad16866',
  '0xE383673945b2573bb304cF259898154683281176',
  '0x66cdCc68d9Cc99056fcB14085E0947C264556fD8',
  '0xb80f89ec6b253c4d540a251E4b7DFd1424cff1A8',
  '0xCD549d0d9fD28B8fCC2B346FD3db369dF6456209',
  '0xb74580628A298791E223fDeDDbA39addB55873f5',
  '0xCE5B721C3B56c135Cc08bc1b3CFA6945876116c8',
  '0x4D53710c500098BAfAf5130aB304Eb83e94183ef',
  '0xe43bF830d1286acE08De70d6C4627285Bfa71889',
  '0x26D76305414F88DE9d698ab915CF7b508bc23FdB',
  '0x29331545667506E02d1D9d361F61dE42b1059BE2',
  '0x22cb17bC5f439859Cb66E8Bd090F087C2580143f',
  '0xcE06B89183cC3A10Eb2820C6f37028039D5B6D50',
  '0xa4B82C7CB8272c9fc3d309f96d67C147F1a667e7',
  '0xc3b5d2ab21DfBD5CFE38b8F9c16Fd1CC0FC624f7',
  '0x6A37627E95094CA869d17f442ca8f43256E69E4d',
  '0x4eD124B91B3CF7b36fa2c8d520D8A26f799db7ee',
  '0xA15ED208Da8c7a87b87e3A6962447657b2dAbAC9',
  '0xb785C49e2147Cc56348Db2b89082d532d83ca81c',
  '0x425cEe0FF4b756eceE2823c19edE4B08F4A8B739',
  '0x940AEa84574aDcdfc15C615808b1eb0348Cde835',
  '0x3BefCfEc00b543297156e5e25671B563D488AA90',
  '0xF7e1c601DB31b5225b7EBAaD41AB22eD851dD6F0',
  '0x70E6cc77d50ED4772aa0541AF5F81360ce306d5C',
  '0x2D1E8BD9b255759696c527aE4D33f5292e9FbcF1',
  '0xD4535C048560705A5fecb8a3E8554d332215d8E9',
  '0x95e16C1bc216E14D672EF1e87b8b850b213BA278',
  '0x75ED19544f7684F6986F78e9302f75F25D90ccea',
  '0x424d822678656554C8Bf320F42d6ee4B831c28Cb',
  '0x5CbB412c3805Ec3bBA3A6cFd2c82d61AEd1cc6DC',
  '0x90793c742d3B4fBcb5e768ae0749A4b0be78BD37',
  '0xe713a6d7d42E632c8cA223a9117d4CF5c9f855EE',
  '0x327Fdb42bC7396F3E10B9b12888cc71bDDAC1241',
  '0x9F066d8B6C9Ac7FE4970085C855cb1a13495d284',
  '0xCC9AE720B72ecaEF14539E4582CD603b3f61fE6c',
  '0x31e26592aE2017d5b210F34F4487ccC24B574518',
  '0xCB32204Fa4CD8de5e15FFcB3C3955324659510BB',
  '0x41496Ae0F001A9927d9e9C5428BeCAd4E36d56Be',
  '0x15aC78613bb043C1986054250e1d12F39d1AbE51',
  '0xa0882f19ac8F4e1712749a3bD576BD66cc51651a',
  '0xD6Fb44A85D16C47bBa08bF9911d08C5bD4c502B8',
  '0xa1873532Dfe8149783d4E2D388b1d7b167887Df4',
  '0x6CF23944a286bFFF4537f1C6bb1d898a71E11a11',
  '0xa34cEe1ec1F1bDc0D9BF0891408587288d670f73',
  '0x2Aa5f7cE99cb55Fd91C391960B814894090DA36E',
  '0x727504CCBbbF114b8D8144bD5A526f0BCE4F4E00',
  '0x9ce5A301f45953EAB8e642Ad8B4aD77C3f38a714',
  '0x8dD7a5d7E7244c00B42C638117EC3751631141c7',
  '0x657b994302Cb54d2A0Cc4DF0140c0F7aAadD7770',
  '0x46Af2f7a3036C6E0e43366f3960c91B9bb77B820',
  '0x3d4602330Ea4aBf578154b9E711B778d8bb8e97B',
  '0x28214faa57d16FC70AC99F67B9811f882C703Ee8',
  '0x4D8aB1B5A9f504ff7A52Bd3127c7444D9Fd35826',
  '0xd5E8e55562621edEa4048b2Dc8295B2D1666368b',
  '0x8E9dA6A6F0E14122950c8c9A7a972140fB28e3F3',
  '0x7A7fdFc006bB58Ef4D0ecC0C3442EC8E14C272F7',
  '0xa43414A67755508546B0bC777B69A0BF7d1c6AFF',
  '0x30a4d17e718BBe17cEBbbC0D9D5d3fBA14CD67ce',
  '0x32730c217cb93700fa406d3a73C864C60C2c8E03',
  '0xf3Cc7d1a05d32B3400417078d99aeC923902aD5c',
  '0x53560340Cd3BBA4795A4C7C37B7d6071B97B09f2',
  '0xc741A7B64432C3D08D925ADce77835bd8F3234F6',
];
