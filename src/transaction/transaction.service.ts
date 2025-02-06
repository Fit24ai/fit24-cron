import {
  ChainEnum,
  MigrationStatus,
  StakingStatus,
} from './../types/transaction';
import { Inject, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EthersService } from 'src/ethers/ethers.service';
import {
  binancePaymentContractAddress,
  ethereumPaymentContractAddress,
  oldFit24BuyTokenIco,
} from 'src/ethers/libs/contract';
import { StakingTransaction } from './schema/stakingTransaction.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import EthCrypto from 'eth-crypto';
import BigNumber from 'bignumber.js';
import { v4 } from 'uuid';
import {
  ethers,
  formatUnits,
  parseEther,
  solidityPackedKeccak256,
} from 'ethers';

import {
  DistributionStatusEnum,
  TransactionStatusEnum,
} from 'src/types/transaction';
import { CloudflareProvider, LogDescription } from 'ethers';
import { User } from './schema/user.schema';
import { ConfigService } from '@nestjs/config';
import { Staking } from 'src/staking/schema/staking.schema';
import { StakeDuration } from 'src/staking/schema/stakeDuration.schema';
import { IRefStakeLogs } from './types/logs';
import { RedisClientType } from 'redis';
import { StakingMigrate } from './schema/stakingMigrate.schema';
import { PresaleTransaction } from './schema/presaleTransaction.schema';
import { ReferralTransaction } from 'src/staking/schema/referralTransaction.schema';

// const ether = new EthersService();

