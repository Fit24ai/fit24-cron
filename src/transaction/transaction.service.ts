import { Inject, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EthersService } from 'src/ethers/ethers.service';
import { paymentContractAddress } from 'src/ethers/libs/contract';
import { StakingTransaction } from './schema/stakingTransaction.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import EthCrypto from 'eth-crypto';
import BigNumber from 'bignumber.js';
import { v4 } from 'uuid';
import { formatUnits, parseEther, solidityPackedKeccak256 } from 'ethers';

import {
  ChainEnum,
  DistributionStatusEnum,
  TransactionStatusEnum,
} from 'src/types/transaction';
import { CloudflareProvider, LogDescription } from 'ethers';
import { User } from './schema/user.schema';
import { ConfigService } from '@nestjs/config';
import { Staking } from 'src/staking/schema/staking.schema';
import { StakeDuration } from 'src/staking/schema/stakeDuration.schema';
import { IRefStakeLogs } from './types/logs';

// const ether = new EthersService();

@Injectable()
export class TransactionService {
  constructor(
    @InjectModel(StakingTransaction.name)
    private Transaction: Model<StakingTransaction>,
    @InjectModel(Staking.name)
    private StakingModel: Model<Staking>,
    @InjectModel(StakeDuration.name)
    private StakeDurationModel: Model<StakeDuration>,
    @InjectModel(User.name)
    private User: Model<User>,
    private readonly configService: ConfigService,
    @Inject()
    private readonly ethersService: EthersService,
  ) {}
  async syncPaymentReceived(block: number) {
    const fromBlock = await this.ethersService.provider.getBlockNumber();
    const events = await this.ethersService.provider.getLogs({
      address: paymentContractAddress,
      fromBlock: fromBlock - block,
      toBlock: 'latest',
      topics: [process.env.PAYMENT_RECEIVED_TOPIC],
    });

    // console.log(events);
    events.map(async (event) => {
      const parsedEvent = this.ethersService.paymentInterface.parseLog(event);
      // console.log(parsedEvent);
      const transaction = await this.Transaction.findOne({
        transactionHash: event.transactionHash,
        // distributionStatus: DistributionStatusEnum.PENDING,
      });

      if (transaction) {
        const user = await this.User.findOne({
          walletAddress: parsedEvent.args[2],
        });
        if (transaction.distributionStatus === DistributionStatusEnum.PENDING) {
          transaction.distributionStatus = DistributionStatusEnum.PROCESSING;
          await transaction.save();

          await this.buyToken(
            transaction,
            parsedEvent.args[0],
            user.walletAddress,
            parsedEvent.args[1],
            Number(parsedEvent.args[3]),
            Number(parsedEvent.args[4]),
          );
        }
      } else {
        const user = await this.User.findOne({
          walletAddress: parsedEvent.args[2],
        });
        const transaction = new this.Transaction({
          transactionHash: event.transactionHash,
          chain: ChainEnum.BINANCE,
          distributionStatus: DistributionStatusEnum.PROCESSING,
          user: user,
        });
        const newTransaction = await transaction.save();

        await this.buyToken(
          transaction,
          parsedEvent.args[0],
          user.walletAddress,
          parsedEvent.args[1],
          Number(parsedEvent.args[3]),
          Number(parsedEvent.args[4]),
        );
      }
    });
  }

  async buyToken(
    transaction: StakingTransaction,
    BigAmount: bigint,
    walletAddress: string,
    tokenAddress: string,
    poolType: number,
    apr: number,
  ) {
    const isValid = await this.verifyTransaction(
      transaction.chain,
      transaction.transactionHash,
      BigAmount.toString(),
      walletAddress,
    );
    console.log(isValid);
    if (!isValid) return;
    transaction;

    const existingTransaction = await this.Transaction.findOne({
      transactionHash: transaction.transactionHash,
    });

    existingTransaction.transactionStatus = TransactionStatusEnum.CONFIRMED;
    existingTransaction.distributionStatus = DistributionStatusEnum.PROCESSING;
    existingTransaction.amountBigNumber = String(BigAmount);
    existingTransaction.tokenAddress = tokenAddress;
    await existingTransaction.save();

    try {
      const { txHash } = await this.transferTokens(
        walletAddress,

        BigAmount,
        // transactionHash: existingTransaction.transactionHash,
        poolType,
        apr,
      );

      existingTransaction.poolType = poolType;
      existingTransaction.apr = apr;
      existingTransaction.distributionHash = txHash;
      existingTransaction.distributionStatus =
        DistributionStatusEnum.DISTRIBUTED;
      existingTransaction.tokenAmount = BigAmount.toString();
      await this.saveStakeTransaction(
        existingTransaction.distributionHash,
        walletAddress,
        Number(poolType),
      );
    } catch (error) {
      console.log('error');
      existingTransaction.distributionStatus = DistributionStatusEnum.PENDING;
    }
    await existingTransaction.save();
  }