@Injectable()
export class TransactionService {
  constructor(
    @InjectModel(StakingTransaction.name)
    private Transaction: Model<StakingTransaction>,
    @InjectModel(PresaleTransaction.name)
    private presaleTransaction: Model<PresaleTransaction>,
    @InjectModel(ReferralTransaction.name)
    private referrlaTransaction: Model<ReferralTransaction>,
    @InjectModel(Staking.name)
    private StakingModel: Model<Staking>,
    @InjectModel(StakingMigrate.name)
    private StakingMigrateModel: Model<StakingMigrate>,
    @InjectModel(StakeDuration.name)
    private StakeDurationModel: Model<StakeDuration>,
    @InjectModel(User.name)
    private User: Model<User>,
    private readonly configService: ConfigService,
    @Inject()
    private readonly ethersService: EthersService,
    @Inject('REDIS_SERVICE')
    private readonly redisService: RedisClientType,
  ) {}
  async syncPaymentReceived(block: number) {
    const fromBlock = await this.ethersService.binanceProvider.getBlockNumber();
    const events = await this.ethersService.binanceProvider.getLogs({
      address: binancePaymentContractAddress,
      fromBlock: fromBlock - block,
      toBlock: 'latest',
      topics: [process.env.PAYMENT_RECEIVED_TOPIC],
    });
    console.log(events);

    // console.log(events);
    await Promise.all(
      events.map(async (event) => {
        const parsedEvent = this.ethersService.paymentInterface.parseLog(event);

        console.log(parsedEvent);
        const transaction = await this.Transaction.findOne({
          transactionHash: event.transactionHash,
          // distributionStatus: DistributionStatusEnum.PENDING,
        });

        const cache = await this.redisService.get(
          `transaction:${event.transactionHash}-${ChainEnum.BINANCE}`,
        );
        if (cache) return;

        if (transaction) {
          const user = await this.User.findOne({
            walletAddress: parsedEvent.args[2],
          });
          if (!user) return;
          if (
            transaction.distributionStatus === DistributionStatusEnum.PENDING ||
            transaction.distributionStatus === DistributionStatusEnum.FAILED
          ) {
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
          } else if (transaction.stakingStatus === StakingStatus.FAILED) {
            try {
              await this.saveStakeTransaction(
                transaction.distributionHash,
                user.walletAddress,
                Number(transaction.poolType),
                this.BigToNumber(parsedEvent.args[0]),
              );
              transaction.stakingStatus = StakingStatus.STAKED;
              await transaction.save();
            } catch (error) {
              console.log(error);
              transaction.stakingStatus = StakingStatus.FAILED;
              await transaction.save();
            }
          }
        } else {
          const user = await this.User.findOne({
            walletAddress: parsedEvent.args[2],
          });
          if (!user) return;
          await this.redisService.set(
            `transaction:${event.transactionHash}-${ChainEnum.BINANCE}`,
            'PROCESSING',
            {
              EX: 30,
            },
          );
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
      }),
    );
  }
  async syncEthereumPaymentReceived(block: number) {
    const fromBlock =
      await this.ethersService.ethereumProvider.getBlockNumber();
    const events = await this.ethersService.ethereumProvider.getLogs({
      address: ethereumPaymentContractAddress,
      fromBlock: fromBlock - block,
      toBlock: 'latest',
      topics: [process.env.PAYMENT_RECEIVED_TOPIC],
    });
    console.log(events);

    // console.log(events);
    await Promise.all(
      events.map(async (event) => {
        const parsedEvent = this.ethersService.paymentInterface.parseLog(event);

        // console.log(parsedEvent);
        const transaction = await this.Transaction.findOne({
          transactionHash: event.transactionHash,
          // distributionStatus: DistributionStatusEnum.PENDING,
        });

        const cache = await this.redisService.get(
          `transaction:${event.transactionHash}-${ChainEnum.ETHEREUM}`,
        );
        if (cache) return;

        if (transaction) {
          const user = await this.User.findOne({
            walletAddress: parsedEvent.args[2],
          });
          if (!user) return;
          if (
            transaction.distributionStatus === DistributionStatusEnum.PENDING ||
            transaction.distributionStatus === DistributionStatusEnum.FAILED
          ) {
            transaction.distributionStatus = DistributionStatusEnum.PROCESSING;
            await transaction.save();

            await this.buyToken(
              transaction,
              parseEther(formatUnits(parsedEvent.args[0], 6)),
              user.walletAddress,
              parsedEvent.args[1],
              Number(parsedEvent.args[3]),
              Number(parsedEvent.args[4]),
            );
          } else if (transaction.stakingStatus === StakingStatus.FAILED) {
            try {
              await this.saveStakeTransaction(
                transaction.distributionHash,
                user.walletAddress,
                Number(transaction.poolType),
                this.BigToNumber(
                  parseEther(formatUnits(parsedEvent.args[0], 6)),
                ),
              );
              transaction.stakingStatus = StakingStatus.STAKED;
              await transaction.save();
            } catch (error) {
              console.log(error);
              transaction.stakingStatus = StakingStatus.FAILED;
              await transaction.save();
            }
          }
        } else {
          const user = await this.User.findOne({
            walletAddress: parsedEvent.args[2],
          });
          if (!user) return;
          await this.redisService.set(
            `transaction:${event.transactionHash}-${ChainEnum.ETHEREUM}`,
            'PROCESSING',
            {
              EX: 30,
            },
          );
          const transaction = new this.Transaction({
            transactionHash: event.transactionHash,
            chain: ChainEnum.ETHEREUM,
            distributionStatus: DistributionStatusEnum.PROCESSING,
            user: user,
          });
          const newTransaction = await transaction.save();

          await this.buyToken(
            transaction,
            parseEther(formatUnits(parsedEvent.args[0], 6)),
            user.walletAddress,
            parsedEvent.args[1],
            Number(parsedEvent.args[3]),
            Number(parsedEvent.args[4]),
          );
        }
      }),
    );
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
        poolType,
        apr,
        existingTransaction.chain,
      );

      existingTransaction.poolType = poolType;
      existingTransaction.apr = apr;
      existingTransaction.distributionHash = txHash;
      existingTransaction.distributionStatus =
        DistributionStatusEnum.DISTRIBUTED;
      existingTransaction.tokenAmount = BigAmount.toString();
      await existingTransaction.save();
      // await this.saveStakeTransaction(
      //   existingTransaction.distributionHash,
      //   walletAddress,
      //   Number(poolType),
      // );
      await this.redisService.del(
        `transaction:${existingTransaction.transactionHash}-${existingTransaction.chain}`,
      );
    } catch (error) {
      console.log('error');
      existingTransaction.distributionStatus = DistributionStatusEnum.FAILED;
      await existingTransaction.save();
      await this.redisService.del(
        `transaction:${existingTransaction.transactionHash}-${existingTransaction.chain}`,
      );
    }

    if (
      existingTransaction.distributionStatus ===
      DistributionStatusEnum.DISTRIBUTED
    ) {
      try {
        await this.saveStakeTransaction(
          existingTransaction.distributionHash,
          walletAddress,
          Number(poolType),
          this.BigToNumber(BigAmount),
        );
        existingTransaction.stakingStatus = StakingStatus.STAKED;
        await existingTransaction.save();
      } catch (error) {
        console.log(error);
        existingTransaction.stakingStatus = StakingStatus.FAILED;
        await existingTransaction.save();
      }
    }
    if (
      existingTransaction.distributionStatus ===
      DistributionStatusEnum.DISTRIBUTED
    ) {
      try {
        await this.createRefIncome(
          existingTransaction.transactionHash,
          // existingTransaction.chain,
        );
      } catch (error) {
        console.log(error);
      }
    }

    // await existingTransaction.save();
  }

  async saveStakeTransaction(
    txHash: string,
    walletAddress: string,
    pooltype: number,
    usdAmount: number,
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
      await this.ethersService.blokfitProvider.getTransactionReceipt(txHash);
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
            startTime: Number(idToStake[4]), // Changed from stakedLogs.args[4] to parsedLog[4]
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
        usdAmount,
      },
      {
        new: true,
      },
    );
    return { stake: updateRecord };
  }

  async createRefIncome(tx: string) {
    const transaction = await this.Transaction.findOne({
      transactionHash: tx,
      distributionStatus: DistributionStatusEnum.DISTRIBUTED,
      stakingStatus: StakingStatus.STAKED,
    });
    console.log(transaction);
    const referaltx = await this.referrlaTransaction.findOne({
      transactionHash: tx,
    });
    console.log(referaltx);
    if (referaltx) return;
    if (transaction.chain === 'BINANCE') {
      console.log('BINANCE');
      const receipt =
        await this.ethersService.binanceProvider.getTransactionReceipt(tx);
      const paymentLogs = receipt.logs.filter(
        (log) => log.topics[0] === process.env.REFERRAL_INCOME_RECEIVED,
      );
      for (const log of paymentLogs) {
        try {
          const parsedLog = this.ethersService.paymentInterface.parseLog(log);
          console.log('Parsed Log:', parsedLog.args);
          const ref = await this.referrlaTransaction.findOne({
            transactionHash: tx,
          });
          console.log(ref);
          if (!ref) {
            await this.referrlaTransaction.create({
              transactionHash: tx,
              referrer: parsedLog.args[0],
              buyer: parsedLog.args[1],
              buyAmount: this.BigToNumber(parsedLog.args[2]),
              referralIncome: this.BigToNumber(parsedLog.args[3]),
              token: parsedLog.args[4],
              chain: ChainEnum.BINANCE,
            });
            console.log('done');
          }
        } catch (error) {
          console.error('Failed to parse filtered log:', error);
        }
      }
    } else {
      const receipt =
        await this.ethersService.ethereumProvider.getTransactionReceipt(tx);
      const paymentLogs = receipt.logs.filter(
        (log) => log.topics[0] === process.env.REFERRAL_INCOME_RECEIVED,
      );

      for (const log of paymentLogs) {
        try {
          const parsedLog = this.ethersService.paymentInterface.parseLog(log);
          console.log('Parsed Log:', parsedLog.args);
          const ref = await this.referrlaTransaction.findOne({
            transactionHash: tx,
          });
          console.log(ref);
          if (!ref) {
            await this.referrlaTransaction.create({
              transactionHash: tx,
              referrer: parsedLog.args[0],
              buyer: parsedLog.args[1],
              buyAmount: this.BigToNumber(
                parseEther(formatUnits(parsedLog.args[2], 6)),
              ),
              referralIncome: this.BigToNumber(
                parseEther(formatUnits(parsedLog.args[3], 6)),
              ),
              token: parsedLog.args[4],
              chain: ChainEnum.ETHEREUM,
            });
            console.log('done');
          }
        } catch (error) {
          console.error('Failed to parse filtered log:', error);
        }
      }
    }
  }

  // async createRefIncome(tx: string, chain: string) {
  //   if (chain === ChainEnum.BINANCE) {
  //     console.log('BINANCE');
  //     const receipt =
  //       await this.ethersService.binanceProvider.getTransactionReceipt(tx);
  //     const paymentLogs = receipt.logs.filter(
  //       (log) => log.topics[0] === process.env.REFERRAL_INCOME_RECEIVED,
  //     );
  //     for (const log of paymentLogs) {
  //       try {
  //         const parsedLog = this.ethersService.paymentInterface.parseLog(log);
  //         console.log('Parsed Log:', parsedLog.args);
  //         const ref = await this.referrlaTransaction.findOne({
  //           transactionHash: tx,
  //         });
  //         console.log(ref);
  //         if (!ref) {
  //           await this.referrlaTransaction.create({
  //             transactionHash: tx,
  //             referrer: parsedLog.args[0],
  //             buyer: parsedLog.args[1],
  //             buyAmount: this.BigToNumber(parsedLog.args[2]),
  //             referralIncome: this.BigToNumber(parsedLog.args[3]),
  //             token: parsedLog.args[4],
  //             chain: ChainEnum.BINANCE,
  //           });
  //           console.log('done');
  //         }
  //       } catch (error) {
  //         console.error('Failed to parse filtered log:', error);
  //       }
  //     }
  //   } else {
  //     const receipt =
  //       await this.ethersService.ethereumProvider.getTransactionReceipt(tx);
  //     const paymentLogs = receipt.logs.filter(
  //       (log) => log.topics[0] === process.env.REFERRAL_INCOME_RECEIVED,
  //     );

  //     for (const log of paymentLogs) {
  //       try {
  //         const parsedLog = this.ethersService.paymentInterface.parseLog(log);
  //         console.log('Parsed Log:', parsedLog.args);
  //         const ref = await this.referrlaTransaction.findOne({
  //           transactionHash: tx,
  //         });
  //         console.log(ref);
  //         if (!ref) {
  //           await this.referrlaTransaction.create({
  //             transactionHash: tx,
  //             referrer: parsedLog.args[0],
  //             buyer: parsedLog.args[1],
  //             buyAmount: this.BigToNumber(
  //               parseEther(formatUnits(parsedLog.args[2], 6)),
  //             ),
  //             referralIncome: this.BigToNumber(
  //               parseEther(formatUnits(parsedLog.args[3], 6)),
  //             ),
  //             token: parsedLog.args[4],
  //             chain: ChainEnum.ETHEREUM,
  //           });
  //           console.log('done');
  //         }
  //       } catch (error) {
  //         console.error('Failed to parse filtered log:', error);
  //       }
  //     }
  //   }
  // }

  // private BigIntToNumber(value: BigInt) {
  //   return Number(value) / Math.pow(10, 18);
  // }

  // private async signerSignature(messageHash: string) {
  //   const signature = EthCrypto.sign(
  //     this.configService.get('PRIVATE_KEY'),
  //     messageHash,
  //   );

  //   return signature;
  // }

  async transferTokens(
    walletAddress: string,
    purchaseAmount: bigint,
    // transactionHash: string,
    poolType: number,
    apr: number,
    chain: ChainEnum,
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

      return { txHash: tx.hash };
      // if (chain === ChainEnum.ETHEREUM) {
      //   const receipt =
      //     await this.ethersService.ethereumProvider.getTransactionReceipt(
      //       tx.hash,
      //     );
      //   return { txHash: tx.hash };
      // } else {

      // }
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
        const providerReceiptEth =
          await this.ethersService.ethereumProvider.getTransactionReceipt(
            transactionHash,
          );
        const EthLogs = this.ethersService.paymentInterface.parseLog(
          providerReceiptEth?.logs[providerReceiptEth.logs.length - 1]!,
        );
        return this.verifyTransactionConditions(EthLogs, amount, user);

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

  // async updateStakes() {
  //   const stakes = await this.StakingModel.find({
  //     transactionStatus: TransactionStatusEnum.CONFIRMED,
  //   });

  //   // const stake = await this.StakingModel.findOne({ stakeId: 23 });
  //   // const idToStake = await this.ethersService.icoContract.idToStake(
  //   //   Number(stake.stakeId),
  //   // );
  //   // stake.apr = Number(idToStake[2]) / 10;
  //   // stake.amount = this.BigToNumber(idToStake[1]);
  //   // stake.poolType = Number(idToStake[3]);
  //   // await stake.save();

  //   // console.log(this.BigToNumber(idToStake[1]));
  //   // console.log(idToStake[1])
  //   // console.log('updated');

  //   stakes.map(async (stake) => {
  //     const idToStake = await this.ethersService.icoContract.idToStake(
  //       Number(stake.stakeId),
  //     );
  //     stake.apr = Number(idToStake[2]) / 10;
  //     stake.amount = this.BigToNumber(idToStake[1]);
  //     stake.poolType = Number(idToStake[3]);
  //     stake.isReferred = Boolean(idToStake[5]);
  //     stake.startTime = Number(idToStake[4]);
  //     await stake.save();
  //     console.log('updated');
  //   });
  // }

  // async saveStakeTransactionMigrate(
  //   txHash: string,
  //   walletAddress: string,
  //   pooltype: number,
  //   id: string,
  // ) {
  //   const stakeDuration = await this.StakeDurationModel.findOne({
  //     poolType: pooltype,
  //   });
  //   const newTransaction = await this.StakingMigrateModel.create({
  //     walletAddress: walletAddress,
  //     txHash: txHash,
  //     startTime: Math.floor(Date.now() / 1000),
  //     stakeDuration: stakeDuration.duration,
  //   });
  //   const receipt =
  //     await this.ethersService.blokfitProvider.getTransactionReceipt(txHash);
  //   console.log(receipt);
  //   console.log(txHash);
  //   console.log('Logs Length:', receipt.logs.length);

  //   const stakedLogs2 = receipt.logs.filter(
  //     (log) => log.topics[0] === process.env.STAKED_TOPIC,
  //   );

  //   console.log('Filtered Staked Logs:', stakedLogs2);

  //   let stakedLogs;
  //   for (const log of stakedLogs2) {
  //     try {
  //       const parsedLog = this.ethersService.stakingInterface.parseLog(log);
  //       stakedLogs = parsedLog;
  //       console.log('Parsed Log:', parsedLog.args);
  //     } catch (error) {
  //       console.error('Failed to parse filtered log:', error);
  //     }
  //   }

  //   const filteredLogs = receipt.logs.filter(
  //     (log) => log.topics[0] === process.env.REFERRAL_TOPIC,
  //   );

  //   console.log('filteredLogs', filteredLogs);

  //   if (!stakeDuration) {
  //     throw new Error('Stake duration not found');
  //   }

  //   if (filteredLogs.length > 0) {
  //     const refStakedLogs = await Promise.all(
  //       filteredLogs.map(async (log) => {
  //         const parsedLog =
  //           this.ethersService.stakingInterface.parseLog(log).args;

  //         const idToStake = await this.ethersService.icoContract.idToStake(
  //           Number(parsedLog[2]),
  //         );
  //         console.log(idToStake);

  //         const formattedReferralLog: IRefStakeLogs = {
  //           stakeId: Number(parsedLog[2]),
  //           walletAddress: parsedLog[0],
  //           amount: this.BigToNumber(parsedLog[1]),
  //           apr: Number(idToStake[2]) / 10,
  //           poolType: Number(idToStake[3]),
  //           startTime: Number(idToStake[4]), // Changed from stakedLogs.args[4] to parsedLog[4]
  //           stakeDuration: stakeDuration.duration,
  //           txHash,
  //           isReferred: true,
  //           level: Number(parsedLog[3]),
  //           refId: Number(parsedLog[4]),
  //           transactionStatus:
  //             receipt.status === 1
  //               ? TransactionStatusEnum.CONFIRMED
  //               : TransactionStatusEnum.FAILED,
  //         };

  //         return formattedReferralLog;
  //       }),
  //     );

  //     console.log(refStakedLogs);
  //     await this.StakingMigrateModel.insertMany(refStakedLogs);
  //   }

  //   console.log(stakedLogs.args);

  //   const idToStake = await this.ethersService.icoContract.idToStake(
  //     Number(stakedLogs.args[5]),
  //   );

  //   const updateRecord = await this.StakingMigrateModel.findByIdAndUpdate(
  //     newTransaction._id,
  //     {
  //       stakeId: Number(stakedLogs.args[5]),
  //       walletAddress: stakedLogs.args[0],
  //       amount: this.BigToNumber(idToStake[1]),
  //       apr: Number(idToStake[2]) / 10,
  //       poolType: Number(idToStake[3]),
  //       startTime: Number(stakedLogs.args[4]),
  //       stakeDuration: stakeDuration.duration,
  //       txHash,
  //       isReferred: false,
  //       transactionStatus:
  //         receipt.status === 1
  //           ? TransactionStatusEnum.CONFIRMED
  //           : TransactionStatusEnum.FAILED,
  //     },
  //     {
  //       new: true,
  //     },
  //   );
  //   const transaction = await this.Transaction.findByIdAndUpdate(id, {
  //     distributionHash: txHash,
  //     distributionStatus: DistributionStatusEnum.DISTRIBUTED,
  //   });
  //   transaction.migrationStatus = MigrationStatus.MIGRATED;
  //   await transaction.save();
  //   return { stake: updateRecord };
  // }

  // public async MigrateData() {
  //   const stakes = await this.StakingModel.find({
  //     isReferred: false,
  //     transactionStatus: TransactionStatusEnum.CONFIRMED,
  //   });
  //   console.log(stakes.length);

  //   for (const stake of stakes) {
  //     const transaction = await this.Transaction.findOne({
  //       distributionHash: stake.txHash,
  //       distributionStatus: DistributionStatusEnum.DISTRIBUTED,
  //     });
  //     if (transaction) {
  //       if (transaction.migrationStatus === MigrationStatus.MIGRATED) {
  //         console.log('dont continue');
  //       } else {
  //         console.log(stake.txHash);
  //         console.log(stake.walletAddress);
  //         const bigAmount = parseEther(stake.amount.toString());
  //         console.log(String(bigAmount));
  //         try {
  //           console.log(
  //             String(bigAmount),
  //             stake.poolType,
  //             stake.apr * 10,
  //             stake.walletAddress,
  //             stake.startTime,
  //           );
  //           const tx =
  //             await this.ethersService.signedIcoContract.StakeTokensAdmin(
  //               String(bigAmount),
  //               stake.poolType,
  //               stake.apr * 10,
  //               stake.walletAddress,
  //               stake.startTime,
  //             );
  //           tx.wait();
  //           try {
  //             await this.saveStakeTransactionMigrate(
  //               tx.hash,
  //               stake.walletAddress,
  //               stake.poolType,
  //               transaction.id,
  //             );

  //             console.log('stake created');
  //           } catch (error) {
  //             console.log(error);
  //           }

  //           console.log('done');
  //         } catch (error) {
  //           console.log(error);
  //         }
  //       }
  //     }
  //   }
  // }

  // public async updateTransactions() {
  //   const transactions = await this.Transaction.find({
  //     distributionStatus: DistributionStatusEnum.DISTRIBUTED,
  //     stakingStatus: StakingStatus.STAKED,
  //   });
  //   transactions.map(async (transaction) => {
  //     await this.Transaction.updateOne(
  //       { _id: transaction._id },
  //       { migrationStatus: MigrationStatus.PENDING },
  //     );
  //   });
  // }

  // public async updateNewReferrals() {
  //   const users = await this.User.find();
  //   for (const user of users) {
  //     const upline = await this.ethersService.oldReferralContract.getReferrer(
  //       user.walletAddress,
  //     );
  //     if (upline !== '0x0000000000000000000000000000000000000000') {
  //       try {
  //         const tx =
  //           await this.ethersService.newReferralSignedContract.register(
  //             user.walletAddress,
  //             upline,
  //           );
  //         const receipt =
  //           await this.ethersService.blokfitProvider.waitForTransaction(
  //             tx.hash,
  //           );
  //         console.log('referral added');
  //       } catch (error) {
  //         console.log(error);
  //       }
  //     }

  //     const newUpline =
  //       await this.ethersService.newReferralContract.getReferrer(
  //         user.walletAddress,
  //       );
  //     console.log('wallet', user.walletAddress);
  //     console.log('OLD upline', upline);
  //     console.log('NEW upline', newUpline);
  //   }
  // }

  public async numberrr(number: bigint) {
    const result = this.BigToNumber(number);
    console.log(result);
  }

  // public async updatePresaleTransaction() {
  //   const transactions = await this.presaleTransaction.find({
  //     distributionStatus: DistributionStatusEnum.DISTRIBUTED,
  //     migrationStatus: MigrationStatus.MIGRATED,
  //   });
  //   transactions.map(async (transaction) => {
  //     const newT = await this.presaleTransaction.updateOne(
  //       { _id: transaction._id },
  //       { migrationStatus: MigrationStatus.PENDING },
  //     );
  //   });
  // }

  // public async MigratePresaleData() {
  //   const blockNumber =
  //     await this.ethersService.oldBlokfitProvider.getBlockNumber();
  //   const fromBlock = blockNumber - 1000;

  //   const events = await this.ethersService.oldBlokfitProvider.getLogs({
  //     address: oldFit24BuyTokenIco,
  //     fromBlock: fromBlock,
  //     toBlock: 'latest',
  //     topics: [
  //       '0x22f6af6e13430e3e7b6418d01e6a48c1fbce5e8cb1698901fc95134b4b1c58ad',
  //     ],
  //   });
  //   // console.log(events);
  //   // console.log(events.length);

  //   for (const event of events) {
  //     const parsedEvent =
  //       this.ethersService.oldFit24TokenIcoBuyInterface.parseLog(event);
  //     // console.log(parsedEvent.args);
  //     const transaction = await this.presaleTransaction.findOne({
  //       distributionHash: event.transactionHash,
  //       migrationStatus: MigrationStatus.PENDING,
  //       distributionStatus: DistributionStatusEnum.DISTRIBUTED,
  //     });
  //     if (transaction) {
  //       try {
  //         console.log(
  //           parsedEvent.args[0],
  //           String(parsedEvent.args[2]),
  //           String(parsedEvent.args[3]),
  //         );
  //         const tx =
  //           await this.ethersService.signedBlokfitVestingContract.vestSaleTokens(
  //             parsedEvent.args[0],
  //             String(parsedEvent.args[2]),
  //             String(parsedEvent.args[3]),
  //           );
  //         await tx.wait();

  //         const newTransaction = await this.presaleTransaction.updateOne(
  //           { _id: transaction._id },
  //           {
  //             migrationStatus: MigrationStatus.MIGRATED,
  //             vestingHash: tx.hash,
  //           },
  //         );
  //         console.log('done');
  //       } catch (error) {}
  //     }
  //   }

  //   // const transactions = await this.presaleTransaction.find({
  //   //   distributionStatus: DistributionStatusEnum.DISTRIBUTED,
  //   //   migrationStatus: MigrationStatus.PENDING,
  //   // });
  //   // for (const transaction of transactions) {
  //   //   // console.log(transaction.transactionHash)
  //   //   try {
  //   //     const receipt =
  //   //       await this.ethersService.oldBlokfitProvider.getTransactionReceipt(
  //   //         transaction.transactionHash,
  //   //       );
  //   //     const stakedLogs2 = receipt.logs.filter(
  //   //       (log) => log.topics[0] === process.env.PRESALE_PAYMENT_RECEIVED,
  //   //     );
  //   //     let stakedLogs;
  //   //     for (const log of stakedLogs2) {
  //   //       try {
  //   //         const parsedLog =
  //   //           this.ethersService.oldPaymentInterface.parseLog(log);
  //   //         stakedLogs = parsedLog;
  //   //         // console.log('Parsed Log:', parsedLog.args);
  //   //       } catch (error) {
  //   //         console.error('Failed to parse filtered log:', error);
  //   //       }
  //   //     }
  //   //     console.log(String(parseEther(formatUnits(stakedLogs.args[0], 6))), stakedLogs.args[2]);
  //   //     // const tx =
  //   //     //   await this.ethersService.signedFit24TokenIcoBuyIcoContract.buyToken(
  //   //     //     String(stakedLogs.args[0]),
  //   //     //     stakedLogs.args[2],
  //   //     //   );
  //   //     // await tx.wait();
  //   //     // const newTransaction = await this.presaleTransaction.updateOne(
  //   //     //   { _id: transaction._id },
  //   //     //   {
  //   //     //     migrationStatus: MigrationStatus.MIGRATED,
  //   //     //     distributionHash: tx.hash,
  //   //     //   },
  //   //     // );
  //   //     console.log("done");
  //   //   } catch (error) {
  //   //     // console.log(error);
  //   //   }
  //   // }
  // }

  // async createRefIncomeMigrate() {
  //   const transactions = await this.Transaction.find({
  //     distributionStatus: DistributionStatusEnum.DISTRIBUTED,
  //     chain: ChainEnum.BINANCE,
  //   });

  //   for (const transaction of transactions) {
  //     const receipt =
  //       await this.ethersService.binanceProvider.getTransactionReceipt(
  //         transaction.transactionHash,
  //       );
  //     const paymentLogs = receipt.logs.filter(
  //       (log) => log.topics[0] === process.env.REFERRAL_INCOME_RECEIVED,
  //     );

  //     for (const log of paymentLogs) {
  //       try {
  //         const parsedLog = this.ethersService.paymentInterface.parseLog(log);
  //         console.log('Parsed Log:', parsedLog.args);
  //         const ref = await this.referrlaTransaction.findOne({
  //           transactionHash: transaction.transactionHash,
  //         });
  //         console.log(ref);
  //         if (!ref) {
  //           await this.referrlaTransaction.create({
  //             transactionHash: transaction.transactionHash,
  //             referrer: parsedLog.args[0],
  //             buyer: parsedLog.args[1],
  //             buyAmount: this.BigToNumber(parsedLog.args[2]),
  //             referralIncome: this.BigToNumber(parsedLog.args[3]),
  //             token: parsedLog.args[4],
  //             chain: ChainEnum.BINANCE,
  //           });
  //           console.log('done');
  //         }
  //       } catch (error) {
  //         console.error('Failed to parse filtered log:', error);
  //       }
  //     }
  //   }
  // }

  // async updateUsdAmountPerStake() {
  //   const transactions = await this.Transaction.find({
  //     stakingStatus: StakingStatus.STAKED,
  //   });

  //   // console.log({ transactions });

  //   await Promise.all(
  //     transactions.map(async (transaction) => {
  //       const staking = await this.StakingModel.findOne({
  //         txHash: transaction.distributionHash,
  //         isReferred: false,
  //       });
  //       if (staking) {
  //         if (transaction.chain === ChainEnum.BINANCE) {
  //           await this.StakingModel.findByIdAndUpdate(staking._id, {
  //             usdAmount: this.BigToNumber(
  //               parseEther(formatUnits(transaction.amountBigNumber, 18)),
  //             ),
  //           });
  //         } else {
  //           console.log(
  //             `Ethereum - ${this.BigToNumber(parseEther(formatUnits(transaction.amountBigNumber, 6)))}`,
  //           );
  //           await this.StakingModel.findByIdAndUpdate(staking._id, {
  //             usdAmount: this.BigToNumber(
  //               parseEther(formatUnits(transaction.amountBigNumber, 6)),
  //             ),
  //           });
  //         }
  //       }
  //     }),
  //   );
  //   console.log('done');
  // }

  // private hasRun = false;
  @Cron(CronExpression.EVERY_10_SECONDS)
  handleCron() {
    // if (this.hasRun) {
    //   return;
    // }
    // this.hasRun = true;
    this.syncPaymentReceived(899);
    this.syncEthereumPaymentReceived(199);
    // this.MigratePresaleData();
    // this.createRefIncomeMigrate();
    // this.updatePresaleTransaction();
    // this.numberrr(BigInt(12500000000000000000000));
    // this.updateNewReferrals();
    // this.MigrateData();
    // this.updateTransactions();
    // this.updateStakes();
    // this.saveStakeTransactionMigrate(
    //   '0x6c2feb2448781cc00ce13837fce4178b914dc6d517f24cf26bddbaef5ac715de',
    //   '0x6a03f4383bcADBCf8B948a8A4058E07C55E7068b',
    //   12,
    // );
    // this.updateUsdAmountPerStake();
  }
}