  async saveStakeTransaction(
    txHash: string,
    walletAddress: string,
    pooltype: number,
  ) {
    const stakeDuration = await this.StakeDurationModel.findOne({
      poolType: pooltype,
    });
    const newTransaction = await this.StakingModel.create({
      walletAddress: walletAddress,
      txHash: txHash,
      startTime: Math.floor(Date.now() / 1000),
      stakeDuration: stakeDuration.duration,
    });
    const receipt =
      await this.ethersService.provider.getTransactionReceipt(txHash);
    console.log('Logs Length:', receipt.logs.length);

    const stakedLogs2 = receipt.logs.filter(
      (log) => log.topics[0] === process.env.STAKED_TOPIC,
    );

    console.log('Filtered Staked Logs:', stakedLogs2);

    let stakedLogs;
    for (const log of stakedLogs2) {
      try {
        const parsedLog = this.ethersService.stakingInterface.parseLog(log);
        stakedLogs = parsedLog;
        console.log('Parsed Log:', parsedLog.args);
      } catch (error) {
        console.error('Failed to parse filtered log:', error);
      }
    }

    const filteredLogs = receipt.logs.filter(
      (log) => log.topics[0] === process.env.REFERRAL_TOPIC,
    );

    console.log('filteredLogs', filteredLogs);

    if (!stakeDuration) {
      throw new Error('Stake duration not found');
    }

    if (filteredLogs.length > 0) {
      const refStakedLogs = await Promise.all(
        filteredLogs.map(async (log) => {
          const parsedLog =
            this.ethersService.stakingInterface.parseLog(log).args;

          const idToStake = await this.ethersService.icoContract.idToStake(
            Number(parsedLog[2]),
          );
          console.log(idToStake);

          const formattedReferralLog: IRefStakeLogs = {
            stakeId: Number(parsedLog[2]),
            walletAddress: parsedLog[0],
            amount: this.BigToNumber(parsedLog[1]),
            apr: Number(idToStake[2]) / 10,
            poolType: Number(idToStake[3]),
            startTime: Number(stakedLogs.args[4]), // Changed from stakedLogs.args[4] to parsedLog[4]
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

    console.log(stakedLogs.args);

    const idToStake = await this.ethersService.icoContract.idToStake(
      Number(stakedLogs.args[5]),
    );

    const updateRecord = await this.StakingModel.findByIdAndUpdate(
      newTransaction._id,
      {
        stakeId: Number(stakedLogs.args[5]),
        walletAddress: stakedLogs.args[0],
        amount: this.BigToNumber(idToStake[1]),
        apr: Number(idToStake[2]) / 10,
        poolType: Number(idToStake[3]),
        startTime: Number(stakedLogs.args[4]),
        stakeDuration: stakeDuration.duration,
        txHash,
        isReferred: false,
        transactionStatus:
          receipt.status === 1
            ? TransactionStatusEnum.CONFIRMED
            : TransactionStatusEnum.FAILED,
      },
      {
        new: true,
      },
    );
    return { stake: updateRecord };
  }

  private BigIntToNumber(value: BigInt) {
    return Number(value) / Math.pow(10, 18);
  }

  private async signerSignature(messageHash: string) {
    const signature = EthCrypto.sign(
      this.configService.get('PRIVATE_KEY'),
      messageHash,
    );

    return signature;
  }

  async transferTokens(
    walletAddress: string,
    purchaseAmount: bigint,
    // transactionHash: string,
    poolType: number,
    apr: number,
  ) {
    try {
      console.log(
        String(purchaseAmount),
        walletAddress,
        String(poolType),
        String(apr),
      );

      const tx = await this.ethersService.signedBuyIcoContract.buyToken(
        String(purchaseAmount),
        walletAddress,
        String(poolType),
        String(apr),
      );

      console.log('tx', tx.hash);
      await tx.wait();

      const receipt = await this.ethersService.provider.getTransactionReceipt(
        tx.hash,
      );
      // const parsedLog = this.ethersService.icoInterface.parseLog(receipt?.logs[2]!);
      return { txHash: tx.hash };
    } catch (error) {
      console.log({ error });
      throw error;
    }
  }

  private async verifyTransaction(
    chain: ChainEnum,
    transactionHash: string,
    amount: string,
    user: string,
  ) {
    console.log('User', user);
    console.log('amount', amount);
    switch (chain) {
      case ChainEnum.ETHEREUM:
      // const providerReceiptEth =
      //   await this.ethersService.ethereumProvider.getTransactionReceipt(
      //     transactionHash,
      //   );
      // const EthLogs = this.ethersService.paymentInterface.parseLog(
      //   providerReceiptEth?.logs[providerReceiptEth.logs.length - 1]!,
      // );
      // return this.verifyTransactionConditions(EthLogs, amount, user);

      case ChainEnum.BINANCE:
        const providerReceiptBinance =
          await this.ethersService.binanceProvider.getTransactionReceipt(
            transactionHash,
          );
        const BinanceLogs = this.ethersService.paymentInterface.parseLog(
          providerReceiptBinance?.logs[providerReceiptBinance.logs.length - 1]!,
        );
        return this.verifyTransactionConditions(BinanceLogs, amount, user);
      default:
        throw new Error('Unsupported chain');
    }
  }

  async verifyTransactionConditions(
    logs: LogDescription,
    amount: string,
    user: string,
  ) {
    console.log(logs.args);
    console.log(user, amount);
    if (
      BigInt(logs.args[0]) === BigInt(amount) &&
      logs.args[2].toLowerCase() === user.toLowerCase()
    ) {
      return true;
    } else {
      return false;
    }
  }


  private BigToNumber(value: BigInt): number {
    const bigNumberValue = new BigNumber(value.toString());
    return bigNumberValue.dividedBy(new BigNumber(10).pow(18)).toNumber();
  }

  async updateStakes() {
    const stakes = await this.StakingModel.find({
      transactionStatus: TransactionStatusEnum.CONFIRMED,
    });

    // const stake = await this.StakingModel.findOne({ stakeId: 23 });
    // const idToStake = await this.ethersService.icoContract.idToStake(
    //   Number(stake.stakeId),
    // );
    // stake.apr = Number(idToStake[2]) / 10;
    // stake.amount = this.BigToNumber(idToStake[1]);
    // stake.poolType = Number(idToStake[3]);
    // await stake.save();

    // console.log(this.BigToNumber(idToStake[1]));
    // console.log(idToStake[1])
    // console.log('updated');

    stakes.map(async (stake) => {
      const idToStake = await this.ethersService.icoContract.idToStake(
        Number(stake.stakeId),
      );
      stake.apr = Number(idToStake[2]) / 10;
      stake.amount = this.BigToNumber(idToStake[1]);
      stake.poolType = Number(idToStake[3]);
      stake.isReferred = Boolean(idToStake[5]);
      stake.startTime = Number(idToStake[4]);
      await stake.save();
      console.log("updated")
    });
  }

  // private hasRun = false;
  // @Cron(CronExpression.EVERY_5_SECONDS)
  // handleCron() {
  //   if (this.hasRun) {
  //     return;
  //   }
  //   this.hasRun = true;
  //   this.syncPaymentReceived(999);
    // this.updateStakes();
    // this.saveStakeTransaction(
    //   '0x8ef5aadb40deeeeb3226944c6e3061ab8d6a1352de1d06f8b8ed63381d9740fd',
    //   '0x50Ca1fde29D62292a112A72671E14a5d4f05580f',
    //   10,
    // );
  // }
}
